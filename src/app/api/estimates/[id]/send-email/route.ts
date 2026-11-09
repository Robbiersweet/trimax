import { issueEmailReview, verifyEmailReview, approvedAttachments, reviewDigest } from "../../../../lib/documentEmailReview";
import { renderDocumentEmail } from "../../../../lib/documentEmailBranding";
import { validateEmailEdits } from "../../../../lib/documentEmailPolicy";
import { estimateMoney, estimateDepositSentence } from "../../../../lib/documentEmailPolicy";
import { formatDocumentMoney as formatMoney } from "../../../../lib/documentEmailPolicy";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  defaultInvoiceEmailSettings,
  formatSenderAddress,
  normalizeInvoiceEmailSettings,
  resolveWorkspaceSenderEmail,
} from "../../../../lib/invoiceEmailSettings";
import {
  detectClientIdentityConflict,
  type ClientIdentityRecord,
} from "../../../../lib/clientIdentity";
import {
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
      business_settings: GenericTable;
      business_users: GenericTable;
      businesses: GenericTable;
      clients: GenericTable;
      estimates: GenericTable;
      estimate_line_items: GenericTable;
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

type EstimateRow = {
  id: string;
  business_id: string;
  client_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  estimate_amount: string | number | null;
  terms: string | null;
  tax_mode: string | null;
  tax_rate: string | number | null;
  reference: string | null;
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
  id: string;
  name: string | null;
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

  if (error || !data || !["owner", "admin"].includes(String(data.role).toLowerCase())) {
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
  idempotencyKey,
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
  idempotencyKey: string;
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
      "Idempotency-Key": idempotencyKey,
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

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: string; name?: string }
    | null;

  if (!response.ok || !payload?.id) {

    return {
      ok: false,
      status: response.ok ? 502 : response.status,
      error:
        payload?.message ??
        payload?.error ??
        "The email provider rejected this message.",
      providerResponse: payload,
    };
  }

  return {
    ok: true,
    status: response.status,
    error: null,
    providerResponse: payload,
  };
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
  const preflightOnly = body.preflightOnly === true;
  if (!preflightOnly && (body.finalApproval !== true || typeof body.reviewToken !== "string")) return NextResponse.json({error:"Review Email and explicit final approval are required. No email was sent."},{status:409});
  const recipientEmail = cleanText(body.recipientEmail, 200).toLowerCase();
  let subject = cleanText(body.subject, 240) || (body.mode === "prepare" ? "Estimate" : "");
  let message = cleanText(body.message, 10000) || (body.mode === "prepare" ? "Preparing estimate review" : "");
  const replyToEmail = cleanText(body.replyToEmail, 200).toLowerCase();
  const businessSlug = cleanText(body.businessSlug, 80);
  const includePdfNote = true;

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
      "id, business_id, client_id, display_id, customer_name, project_title, project_address, service_address, estimate_amount, reference, status, terms, tax_mode, tax_rate"
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

  const { data: clientIdentityData, error: clientIdentityError } = await supabase
    .from("clients")
    .select("id, name, property_aliases, email, cc_email")
    .eq("business_id", estimate.business_id);
  const authoritativeClient = (clientIdentityData ?? []).find(client => client.id === estimate.client_id);
  if (clientIdentityError || !authoritativeClient || (recipientEmail !== String(authoritativeClient.email ?? "").trim().toLowerCase() && (clientIdentityData ?? []).some(c=>c.id!==estimate.client_id && String(c.email ?? "").trim().toLowerCase()===recipientEmail))) {
    return NextResponse.json({ error: "Customer and property do not match. Review before continuing." }, { status: 409 });
  }
  const clientIdentityConflict = detectClientIdentityConflict({
    clients: (clientIdentityData ?? []) as ClientIdentityRecord[],
    currentClientId: estimate.client_id,
    customerName: estimate.customer_name,
    projectTitle: estimate.project_title,
  });

  if (clientIdentityConflict.hasConflict) {
    return NextResponse.json(
      {
        error:
          clientIdentityConflict.message ??
          "Customer and property do not match. Review before continuing.",
        code: "client_identity_conflict",
        matchedClientId: clientIdentityConflict.matchedClientId,
        matchedClientName: clientIdentityConflict.matchedClientName,
      },
      { status: 409 }
    );
  }

  const { data: emailSettingsRow } = await supabase
    .from("business_settings")
    .select("value")
    .eq("business_id", business.id)
    .eq("key", "email_settings")
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
  const { data: clientEmailRoute } = estimate.client_id
    ? await supabase
        .from("clients")
        .select("id, name, cc_email")
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
  const requestedCcEmail = cleanText(body.ccEmail,200).toLowerCase();
  if(requestedCcEmail && !isValidEmail(requestedCcEmail)) return NextResponse.json({error:"Review CC email."},{status:400});
  const ccEmail = Object.hasOwn(body,"ccEmail") ? requestedCcEmail : isValidEmail(clientCcEmail)
    ? clientCcEmail
    : isValidEmail(fallbackCcEmail)
      ? fallbackCcEmail
      : "";
  const ccSource = ccEmail ? ccEmail === clientCcEmail ? "client" : ccEmail === fallbackCcEmail ? "workspace" : "review" : null;
  const bccEmail = emailSettings.bccEmail.trim().toLowerCase();

  const effectiveReplyToEmail = replyToEmail || emailSettings.replyToEmail.trim().toLowerCase() || access.email;
  if ((effectiveReplyToEmail && !isValidEmail(effectiveReplyToEmail)) || (bccEmail && !isValidEmail(bccEmail))) return NextResponse.json({error:"Review the workspace reply-to and BCC email settings before sending."},{status:400});
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
  const {data: rows,error: rowsError} = await supabase.from("estimate_line_items").select("*").eq("business_id",estimate.business_id).eq("estimate_id",estimate.id);
  if(rowsError) return NextResponse.json({error:"Could not revalidate estimate rows."},{status:503});
  let facts: string;
  try {
    const amounts=estimateMoney(estimate,(rows ?? []) as {line_total:string|number|null}[]);
    const deposit=estimateDepositSentence(amounts.total,estimate.terms);
    facts=["Document details",`Estimate: ${estimate.display_id || estimate.id}`,`Customer: ${estimate.customer_name || ""}`,`Project estimate: ${formatMoney(amounts.total)}`,deposit,`Terms: ${estimate.terms || ""}`].filter(Boolean).join("\n");
  } catch(error) { return NextResponse.json({error:(error as Error).message},{status:409}); }
  const canonicalSubject=`Estimate ${estimate.display_id || ""}`;
  if(body.mode === "prepare") { subject=`Estimate ${estimate.display_id || ""}`; message=`Hello,\n\nPlease review the attached estimate.\n\n${facts}\n\nThank you.`; }
  try { validateEmailEdits(subject,message,facts,canonicalSubject); } catch(error) { return NextResponse.json({error:(error as Error).message},{status:409}); }
  const renderedEmail=renderDocumentEmail(message,business.slug,business.name || "Trimax");
  const reviewSnapshot={kind:"estimate",user:access.userId,estimate,client:authoritativeClient,rows,settings:emailSettings,recipientEmail,ccEmail,bccEmail,from,replyToEmail:effectiveReplyToEmail,subject,renderedEmail};
  let pdfAttachment: EmailAttachment | null = null;
  let pdfAttachmentSource: "print-page" | "none" =
    "none";

  if (!preflightOnly) {
    try { const reviewed=approvedAttachments(body.reviewAttachments);verifyEmailReview(body.reviewToken,body.finalApproval,reviewSnapshot,reviewed);if(reviewed.length!==1) throw Error("Review the estimate PDF.");pdfAttachment=reviewed[0];pdfAttachmentSource="print-page"; } catch(error) {return NextResponse.json({error:(error as Error).message},{status:409});}
  }
  if (includePdfNote && preflightOnly) {
    try {
      pdfAttachment = await createPrintPagePdfAttachment({
        url: new URL(
          `/estimates/${estimate.id}/print?business=${business.slug}`,
          request.url
        ).toString(),
        filename: estimate.display_id ?? "estimate",
        accessToken:token,
        requestSession:{origin:new URL(request.url).origin,cookie:request.headers.get("cookie")},
      });
      pdfAttachmentSource = "print-page";
    } catch (error) {
      console.error("Official estimate PDF render failed.", error);
      return NextResponse.json(
        {
          error:
            "Trimax could not create the official customer estimate PDF, so the email was not sent. Please try Preview Estimate, then send again.",
        },
        { status: 502 }
      );
    }
  }

  const html=renderedEmail.html;
  if(preflightOnly) return NextResponse.json({ready:true,subject,message,html,facts,from,replyToEmail:effectiveReplyToEmail,recipientEmail,ccEmail,bccEmail,attachments:[pdfAttachment],reviewToken:issueEmailReview(reviewSnapshot,[pdfAttachment!])});

  const sendResult = await sendWithResend({
    from,
    to: recipientEmail,
    replyTo: effectiveReplyToEmail,
    cc: ccEmail || null,
    bcc: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
    subject,
    html,
    text: renderedEmail.text,
    attachments: pdfAttachment ? [pdfAttachment] : undefined,
    idempotencyKey:`trimax-estimate-${reviewDigest(body.reviewToken)}`,
  });

  if (!sendResult.ok) {
    await supabase.from("activity_logs").insert({
      business_id: estimate.business_id,
      actor_user_id: access.userId,
      actor_email: access.email,
      action: "estimate.email_failed",
      entity_type: "estimate",
      entity_id: estimate.id,
      entity_label: estimate.display_id ?? estimate.project_title ?? "Estimate",
      details: {
        business_profile: business.slug,
        document_number: estimate.display_id ?? "Estimate",
        recipient_email: recipientEmail,
        subject,
        sender_email: senderEmail,
        cc_email: ccEmail || null,
        cc_source: ccSource,
        bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
        pdf_attached: Boolean(pdfAttachment),
        pdf_attachment_source: pdfAttachmentSource,
        provider: "resend",
        provider_status: sendResult.status,
        provider_response: sendResult.providerResponse ?? null,
        failure_message: sendResult.error,
      },
    });

    return NextResponse.json(
      { error: sendResult.error },
      { status: sendResult.status }
    );
  }

  const {error:statusUpdateError} = await supabase
    .from("estimates")
    .update({
      status: "Sent",
    })
    .eq("id", estimate.id)
    .eq("business_id", estimate.business_id);

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
      business_profile: business.slug,
      document_number: estimate.display_id ?? "Estimate",
      subject,
      sender_email: senderEmail,
      cc_email: ccEmail || null,
      cc_source: ccSource,
      bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
      pdf_attached: Boolean(pdfAttachment),
      pdf_attachment_source: pdfAttachmentSource,
      provider: "resend",
      provider_status: sendResult.status,
      provider_response: sendResult.providerResponse ?? null,
      delivery_status: "accepted",
      review_digest:reviewDigest(reviewSnapshot),
      status_update_error:statusUpdateError?.message ?? null,
    },
  });

  return NextResponse.json({
    statusUpdateError:statusUpdateError?.message ?? null,
    message: `${estimate.display_id ?? "Estimate"} was sent to ${recipientEmail}${
      ccEmail ? " and CC'd" : ""
    }${
      bccEmail && isValidEmail(bccEmail) ? " and privately copied." : "."
    }${pdfAttachment ? " PDF attached." : ""}`,
  });
}
