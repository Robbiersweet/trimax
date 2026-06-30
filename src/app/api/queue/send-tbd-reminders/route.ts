import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  defaultInvoiceEmailSettings,
  emailSettingsKey,
  formatSenderAddress,
  normalizeInvoiceEmailSettings,
  resolveWorkspaceSenderEmail,
} from "../../../lib/invoiceEmailSettings";
import { queueTbdDecisions } from "../../../lib/tbd";

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
      property_users: GenericTable;
      queue_items: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const runtime = "nodejs";
export const maxDuration = 60;

type BusinessRow = {
  id: string;
  slug: string;
  name: string | null;
};

type QueueItemRow = {
  id: string;
  business_id: string;
  property: string | null;
  unit: string | null;
  move_out_date: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
};

type PropertyUserRow = {
  id: string;
  email: string | null;
  property_name: string | null;
  role: string | null;
};

type ActivityRow = {
  entity_id: string | null;
  details: Record<string, unknown> | null;
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

function dateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return "Not provided";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysSinceMoveOut(moveOutDate: string | null, today: Date) {
  const moveOut = dateValue(moveOutDate);

  if (!moveOut) {
    return null;
  }

  return Math.floor((today.getTime() - moveOut.getTime()) / 86400000);
}

function cadenceKey(daysAfterMoveOut: number) {
  if ([0, 1, 3].includes(daysAfterMoveOut)) {
    return `move-out-plus-${daysAfterMoveOut}`;
  }

  if (daysAfterMoveOut > 3 && (daysAfterMoveOut - 3) % 7 === 0) {
    return `weekly-${Math.floor((daysAfterMoveOut - 3) / 7)}`;
  }

  return null;
}

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rolePriority(role: string | null) {
  const normalized = (role || "").trim().toLowerCase().replaceAll("-", "_");

  if (normalized === "property_manager" || normalized === "manager") {
    return 0;
  }

  if (normalized === "assistant_manager") {
    return 1;
  }

  if (normalized === "maintenance_manager") {
    return 2;
  }

  return 3;
}

function pickPropertyRecipient(
  propertyUsers: PropertyUserRow[],
  propertyName: string | null
) {
  const key = propertyKey(propertyName);

  return [...propertyUsers]
    .filter((user) => propertyKey(user.property_name) === key)
    .filter((user) => isValidEmail((user.email || "").trim()))
    .sort(
      (first, second) =>
        rolePriority(first.role) - rolePriority(second.role) ||
        String(first.email || "").localeCompare(String(second.email || ""))
    )[0];
}

async function sendWithResend({
  from,
  to,
  replyTo,
  bcc,
  subject,
  html,
  text,
}: {
  from: string;
  to: string;
  replyTo: string | null;
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

function reminderBody({
  unitLabel,
  moveOutDate,
  queueItemUrl,
  decisions,
}: {
  unitLabel: string;
  moveOutDate: string | null;
  queueItemUrl: string;
  decisions: ReturnType<typeof queueTbdDecisions>;
}) {
  const decisionLines = decisions.map(
    (decision) => `- ${decision.field}: ${decision.value}`
  );

  return [
    `Unit ${unitLabel} still has unresolved information:`,
    "",
    ...decisionLines,
    "",
    `Move-out date: ${formatDate(moveOutDate)}`,
    "",
    "Please inspect the unit and update the queue item when available.",
    "",
    `Open Queue Item: ${queueItemUrl}`,
  ].join("\n");
}

async function runTbdReminderCheck(
  request: Request,
  body: {
    businessSlug?: string;
    dryRun?: boolean;
    today?: string;
  } = {}
) {
  const reminderSecret =
    process.env.CRON_SECRET ?? process.env.TRIMAX_REMINDER_CRON_SECRET;

  if (!reminderSecret) {
    return NextResponse.json(
      { error: "Reminder automation is missing CRON_SECRET." },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization");
  const trimaxHeader = request.headers.get("x-trimax-cron-secret");

  if (
    authorization !== `Bearer ${reminderSecret}` &&
    trimaxHeader !== reminderSecret
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Reminder automation is missing Supabase settings." },
      { status: 503 }
    );
  }

  const today = dateValue(body.today ?? null) ?? new Date();
  today.setHours(0, 0, 0, 0);
  const todayInput = today.toISOString().slice(0, 10);

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
      { error: "Trimax could not load businesses for TBD reminders." },
      { status: 500 }
    );
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: { queueItem: string; error: string }[] = [];

  for (const business of businesses ?? []) {
    const { data: queueItems, error: queueError } = await supabase
      .from("queue_items")
      .select(
        "id, business_id, property, unit, move_out_date, wall_paint_color, flooring"
      )
      .eq("business_id", business.id)
      .not("move_out_date", "is", null)
      .lte("move_out_date", todayInput)
      .returns<QueueItemRow[]>();

    if (queueError) {
      failed.push({
        queueItem: business.name ?? business.slug,
        error: "Could not load queue items.",
      });
      continue;
    }

    const candidates = (queueItems ?? [])
      .map((item) => ({
        item,
        decisions: queueTbdDecisions(item),
        daysAfterMoveOut: daysSinceMoveOut(item.move_out_date, today),
      }))
      .filter(
        (candidate) =>
          candidate.decisions.length > 0 &&
          candidate.daysAfterMoveOut !== null
      )
      .map((candidate) => ({
        ...candidate,
        cadence: cadenceKey(candidate.daysAfterMoveOut ?? -1),
      }))
      .filter((candidate) => Boolean(candidate.cadence));

    if (candidates.length === 0) {
      continue;
    }

    const { data: propertyUsers } = await supabase
      .from("property_users")
      .select("id, email, property_name, role")
      .eq("business_id", business.id)
      .returns<PropertyUserRow[]>();

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
    const senderEmail = resolveWorkspaceSenderEmail({
      senderEmail: settings.senderEmail,
      businessSlug: business.slug,
      environmentSenderEmail: process.env.TRIMAX_EMAIL_FROM,
    });
    const bccEmail = settings.bccEmail.trim().toLowerCase();

    const { data: previousLogs } = await supabase
      .from("activity_logs")
      .select("entity_id, details")
      .eq("business_id", business.id)
      .eq("entity_type", "queue_item")
      .in("action", [
        "queue_item.tbd_reminder_sent",
        "queue_item.tbd_reminder_skipped",
      ])
      .returns<ActivityRow[]>();
    const sentCadenceKeys = new Set(
      (previousLogs ?? [])
        .filter((log) => log.entity_id)
        .map((log) => {
          const cadence = log.details?.cadence_key;
          return typeof cadence === "string"
            ? `${log.entity_id}:${cadence}`
            : "";
        })
        .filter(Boolean)
    );

    if (!senderEmail || !isValidEmail(senderEmail)) {
      failed.push({
        queueItem: business.name ?? business.slug,
        error:
          "No sender address is configured for this workspace. Add one in Settings > Customer Email.",
      });
      continue;
    }

    const from = formatSenderAddress({
      senderName: settings.senderName || business.name || "Trimax",
      senderEmail,
    });

    for (const candidate of candidates) {
      const item = candidate.item;
      const queueLabel = `${item.property || "Property"} - Unit ${
        item.unit || "-"
      }`;
      const unitLabel = item.unit || "-";
      const cadence = candidate.cadence ?? "";
      const cadenceSignature = `${item.id}:${cadence}`;

      if (sentCadenceKeys.has(cadenceSignature)) {
        skipped.push(`${queueLabel}: reminder already logged for ${cadence}`);
        continue;
      }

      const recipient = pickPropertyRecipient(
        propertyUsers ?? [],
        item.property
      );

      if (!recipient?.email) {
        await supabase.from("activity_logs").insert({
          business_id: business.id,
          actor_user_id: null,
          actor_email: "automation@trimax.local",
          action: "queue_item.tbd_reminder_skipped",
          entity_type: "queue_item",
          entity_id: item.id,
          entity_label: queueLabel,
          details: {
            reason: "no_property_manager_email",
            cadence_key: cadence,
            move_out_date: item.move_out_date,
            unresolved_decisions: candidate.decisions,
            automated: true,
          },
        });
        sentCadenceKeys.add(cadenceSignature);
        skipped.push(`${queueLabel}: no property manager email`);
        continue;
      }

      const queueItemUrl = new URL(
        `/queue/${item.id}?business=${business.slug}`,
        request.url
      ).toString();
      const subject = `Trimax Follow-up Needed - Unit ${unitLabel}`;
      const message = reminderBody({
        unitLabel,
        moveOutDate: item.move_out_date,
        queueItemUrl,
        decisions: candidate.decisions,
      });

      if (body.dryRun) {
        skipped.push(`${queueLabel}: dry run`);
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
            <p style="margin-top: 24px;">
              <a href="${escapeHtml(
                queueItemUrl
              )}" style="display: inline-block; background: #0ea5e9; color: #ffffff; text-decoration: none; font-weight: 800; padding: 12px 18px; border-radius: 12px;">Open Queue Item</a>
            </p>
          </div>
        </div>
      `;

      const result = await sendWithResend({
        from,
        to: recipient.email,
        replyTo: settings.replyToEmail || null,
        bcc: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
        subject,
        html,
        text: message,
      });

      if (!result.ok) {
        await supabase.from("activity_logs").insert({
          business_id: business.id,
          actor_user_id: null,
          actor_email: "automation@trimax.local",
          action: "queue_item.tbd_reminder_failed",
          entity_type: "queue_item",
          entity_id: item.id,
          entity_label: queueLabel,
          details: {
            recipient_email: recipient.email,
            subject,
            sender_email: senderEmail,
            cadence_key: cadence,
            move_out_date: item.move_out_date,
            queue_item_url: queueItemUrl,
            unresolved_decisions: candidate.decisions,
            provider: "resend",
            provider_status: result.status,
            error: result.error,
            automated: true,
          },
        });
        failed.push({
          queueItem: queueLabel,
          error: result.error ?? "Could not send TBD reminder.",
        });
        continue;
      }

      await supabase.from("activity_logs").insert({
        business_id: business.id,
        actor_user_id: null,
        actor_email: "automation@trimax.local",
        action: "queue_item.tbd_reminder_sent",
        entity_type: "queue_item",
        entity_id: item.id,
        entity_label: queueLabel,
        details: {
          recipient_email: recipient.email,
          subject,
          sender_email: senderEmail,
          bcc_email: bccEmail && isValidEmail(bccEmail) ? bccEmail : null,
          cadence_key: cadence,
          move_out_date: item.move_out_date,
          queue_item_url: queueItemUrl,
          unresolved_decisions: candidate.decisions,
          provider: "resend",
          provider_status: result.status,
          automated: true,
        },
      });
      sentCadenceKeys.add(cadenceSignature);
      sent.push(`${queueLabel}: ${recipient.email}`);
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    failed,
  });
}

export async function GET(request: Request) {
  return runTbdReminderCheck(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    businessSlug?: string;
    dryRun?: boolean;
    today?: string;
  };

  return runTbdReminderCheck(request, body);
}
