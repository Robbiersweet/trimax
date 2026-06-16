import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  defaultInvoiceEmailSettings,
  emailSettingsKey,
  formatSenderAddress,
  normalizeInvoiceEmailSettings,
  renderEmailTemplate,
} from "../../../lib/invoiceEmailSettings";

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

type BusinessRow = {
  id: string;
  slug: string;
  name: string | null;
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
  status: string | null;
};

type ClientRow = {
  id: string;
  email: string | null;
  cc_email: string | null;
};

type ActivityRow = {
  entity_id: string | null;
  created_at: string | null;
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
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
        "Trimax delivery has not been enabled for this installation yet.",
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

export async function POST(request: Request) {
  const reminderSecret = process.env.TRIMAX_REMINDER_CRON_SECRET;

  if (!reminderSecret) {
    return NextResponse.json(
      { error: "Reminder automation is missing TRIMAX_REMINDER_CRON_SECRET." },
      { status: 503 }
    );
  }

  if (request.headers.get("x-trimax-cron-secret") !== reminderSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Reminder automation is missing Supabase settings." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    businessSlug?: string;
    dryRun?: boolean;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayInput = today.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  let businessQuery = supabase
    .from("businesses")
    .select("id, slug, name")
    .order("name", { ascending: true });

  if (body.businessSlug) {
    businessQuery = businessQuery.eq("slug", body.businessSlug);
  }

  const { data: businesses, error: businessError } =
    await businessQuery.returns<BusinessRow[]>();

  if (businessError) {
    return NextResponse.json(
      { error: "Trimax could not load businesses for reminders." },
      { status: 500 }
    );
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: { invoice: string; error: string }[] = [];

  for (const business of businesses ?? []) {
    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, business_id, client_id, display_id, customer_name, project_title, invoice_amount, amount_paid, due_date, status"
      )
      .eq("business_id", business.id)
      .lt("due_date", todayInput)
      .returns<InvoiceRow[]>();

    if (invoiceError) {
      failed.push({
        invoice: business.name ?? business.slug,
        error: "Could not load overdue invoices.",
      });
      continue;
    }

    const candidateInvoices = (invoices ?? []).filter((invoice) => {
      const status = String(invoice.status ?? "").toLowerCase();
      const amountDue =
        parseMoney(invoice.invoice_amount) - parseMoney(invoice.amount_paid);

      return amountDue > 0 && status !== "paid" && status !== "draft";
    });

    if (candidateInvoices.length === 0) {
      continue;
    }

    const clientIds = Array.from(
      new Set(
        candidateInvoices
          .map((invoice) => invoice.client_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const { data: clients } =
      clientIds.length > 0
        ? await supabase
            .from("clients")
            .select("id, email, cc_email")
            .in("id", clientIds)
            .returns<ClientRow[]>()
        : { data: [] };
    const clientEmails = new Map(
      (clients ?? []).map((client) => [client.id, client.email])
    );
    const clientCcEmails = new Map(
      (clients ?? []).map((client) => [client.id, client.cc_email])
    );
    const { data: recentLogs } = await supabase
      .from("activity_logs")
      .select("entity_id, created_at")
      .eq("business_id", business.id)
      .eq("action", "invoice.payment_reminder_sent")
      .gte("created_at", sevenDaysAgo.toISOString())
      .returns<ActivityRow[]>();
    const recentlyReminded = new Set(
      (recentLogs ?? [])
        .map((log) => log.entity_id)
        .filter((id): id is string => Boolean(id))
    );
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", emailSettingsKey(business.slug))
      .maybeSingle<{ value: unknown }>();
    const settings = normalizeInvoiceEmailSettings(
      setting?.value,
      defaultInvoiceEmailSettings({
        businessSlug: business.slug,
        businessName: business.name ?? "Trimax",
      })
    );
    const senderEmail =
      settings.senderEmail.trim() || process.env.TRIMAX_EMAIL_FROM || "";
    const fallbackCcEmail = settings.ccEmail.trim().toLowerCase();
    const bccEmail = settings.bccEmail.trim().toLowerCase();

    if (!senderEmail || !isValidEmail(senderEmail)) {
      failed.push({
        invoice: business.name ?? business.slug,
        error:
          "No sender address is configured for this workspace. Add one in Settings > Customer Email.",
      });
      continue;
    }

    const from = formatSenderAddress({
      senderName: settings.senderName || business.name || "Trimax",
      senderEmail,
    });

    for (const invoice of candidateInvoices) {
      const invoiceLabel = invoice.display_id ?? "Invoice";

      if (recentlyReminded.has(invoice.id)) {
        skipped.push(`${invoiceLabel}: reminded recently`);
        continue;
      }

      const recipient = invoice.client_id
        ? clientEmails.get(invoice.client_id) ?? ""
        : "";
      const clientCcEmail = invoice.client_id
        ? (clientCcEmails.get(invoice.client_id) ?? "").trim().toLowerCase()
        : "";
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

      if (!recipient || !isValidEmail(recipient)) {
        skipped.push(`${invoiceLabel}: no client email`);
        continue;
      }

      const amountDue =
        parseMoney(invoice.invoice_amount) - parseMoney(invoice.amount_paid);
      const dueDate = formatDate(invoice.due_date);
      const variables = {
        businessName: business.name ?? "Trimax",
        invoiceNumber: invoiceLabel,
        amountDue: formatMoney(amountDue),
        dueDate,
        dueDateSentence: dueDate !== "-" ? `was due on ${dueDate}` : "is overdue",
        customerName: invoice.customer_name ?? "Customer",
        projectTitle: invoice.project_title ?? "",
      };
      const subject = renderEmailTemplate(
        settings.paymentReminderSubjectTemplate,
        variables
      );
      const message = [
        renderEmailTemplate(settings.paymentReminderBodyTemplate, variables),
        "",
        settings.signature,
      ]
        .filter(Boolean)
        .join("\n");

      if (body.dryRun) {
        skipped.push(`${invoiceLabel}: dry run`);
        continue;
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
          </div>
          <div style="padding: 18px 0; text-align: center; background: #eef2f6; color: #8a9aab; font-size: 13px;">
            Powered by Trimax
          </div>
        </div>
      `;

      const result = await sendWithResend({
        from,
        to: recipient,
        replyTo: settings.replyToEmail || null,
        cc: ccEmail || null,
        bcc: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
        subject,
        html,
        text: message,
      });

      if (!result.ok) {
        failed.push({
          invoice: invoiceLabel,
          error: result.error ?? "Could not send reminder.",
        });
        continue;
      }

      await supabase.from("activity_logs").insert({
        business_id: business.id,
        actor_user_id: null,
        actor_email: "automation@trimax.local",
        action: "invoice.payment_reminder_sent",
        entity_type: "invoice",
        entity_id: invoice.id,
        entity_label: invoiceLabel,
        details: {
          recipient_email: recipient,
          subject,
          sender_email: senderEmail,
          cc_email: ccEmail || null,
          cc_source: ccSource,
          bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
          automated: true,
        },
      });

      sent.push(`${invoiceLabel}: ${recipient}`);
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    failed,
  });
}
