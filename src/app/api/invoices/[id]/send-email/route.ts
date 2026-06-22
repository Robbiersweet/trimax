import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  defaultInvoiceEmailSettings,
  emailSettingsKey,
  formatSenderAddress,
  normalizeInvoiceEmailSettings,
  resolveWorkspaceSenderEmail,
} from "../../../../lib/invoiceEmailSettings";
import {
  createPdfAttachment,
  type EmailAttachment,
} from "../../../../lib/pdfAttachments";
import { createPrintPagePdfAttachment } from "../../../../lib/printPagePdf";

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
      invoices: GenericTable;
      invoice_line_items: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteParams = {
  params: Promise<{ id: string }>;
};

type InvoiceRow = {
  id: string;
  business_id: string;
  client_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  due_date: string | null;
  issue_date: string | null;
  reference: string | null;
  service_address: string | null;
  status: string | null;
};

type InvoiceLineItemRow = {
  description: string | null;
  quantity: string | number | null;
  unit_price: string | number | null;
  line_total: string | number | null;
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

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
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
  attachments,
}: {
  from: string;
  to: string;
  replyTo: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
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
      ...(attachments?.length ? { attachments } : {}),
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
  const emailPurpose =
    cleanText(body.emailPurpose, 40) === "reminder" ? "reminder" : "send";

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

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, business_id, client_id, display_id, customer_name, project_title, invoice_amount, amount_paid, due_date, issue_date, reference, service_address, status"
    )
    .eq("id", id)
    .limit(1)
    .maybeSingle<InvoiceRow>();

  if (invoiceError || !invoice) {
    return NextResponse.json(
      { error: "Trimax could not find this invoice." },
      { status: 404 }
    );
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, slug, name")
    .eq("id", invoice.business_id)
    .limit(1)
    .maybeSingle<BusinessRow>();

  if (
    businessError ||
    !business ||
    (businessSlug && business.slug !== businessSlug)
  ) {
    return NextResponse.json(
      { error: "This invoice does not match the selected workspace." },
      { status: 403 }
    );
  }

  const access = await requireWorkspaceAccess({
    supabase,
    token,
    businessId: invoice.business_id,
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
  const senderEmail = resolveWorkspaceSenderEmail({
    senderEmail: emailSettings.senderEmail,
    businessSlug: business.slug,
    environmentSenderEmail: process.env.TRIMAX_EMAIL_FROM,
  });
  const { data: clientEmailRoute } = invoice.client_id
    ? await supabase
        .from("clients")
        .select("cc_email")
        .eq("id", invoice.client_id)
        .eq("business_id", invoice.business_id)
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
  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select("description, quantity, unit_price, line_total")
    .eq("invoice_id", invoice.id)
    .order("sort_order", { ascending: true })
    .returns<InvoiceLineItemRow[]>();
  const total = parseMoney(invoice.invoice_amount);
  const amountPaid = parseMoney(invoice.amount_paid);
  const amountDue = Math.max(total - amountPaid, 0);
  const fallbackPdfAttachment = includePdfNote
    ? createPdfAttachment({
        filename: invoice.display_id ?? "invoice",
        title: invoice.display_id ?? "Invoice",
        subtitle: business.name ?? "Trimax",
        sections: [
          {
            title: "Customer",
            lines: [
              invoice.customer_name ?? "Customer",
              invoice.project_title ? `Project: ${invoice.project_title}` : "",
              invoice.service_address
                ? `Service address: ${invoice.service_address}`
                : "",
              invoice.reference ? `Reference: ${invoice.reference}` : "",
            ].filter(Boolean),
          },
          {
            title: "Dates",
            lines: [
              `Issue date: ${formatDate(invoice.issue_date)}`,
              `Due date: ${formatDate(invoice.due_date)}`,
            ],
          },
          {
            title: "Line Items",
            lines:
              lineItems && lineItems.length > 0
                ? lineItems.map(
                    (item) =>
                      `${item.description ?? "Line item"} - Rate ${formatMoney(
                        parseMoney(item.unit_price)
                      )} - Qty ${
                        item.quantity ?? 1
                      } - Total ${formatMoney(parseMoney(item.line_total))}`
                  )
                : ["Line items are available in Trimax."],
          },
          {
            title: "Totals",
            lines: [
              `Total: ${formatMoney(total)}`,
              `Amount paid: ${formatMoney(amountPaid)}`,
              `Amount due: ${formatMoney(amountDue)}`,
            ],
          },
        ],
      })
    : null;
  let pdfAttachment = fallbackPdfAttachment;
  let pdfAttachmentSource: "print-page" | "fallback" | "none" =
    fallbackPdfAttachment ? "fallback" : "none";

  if (includePdfNote) {
    try {
      pdfAttachment = await createPrintPagePdfAttachment({
        url: new URL(
          `/invoices/${invoice.id}/print?business=${business.slug}`,
          request.url
        ).toString(),
        filename: invoice.display_id ?? "invoice",
      });
      pdfAttachmentSource = "print-page";
    } catch (error) {
      console.warn("Print-page PDF render failed. Using fallback PDF.", error);
    }
  }

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
            ? `<p style="font-size: 14px; color: #52677c;">A PDF copy is attached.</p>`
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
    attachments: pdfAttachment ? [pdfAttachment] : undefined,
  });

  if (!sendResult.ok) {
    return NextResponse.json(
      { error: sendResult.error },
      { status: sendResult.status }
    );
  }

  if (emailPurpose !== "reminder") {
    await supabase
      .from("invoices")
      .update({
        status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
  }

  await supabase.from("activity_logs").insert({
    business_id: invoice.business_id,
    actor_user_id: access.userId,
    actor_email: access.email,
    action:
      emailPurpose === "reminder"
        ? "invoice.payment_reminder_sent"
        : "invoice.email_sent",
    entity_type: "invoice",
    entity_id: invoice.id,
    entity_label: invoice.display_id ?? invoice.project_title ?? "Invoice",
    details: {
      recipient_email: recipientEmail,
      subject,
      sender_email: senderEmail,
      cc_email: ccEmail || null,
      cc_source: ccSource,
      bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
      pdf_attached: Boolean(pdfAttachment),
      pdf_attachment_source: pdfAttachmentSource,
    },
  });

  return NextResponse.json({
    message:
      emailPurpose === "reminder"
        ? `Payment reminder for ${
            invoice.display_id ?? "Invoice"
          } was sent to ${recipientEmail}${ccEmail ? " and CC'd." : ""}${
            bccEmail && isValidEmail(bccEmail) ? " It was privately copied." : "."
          }${pdfAttachment ? " PDF attached." : ""}`
        : `${invoice.display_id ?? "Invoice"} was sent to ${recipientEmail}${
            ccEmail ? " and CC'd" : ""
          }${
            bccEmail && isValidEmail(bccEmail) ? " and privately copied." : "."
          }${pdfAttachment ? " PDF attached." : ""}`,
  });
}
