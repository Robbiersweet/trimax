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
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
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

function numberValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[$,]/g, ""));

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(Number.isFinite(value) ? value : 0);
}

function splitInvoiceAmount(invoice: InvoiceRow) {
  return numberValue(invoice.invoice_amount);
}

function baseSplitProjectTitle(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+-\s+Split\s+\d+\s+of\s+\d+$/i, "");
}

function splitGroupLabel(invoices: InvoiceRow[]) {
  const projectTitle = invoices
    .find((item) => item.project_title)
    ?.project_title?.trim();
  const baseProjectTitle = baseSplitProjectTitle(projectTitle);

  if (baseProjectTitle) {
    return baseProjectTitle;
  }

  const reference = invoices.find((item) => item.reference)?.reference?.trim();

  if (reference) {
    return `Unit ${reference}`;
  }

  return "Split invoice group";
}

function buildSplitGroupSummary(invoices: InvoiceRow[]) {
  const sortedInvoices = [...invoices].sort(
    (first, second) =>
      (first.split_sequence ?? 0) - (second.split_sequence ?? 0)
  );
  const lines = sortedInvoices.map((item) => ({
    documentNumber: item.display_id ?? "Invoice",
    amount: splitInvoiceAmount(item),
    splitLabel:
      item.split_sequence && item.split_count
        ? `Split ${item.split_sequence} of ${item.split_count}`
        : null,
  }));
  const combinedTotal = lines.reduce((sum, item) => sum + item.amount, 0);

  return { lines, combinedTotal };
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

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: string; name?: string }
    | null;

  if (!response.ok) {

    return {
      ok: false,
      status: response.status,
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
  const recipientEmail = cleanText(body.recipientEmail, 200).toLowerCase();
  const subject = cleanText(body.subject, 240);
  const message = cleanText(body.message, 5000);
  const replyToEmail = cleanText(body.replyToEmail, 200).toLowerCase();
  const businessSlug = cleanText(body.businessSlug, 80);
  const sendSplitGroup = Boolean(body.sendSplitGroup);
  const attachOfficialPdf = true;
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
      "id, business_id, client_id, display_id, customer_name, project_title, invoice_amount, amount_paid, due_date, issue_date, reference, service_address, status, split_parent_invoice_id, split_sequence, split_count"
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
  let targetInvoices = [invoice];
  const splitGroupRootId = invoice.split_parent_invoice_id ?? invoice.id;

  if (sendSplitGroup && emailPurpose !== "reminder") {
    const { data: splitInvoices, error: splitInvoicesError } = await supabase
      .from("invoices")
      .select(
        "id, business_id, client_id, display_id, customer_name, project_title, invoice_amount, amount_paid, due_date, issue_date, reference, service_address, status, split_parent_invoice_id, split_sequence, split_count"
      )
      .eq("business_id", invoice.business_id)
      .eq("split_parent_invoice_id", splitGroupRootId)
      .order("split_sequence", { ascending: true })
      .returns<InvoiceRow[]>();

    if (splitInvoicesError) {
      return NextResponse.json(
        { error: "Trimax could not load the split invoice group." },
        { status: 500 }
      );
    }

    if (splitInvoices && splitInvoices.length > 0) {
      targetInvoices = splitInvoices;
    }
  }

  const isSplitGroupSend =
    sendSplitGroup && emailPurpose !== "reminder" && targetInvoices.length > 1;
  const { lines: splitSummaryLines, combinedTotal } =
    buildSplitGroupSummary(targetInvoices);
  const groupLabel = splitGroupLabel(targetInvoices);
  const effectiveSubject = isSplitGroupSend
    ? `${groupLabel} - Split invoices`
    : subject;
  const splitSummaryText = isSplitGroupSend
    ? [
        "",
        "This invoice was split because of the billing limit. Each official invoice PDF is attached to this one email.",
        "Attached invoices:",
        ...splitSummaryLines.map(
          (item) =>
            `- ${item.documentNumber} - ${formatCurrency(item.amount)}${
              item.splitLabel ? ` (${item.splitLabel})` : ""
            }`
        ),
        `Combined Total - ${formatCurrency(combinedTotal)}`,
      ].join("\n")
    : "";
  const effectiveMessage = isSplitGroupSend
    ? `${message}\n${splitSummaryText}`
    : message;
  const pdfAttachments: EmailAttachment[] = [];
  let pdfAttachmentSource: "print-page" | "none" = "none";

  if (attachOfficialPdf) {
    for (const targetInvoice of targetInvoices) {
      const targetDocumentNumber = targetInvoice.display_id ?? "Invoice";

      try {
        const attachment = await createPrintPagePdfAttachment({
          url: new URL(
            `/invoices/${targetInvoice.id}/print?business=${business.slug}`,
            request.url
          ).toString(),
          filename: targetDocumentNumber,
        });

        pdfAttachments.push(attachment);
        pdfAttachmentSource = "print-page";
      } catch (error) {
        const failureMessage =
          error instanceof Error ? error.message : "Unknown PDF render failure.";

        console.error("Official invoice PDF render failed.", error);
        await supabase.from("activity_logs").insert({
          business_id: targetInvoice.business_id,
          actor_user_id: access.userId,
          actor_email: access.email,
          action: isSplitGroupSend
            ? "invoice.split_group_email_failed"
            : "invoice.email_failed",
          entity_type: "invoice",
          entity_id: targetInvoice.id,
          entity_label:
            targetInvoice.display_id ?? targetInvoice.project_title ?? "Invoice",
          details: {
            business_profile: business.slug,
            document_number: targetDocumentNumber,
            included_invoice_ids: targetInvoices.map((item) => item.id),
            included_invoice_numbers: targetInvoices.map(
              (item) => item.display_id ?? "Invoice"
            ),
            recipient_email: recipientEmail,
            subject: effectiveSubject,
            sender_email: senderEmail,
            cc_email: ccEmail || null,
            cc_source: ccSource,
            bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
            pdf_attached: false,
            pdf_attachment_source: "print-page",
            split_group_send: isSplitGroupSend,
            split_group_root_id: splitGroupRootId,
            failure_stage: "pdf_generation",
            failure_invoice_id: targetInvoice.id,
            failure_invoice_number: targetDocumentNumber,
            failure_message: failureMessage,
          },
        });

        return NextResponse.json(
          {
            error: isSplitGroupSend
              ? `Trimax could not generate the PDF for ${targetDocumentNumber}, so the split group email was not sent. No invoice statuses were changed.`
              : "Trimax could not generate the official invoice PDF, so nothing was sent. Refresh the invoice and try Send Invoice again. If this keeps happening, check that the invoice print view opens correctly.",
            failedInvoiceId: targetInvoice.id,
            failedInvoiceNumber: targetDocumentNumber,
          },
          { status: 502 }
        );
      }
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
        <p style="font-size: 16px;">${plainTextToHtml(effectiveMessage)}</p>
        ${
          attachOfficialPdf
            ? `<p style="font-size: 14px; color: #52677c;">${
                isSplitGroupSend
                  ? `${pdfAttachments.length} official invoice PDFs are attached.`
                  : "A PDF copy is attached."
              }</p>`
            : ""
        }
      </div>
    </div>
  `;

  const sendResult = await sendWithResend({
    from,
    to: recipientEmail,
    replyTo: replyToEmail || access.email,
    cc: ccEmail || null,
    bcc: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
    subject: effectiveSubject,
    html,
    text: effectiveMessage,
    attachments: pdfAttachments.length > 0 ? pdfAttachments : undefined,
  });

  if (!sendResult.ok) {
    const failureDetails = {
      business_profile: business.slug,
      included_invoice_ids: targetInvoices.map((item) => item.id),
      included_invoice_numbers: targetInvoices.map(
        (item) => item.display_id ?? "Invoice"
      ),
      recipient_email: recipientEmail,
      subject: effectiveSubject,
      sender_email: senderEmail,
      cc_email: ccEmail || null,
      cc_source: ccSource,
      bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
      pdf_attached: pdfAttachments.length > 0,
      pdf_attachment_source: pdfAttachmentSource,
      split_group_send: isSplitGroupSend,
      split_group_root_id: splitGroupRootId,
      provider: "resend",
      provider_status: sendResult.status,
      provider_response: sendResult.providerResponse ?? null,
      failure_stage: "email_delivery",
      failure_message: sendResult.error,
    };

    await supabase.from("activity_logs").insert({
      business_id: invoice.business_id,
      actor_user_id: access.userId,
      actor_email: access.email,
      action:
        emailPurpose === "reminder"
          ? "invoice.payment_reminder_failed"
          : isSplitGroupSend
            ? "invoice.split_group_email_failed"
            : "invoice.email_failed",
      entity_type: "invoice",
      entity_id: invoice.id,
      entity_label: invoice.display_id ?? invoice.project_title ?? "Invoice",
      details: failureDetails,
    });

    return NextResponse.json(
      {
        error: isSplitGroupSend
          ? `Trimax could not send the split group email, so no invoice statuses were changed. ${sendResult.error}`
          : sendResult.error,
      },
      { status: sendResult.status }
    );
  }

  let statusUpdateErrorMessage: string | null = null;

  if (emailPurpose !== "reminder") {
    const { error: statusUpdateError } = await supabase
      .from("invoices")
      .update({
        status: "sent",
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        targetInvoices.map((targetInvoice) => targetInvoice.id)
      );

    if (statusUpdateError) {
      statusUpdateErrorMessage = statusUpdateError.message;
      console.error("Invoice status update failed after send.", statusUpdateError);
    }
  }

  if (isSplitGroupSend) {
    await supabase.from("activity_logs").insert({
      business_id: invoice.business_id,
      actor_user_id: access.userId,
      actor_email: access.email,
      action: "invoice.split_group_email_sent",
      entity_type: "invoice",
      entity_id: splitGroupRootId,
      entity_label: groupLabel,
      details: {
        recipient_email: recipientEmail,
        business_profile: business.slug,
        included_invoice_ids: targetInvoices.map((item) => item.id),
        included_invoice_numbers: splitSummaryLines.map(
          (item) => item.documentNumber
        ),
        included_invoice_totals: splitSummaryLines.map((item) => ({
          document_number: item.documentNumber,
          amount: item.amount,
          amount_label: formatCurrency(item.amount),
          split_label: item.splitLabel,
        })),
        combined_total: combinedTotal,
        combined_total_label: formatCurrency(combinedTotal),
        subject: effectiveSubject,
        sender_email: senderEmail,
        cc_email: ccEmail || null,
        cc_source: ccSource,
        bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
        pdf_attached: pdfAttachments.length > 0,
        pdf_attachment_count: pdfAttachments.length,
        pdf_attachment_source: pdfAttachmentSource,
        split_group_send: true,
        split_group_root_id: splitGroupRootId,
        provider: "resend",
        provider_status: sendResult.status,
        provider_response: sendResult.providerResponse ?? null,
        delivery_status: "sent",
        status_update_error: statusUpdateErrorMessage,
      },
    });
  }

  for (const targetInvoice of targetInvoices) {
    const targetDocumentNumber = targetInvoice.display_id ?? "Invoice";

    await supabase.from("activity_logs").insert({
      business_id: targetInvoice.business_id,
      actor_user_id: access.userId,
      actor_email: access.email,
      action:
        emailPurpose === "reminder"
          ? "invoice.payment_reminder_sent"
          : "invoice.email_sent",
      entity_type: "invoice",
      entity_id: targetInvoice.id,
      entity_label:
        targetInvoice.display_id ?? targetInvoice.project_title ?? "Invoice",
      details: {
        recipient_email: recipientEmail,
        business_profile: business.slug,
        document_number: targetDocumentNumber,
        subject: effectiveSubject,
        sender_email: senderEmail,
        cc_email: ccEmail || null,
        cc_source: ccSource,
        bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
        pdf_attached: pdfAttachments.length > 0,
        pdf_attachment_source: pdfAttachmentSource,
        split_group_send: isSplitGroupSend,
        split_group_root_id: splitGroupRootId,
        ...(isSplitGroupSend
          ? {
              included_invoice_ids: targetInvoices.map((item) => item.id),
              included_invoice_numbers: targetInvoices.map(
                (item) => item.display_id ?? "Invoice"
              ),
            }
          : {}),
        provider: "resend",
        provider_status: sendResult.status,
        provider_response: sendResult.providerResponse ?? null,
        delivery_status: "sent",
        status_update_error: statusUpdateErrorMessage,
      },
    });
  }

  const successMessage = isSplitGroupSend
    ? statusUpdateErrorMessage
      ? `Split group email was sent to ${recipientEmail} with ${pdfAttachments.length} PDFs attached, but Trimax could not update the invoice sent statuses automatically. Proof was saved; refresh and review the split invoices.`
      : `Split group sent to ${recipientEmail} with ${pdfAttachments.length} PDFs attached. ${targetInvoices.length} invoices were marked sent.`
    : emailPurpose === "reminder"
      ? `Payment reminder for ${
          invoice.display_id ?? "Invoice"
        } was sent to ${recipientEmail}${ccEmail ? " and CC'd." : ""}${
          bccEmail && isValidEmail(bccEmail) ? " It was privately copied." : "."
        } PDF attached.`
      : statusUpdateErrorMessage
        ? `${invoice.display_id ?? "Invoice"} was sent to ${recipientEmail}, but Trimax could not update the invoice sent status automatically. Proof was saved; refresh and review the invoice.`
        : `${invoice.display_id ?? "Invoice"} was sent to ${recipientEmail}${
            ccEmail ? " and CC'd" : ""
          }${
            bccEmail && isValidEmail(bccEmail) ? " and privately copied." : "."
          } PDF attached.`;

  return NextResponse.json(
    {
      message: successMessage,
      sentCount: targetInvoices.length,
      attachmentCount: pdfAttachments.length,
      includedInvoices: targetInvoices.map((targetInvoice) => ({
        id: targetInvoice.id,
        documentNumber: targetInvoice.display_id ?? "Invoice",
        amount: splitInvoiceAmount(targetInvoice),
      })),
      statusUpdateError: statusUpdateErrorMessage,
    },
    { status: statusUpdateErrorMessage ? 207 : 200 }
  );
}
