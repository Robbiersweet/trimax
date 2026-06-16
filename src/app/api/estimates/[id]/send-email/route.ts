import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  defaultInvoiceEmailSettings,
  emailSettingsKey,
  formatSenderAddress,
  normalizeInvoiceEmailSettings,
} from "../../../../lib/invoiceEmailSettings";

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type Database = {
  public: {
    Tables: {
      activity_logs: GenericTable;
      app_settings: GenericTable;
      business_users: GenericTable;
      businesses: GenericTable;
      clients: GenericTable;
      estimates: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

type RouteParams = {
  params: Promise<{ id: string }>;
};

type EstimateRow = {
  id: string;
  business_id: string;
  client_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
};

type BusinessRow = {
  id: string;
  slug: string;
  name: string | null;
};

type BusinessUserRow = {
  id: string;
  role: string | null;
};

type ClientEmailRouteRow = {
  cc_email: string | null;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function plainTextToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requireWorkspaceAccess({
  supabase,
  token,
  businessId,
}: {
  supabase: AdminClient;
  token: string | null;
  businessId: string;
}) {
  if (!token) {
    return { ok: false, email: null, userId: null };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false, email: null, userId: null };
  }

  const userEmail = userData.user.email?.toLowerCase() ?? "";

  const { data, error } = await supabase
    .from("business_users")
    .select("id, role")
    .eq("business_id", businessId)
    .or(`user_id.eq.${userData.user.id},email.ilike.${userEmail}`)
    .limit(1)
    .maybeSingle<BusinessUserRow>();

  if (error || !data) {
    return {
      ok: false,
      email: userData.user.email ?? null,
      userId: userData.user.id,
    };
  }

  return {
    ok: true,
    email: userData.user.email ?? null,
    userId: userData.user.id,
  };
}

async function sendWithResend({
  from,
  to,
  replyTo,
  cc,
  bcc,
  subject,
  html,
  text,
}: {
  from: string;
  to: string;
  replyTo: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error:
        "Direct email is almost ready, but Trimax delivery has not been enabled for this installation yet. Once the app owner enables delivery, each workspace can manage its sender address in Settings.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(cc ? { cc: [cc] } : {}),
      ...(bcc ? { bcc: [bcc] } : {}),
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;

    return {
      ok: false,
      status: response.status,
      error:
        errorPayload?.message ??
        errorPayload?.error ??
        "The email provider rejected this message.",
    };
  }

  return { ok: true, status: response.status, error: null };
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Trimax is missing Supabase service configuration for secure sending.",
      },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const recipientEmail = cleanText(body.recipientEmail, 200).toLowerCase();
  const subject = cleanText(body.subject, 240);
  const message = cleanText(body.message, 5000);
  const replyToEmail = cleanText(body.replyToEmail, 200).toLowerCase();
  const businessSlug = cleanText(body.businessSlug, 80);
  const includePdfNote = Boolean(body.includePdfNote);

  if (!isValidEmail(recipientEmail)) {
    return NextResponse.json(
      { error: "Enter a valid customer email address." },
      { status: 400 }
    );
  }

  if (!subject || !message) {
    return NextResponse.json(
      { error: "Subject and message are required." },
      { status: 400 }
    );
  }

  if (replyToEmail && !isValidEmail(replyToEmail)) {
    return NextResponse.json(
      { error: "Enter a valid reply-to email address." },
      { status: 400 }
    );
  }

  const { data: estimate, error: estimateError } = await supabase
    .from("estimates")
    .select(
      "id, business_id, client_id, display_id, customer_name, project_title, status"
    )
    .eq("id", id)
    .limit(1)
    .maybeSingle<EstimateRow>();

  if (estimateError || !estimate) {
    return NextResponse.json(
      { error: "Trimax could not find this estimate." },
      { status: 404 }
    );
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, slug, name")
    .eq("id", estimate.business_id)
    .limit(1)
    .maybeSingle<BusinessRow>();

  if (
    businessError ||
    !business ||
    (businessSlug && business.slug !== businessSlug)
  ) {
    return NextResponse.json(
      { error: "This estimate does not match the selected workspace." },
      { status: 403 }
    );
  }

  const access = await requireWorkspaceAccess({
    supabase,
    token,
    businessId: estimate.business_id,
  });

  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: emailSettingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", emailSettingsKey(business.slug))
    .maybeSingle<{ value: unknown }>();
  const emailSettings = normalizeInvoiceEmailSettings(
    emailSettingsRow?.value,
    defaultInvoiceEmailSettings({
      businessSlug: business.slug,
      businessName: business.name ?? "Trimax",
      currentEmail: access.email,
    })
  );
  const senderEmail =
    emailSettings.senderEmail.trim() || process.env.TRIMAX_EMAIL_FROM || "";
  const { data: clientEmailRoute } = estimate.client_id
    ? await supabase
        .from("clients")
        .select("cc_email")
        .eq("id", estimate.client_id)
        .eq("business_id", estimate.business_id)
        .limit(1)
        .maybeSingle<ClientEmailRouteRow>()
    : { data: null };
  const clientCcEmail = cleanText(
    clientEmailRoute?.cc_email,
    200
  ).toLowerCase();
  const fallbackCcEmail = emailSettings.ccEmail.trim().toLowerCase();
  const ccEmail = isValidEmail(clientCcEmail)
    ? clientCcEmail
    : isValidEmail(fallbackCcEmail)
      ? fallbackCcEmail
      : "";
  const ccSource = ccEmail
    ? ccEmail === clientCcEmail
      ? "client"
      : "workspace"
    : null;
  const bccEmail = emailSettings.bccEmail.trim().toLowerCase();

  if (!senderEmail || !isValidEmail(senderEmail)) {
    return NextResponse.json(
      {
        error:
          "No sender address is connected for this workspace yet. Open Settings > Customer Email and add the address customers should see.",
      },
      { status: 503 }
    );
  }

  const from = formatSenderAddress({
    senderName: emailSettings.senderName || business.name || "Trimax",
    senderEmail,
  });

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f3347; line-height: 1.6; max-width: 640px; margin: 0 auto;">
      <div style="padding: 28px 0; text-align: center; border-bottom: 1px solid #d8e1ea;">
        <div style="font-size: 18px; font-weight: 800; color: #0f2a44;">${escapeHtml(
          business.name ?? "Trimax"
        )}</div>
      </div>
      <div style="padding: 34px 0;">
        <p style="font-size: 16px;">${plainTextToHtml(message)}</p>
        ${
          includePdfNote
            ? `<p style="font-size: 14px; color: #52677c;">A PDF copy should be attached once Trimax PDF attachments are connected.</p>`
            : ""
        }
      </div>
      <div style="padding: 18px 0; text-align: center; background: #eef2f6; color: #8a9aab; font-size: 13px;">
        Powered by Trimax
      </div>
    </div>
  `;

  const sendResult = await sendWithResend({
    from,
    to: recipientEmail,
    replyTo: replyToEmail || access.email,
    cc: ccEmail || null,
    bcc: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
    subject,
    html,
    text: message,
  });

  if (!sendResult.ok) {
    return NextResponse.json(
      { error: sendResult.error },
      { status: sendResult.status }
    );
  }

  await supabase
    .from("estimates")
    .update({
      status: "Sent",
    })
    .eq("id", estimate.id);

  await supabase.from("activity_logs").insert({
    business_id: estimate.business_id,
    actor_user_id: access.userId,
    actor_email: access.email,
    action: "estimate.email_sent",
    entity_type: "estimate",
    entity_id: estimate.id,
    entity_label: estimate.display_id ?? estimate.project_title ?? "Estimate",
    details: {
      recipient_email: recipientEmail,
      subject,
      sender_email: senderEmail,
      cc_email: ccEmail || null,
      cc_source: ccSource,
      bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
    },
  });

  return NextResponse.json({
    message: `${estimate.display_id ?? "Estimate"} was sent to ${recipientEmail}${
      ccEmail ? " and CC'd" : ""
    }${
      bccEmail && isValidEmail(bccEmail) ? " and privately copied." : "."
    }`,
  });
}
