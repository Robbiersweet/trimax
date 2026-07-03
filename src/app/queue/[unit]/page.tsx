import Link from "next/link";
import AppShell from "../../components/AppShell";
import BackButton from "../../components/BackButton";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import DeleteQueueItemButton from "../../components/DeleteQueueItemButton";
import InternalNotes from "../../components/InternalNotes";
import JobSessionPanel from "../../components/JobSessionPanel";
import MarkCompletedButton from "../../components/MarkCompletedButton";
import MarkScheduledButton from "../../components/MarkScheduledButton";
import RoleVisible from "../../components/RoleVisible";
import SyncUnitProfileButton from "../../components/SyncUnitProfileButton";
import Toast from "../../components/Toast";
import {
  calendarDataUri,
  calendarFileName,
} from "../../lib/calendar";
import {
  queueTimingBadge,
  queueTimingTone,
} from "../../lib/queueTiming";
import { supabase } from "../../lib/supabase";
import {
  queueTbdDecisions,
  tbdDisplay,
} from "../../lib/tbd";
import { fieldWorkerRoles } from "../../lib/rolePermissions";
import { getConfirmedNorthCreekUnit } from "../../utils/northCreekUnits";
import {
  canonicalApartmentUnitLabel,
  displayUnitLayout,
  maybeCanonicalApartmentUnitLabel,
} from "../../utils/unitLabels";

type SupabaseQueueItem = {
  id: string;
  business_id: string | null;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  priority_order: number | null;
  paint_type: string | null;
  unit_layout: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  projected_completion_date: string | null;
  progress_stage: string | null;
  percent_complete: number | null;
  delay_reason: string | null;
  manager_update: string | null;
  manager_update_at: string | null;
  smoked_in: boolean | null;
  primer_requested: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type Business = {
  id: string;
  name: string;
  slug: string;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  status: string | null;
};

type LinkedInvoice = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  due_date: string | null;
  created_at: string | null;
};

type InvoiceActivityLog = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

type QueueActivityLog = InvoiceActivityLog & {
  entity_label: string | null;
};

type QueueActivityChange = {
  field: string;
  label: string;
  previousValue: unknown;
  newValue: unknown;
};

type PropertyUnitProfile = {
  id: string | null;
  building_letter: string | null;
  unit_number: number | null;
  unit_label: string | null;
  floor: string | null;
  floorplan: string | null;
  notes: string | null;
};

type UnitHistoryEntry = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  paint_type: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  smoker_remediation: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  queue_item_is_renovation: boolean | null;
  notes: string | null;
  created_at: string | null;
};

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUnitLabel(value: string | null | undefined) {
  return canonicalApartmentUnitLabel(value);
}

function formatFloor(value: string | null | undefined) {
  if (value === "bottom") {
    return "Bottom";
  }

  if (value === "top") {
    return "Top";
  }

  return "-";
}

function formatHistoryDate(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return "-";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value: string | number | null | undefined) {
  const amount =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^0-9.-]+/g, ""));

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function moneyNumber(value: string | number | null | undefined) {
  const amount =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^0-9.-]+/g, ""));

  return Number.isFinite(amount) ? amount : 0;
}

function formatEventDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatManagerUpdateTime(value: string | null | undefined) {
  const formatted = formatEventDateTime(value);

  return formatted || "Not recorded";
}

function detailValue(
  details: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = details?.[key];

  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item))
      .join(", ");
  }

  return String(value);
}

function prettifyField(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatChangeValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Blank";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function queueActivityChanges(log: QueueActivityLog): QueueActivityChange[] {
  const changes = log.details?.changes;

  if (!Array.isArray(changes)) {
    return [];
  }

  return changes
    .filter(
      (
        change
      ): change is {
        field?: unknown;
        label?: unknown;
        previousValue?: unknown;
        newValue?: unknown;
      } => Boolean(change) && typeof change === "object"
    )
    .map((change) => {
      const field = typeof change.field === "string" ? change.field : "";

      return {
        field,
        label:
          typeof change.label === "string"
            ? change.label
            : field
              ? prettifyField(field)
              : "Changed",
        previousValue: change.previousValue ?? null,
        newValue: change.newValue ?? null,
      };
    })
    .filter((change) => change.field.length > 0);
}

function queueActivityLabel(action: string) {
  const labels: Record<string, string> = {
    "queue_item.created": "Created",
    "queue_item.updated": "Updated",
    "queue_item.scheduled": "Scheduled",
    "queue_item.completed": "Completed",
    "job_session.started": "Session Started",
    "job_session.resumed": "Session Resumed",
    "job_session.stopped": "Session Stopped",
    "job_session.breakdown_saved": "Time Breakdown Saved",
    "job_session.breakdown_skipped": "Time Breakdown Skipped",
    "technician.job_session_started": "Technician Started",
    "technician.job_session_resumed": "Technician Resumed",
    "technician.job_session_paused": "Technician Paused",
    "technician.job_session_stopped": "Technician Stopped",
    "technician.job_completed": "Technician Completed",
  };

  return labels[action] ?? action;
}

function latestHistory(
  entries: UnitHistoryEntry[],
  matches: (entry: UnitHistoryEntry) => boolean
) {
  return entries.find(matches) ?? null;
}

function dateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function daysBetween(startValue: string | null, endValue: string | null) {
  const start = dateValue(startValue);
  const end = dateValue(endValue);

  if (!start || !end) {
    return null;
  }

  return Math.max(
    Math.round((end.getTime() - start.getTime()) / 86400000),
    0
  );
}

function readyStatus(item: SupabaseQueueItem) {
  const readyDate = dateValue(item.ready_date);
  const isScheduled = Boolean(item.scheduled_date);
  const isCompleted = Boolean(item.completed_date);

  if (isCompleted) {
    return {
      tone: "green",
      label: "Completed",
      detail: "This unit has a completed date recorded.",
    };
  }

  if (!readyDate) {
    return {
      tone: "zinc",
      label: "No deadline provided",
      detail: "Add the property deadline only when the manager knows when this unit must be completed.",
    };
  }

  if (isScheduled) {
    return {
      tone: "orange",
      label: "Scheduled",
      detail: "This unit has a scheduled date recorded.",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysUntilReady = Math.round(
    (readyDate.getTime() - today.getTime()) / 86400000
  );

  if (daysUntilReady < 0) {
    return {
      tone: "red",
      label: "Past needed-by date",
      detail: "The property deadline has passed and this unit is not scheduled.",
    };
  }

  if (daysUntilReady <= 7) {
    return {
      tone: "yellow",
      label: "Due soon",
      detail: `${daysUntilReady} day${
        daysUntilReady === 1 ? "" : "s"
      } until the property deadline, not scheduled yet.`,
    };
  }

  return {
    tone: "zinc",
    label: "Upcoming",
    detail: `${daysUntilReady} days until the property deadline.`,
  };
}

export default async function QueueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ unit: string }>;
  searchParams?: Promise<{ business?: string; completed?: string }>;
}) {
  const { unit } = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const requestedBusinessSlug =
    resolvedSearchParams.business ?? "rnl-creations";
  const showCompletedToast = resolvedSearchParams.completed === "1";

  const { data: selectedBusinessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", requestedBusinessSlug)
    .limit(1)
    .maybeSingle();

  const selectedBusiness =
    selectedBusinessData as Business | null;

  if (!selectedBusiness) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Selected business was not found.
          </p>
        </Card>
      </AppShell>
    );
  }

  const { data, error } = await supabase
    .from("queue_items")
    .select("*")
    .eq("id", unit)
    .eq("business_id", selectedBusiness.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Queue item not found for this workspace.
          </p>
        </Card>
      </AppShell>
    );
  }

  const item = data as SupabaseQueueItem;
  const businessSlug = selectedBusiness.slug;
  const displayUnit = maybeCanonicalApartmentUnitLabel(item.unit);

  let linkedEstimate: LinkedEstimate | null = null;
  let linkedInvoice: LinkedInvoice | null = null;
  let linkedInvoiceActivity: InvoiceActivityLog | null = null;
  let queueActivityLogs: QueueActivityLog[] = [];
  let propertyUnitProfile: PropertyUnitProfile | null = null;
  let northCreekPropertyId: string | null = null;
  let unitHistory: UnitHistoryEntry[] = [];
  let queueLinkedEstimateCount = 0;
  let queueJobSessionCount = 0;
  let queueProofActivityCount = 0;
  const isNorthCreekQueueItem =
    propertyKey(item.property) === "north-creek-apartments";
  const normalizedUnitLabel = normalizeUnitLabel(item.unit);
  const confirmedNorthCreekUnit =
    isNorthCreekQueueItem && normalizedUnitLabel
      ? getConfirmedNorthCreekUnit(normalizedUnitLabel)
      : null;

  if (item.linked_estimate_id) {
    const { data: estimateData } = await supabase
      .from("estimates")
      .select("id, display_id, project_title, status")
      .eq("id", item.linked_estimate_id)
      .eq("business_id", selectedBusiness.id)
      .limit(1)
      .maybeSingle();

    linkedEstimate = estimateData as LinkedEstimate | null;

    const { data: invoiceData } = await supabase
      .from("invoices")
      .select(
        "id, display_id, customer_name, project_title, status, invoice_amount, amount_paid, due_date, created_at"
      )
      .eq("estimate_id", item.linked_estimate_id)
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    linkedInvoice = invoiceData as LinkedInvoice | null;

    if (linkedInvoice?.id) {
      const { data: activityData } = await supabase
        .from("activity_logs")
        .select("id, action, details, created_at")
        .eq("business_id", selectedBusiness.id)
        .eq("entity_type", "invoice")
        .eq("entity_id", linkedInvoice.id)
        .in("action", [
          "invoice.email_sent",
          "invoice.payment_reminder_sent",
        ])
        .order("created_at", { ascending: false })
        .limit(1);

      linkedInvoiceActivity =
        ((activityData ?? []) as InvoiceActivityLog[])[0] ?? null;
    }
  }

  const { count: estimateSafetyCount } = await supabase
    .from("estimates")
    .select("id", { count: "exact", head: true })
    .eq("business_id", selectedBusiness.id)
    .eq("queue_item_id", item.id);

  queueLinkedEstimateCount = estimateSafetyCount ?? 0;

  const { count: jobSessionSafetyCount } = await supabase
    .from("job_sessions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", selectedBusiness.id)
    .eq("queue_item_id", item.id);

  queueJobSessionCount = jobSessionSafetyCount ?? 0;

  const { count: proofActivitySafetyCount } = await supabase
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("business_id", selectedBusiness.id)
    .eq("entity_type", "queue_item")
    .eq("entity_id", item.id)
    .in("action", [
      "invoice.email_sent",
      "invoice.payment_reminder_sent",
      "invoice.batch_payment_applied",
      "invoice.paid",
      "invoice.check_uploaded",
      "queue_item.completed",
      "job_session.started",
      "job_session.resumed",
      "job_session.stopped",
      "job_session.breakdown_saved",
      "technician.job_session_started",
      "technician.job_session_resumed",
      "technician.job_session_paused",
      "technician.job_session_stopped",
      "technician.job_completed",
    ]);

  queueProofActivityCount = proofActivitySafetyCount ?? 0;

  const { data: queueActivityData } = await supabase
    .from("activity_logs")
    .select("id, action, entity_label, details, created_at")
    .eq("business_id", selectedBusiness.id)
    .eq("entity_type", "queue_item")
    .eq("entity_id", item.id)
    .order("created_at", { ascending: false })
    .limit(8);

  queueActivityLogs = (queueActivityData ?? []) as QueueActivityLog[];

  if (isNorthCreekQueueItem && normalizedUnitLabel) {
    const { data: propertyData } = await supabase
      .from("properties")
      .select("id")
      .eq("business_id", selectedBusiness.id)
      .eq("name", "North Creek Apartments")
      .limit(1)
      .maybeSingle();

    if (propertyData?.id) {
      northCreekPropertyId = propertyData.id;

      const { data: unitData } = await supabase
        .from("property_units")
        .select(
          "id, building_letter, unit_number, unit_label, floor, floorplan, notes"
        )
        .eq("property_id", propertyData.id)
        .eq("unit_label", normalizedUnitLabel)
        .limit(1)
        .maybeSingle();

      propertyUnitProfile = unitData as PropertyUnitProfile | null;

      if (propertyUnitProfile?.id) {
        const { data: historyData } = await supabase
          .from("unit_history")
          .select(
            "id, event_type, event_date, paint_type, wall_paint_color, flooring, smoker_remediation, prior_renovation, prior_renovation_details, queue_item_is_renovation, notes, created_at"
          )
          .eq("property_unit_id", propertyUnitProfile.id)
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(12);

        unitHistory = (historyData ?? []) as UnitHistoryEntry[];
      }
    }
  }

  const displayUnitProfile =
    propertyUnitProfile ??
    (confirmedNorthCreekUnit
      ? {
          id: null,
          building_letter: confirmedNorthCreekUnit.building_letter,
          unit_number: confirmedNorthCreekUnit.unit_number,
          unit_label: confirmedNorthCreekUnit.unit_label,
          floor: confirmedNorthCreekUnit.floor,
          floorplan: confirmedNorthCreekUnit.floorplan,
          notes: null,
        }
      : null);
  const isUsingConfirmedUnitFallback =
    Boolean(displayUnitProfile) && !propertyUnitProfile;

  const readiness = readyStatus(item);
  const timingBadge = queueTimingBadge(item);
  const timingTone = queueTimingTone(timingBadge);
  const turnaroundDays = daysBetween(
    item.move_out_date,
    item.completed_date
  );
  const calendarTitle = `${item.property || "Property"}${
    displayUnit ? ` - Unit ${displayUnit}` : ""
  }`;
  const calendarHref = calendarDataUri({
    title: `Trimax: ${calendarTitle}`,
    date: item.scheduled_date,
    location: item.property,
    description: [
      item.paint_type ? `Paint: ${item.paint_type}` : null,
      item.unit_layout ? `Layout: ${item.unit_layout}` : null,
      item.wall_paint_color ? `Wall color: ${item.wall_paint_color}` : null,
      item.flooring ? `Flooring: ${item.flooring}` : null,
      item.priority ? `Priority: ${item.priority}` : null,
      item.priority_order ? `Manager priority order: ${item.priority_order}` : null,
      item.ready_date ? `Needed by date: ${item.ready_date}` : null,
      item.prior_renovation_details
        ? `Prior renovation: ${item.prior_renovation_details}`
        : null,
      item.renovation_needed ? "Renovation needed: Yes" : null,
      item.renovation_needed_details
        ? `Current renovation: ${item.renovation_needed_details}`
        : null,
      item.notes ? `Notes: ${item.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  const latestPaintHistory = latestHistory(
    unitHistory,
    (entry) => entry.event_type === "paint" || Boolean(entry.paint_type)
  );
  const latestFlooringHistory = latestHistory(
    unitHistory,
    (entry) => entry.event_type === "flooring" || Boolean(entry.flooring)
  );
  const latestSmokerHistory = latestHistory(
    unitHistory,
    (entry) =>
      entry.event_type === "smoker_remediation" ||
      Boolean(entry.smoker_remediation)
  );
  const latestRenovationHistory = latestHistory(
    unitHistory,
    (entry) =>
      entry.event_type === "renovation" ||
      Boolean(entry.prior_renovation) ||
      Boolean(entry.queue_item_is_renovation)
  );
  const invoiceRecipient = detailValue(
    linkedInvoiceActivity?.details,
    "recipient_email"
  );
  const invoiceCc = detailValue(linkedInvoiceActivity?.details, "cc_email");
  const invoicePdfAttached =
    linkedInvoiceActivity?.details?.pdf_attached === true;
  const invoiceWasSent =
    Boolean(linkedInvoiceActivity) ||
    linkedInvoice?.status?.trim().toLowerCase() === "sent";
  const invoiceDeliveryLabel = linkedInvoiceActivity
    ? "Proof logged"
    : invoiceWasSent
      ? "Marked sent"
      : "Ready to send";
  const linkedInvoiceBalance = linkedInvoice
    ? Math.max(
        moneyNumber(linkedInvoice.invoice_amount) -
          moneyNumber(linkedInvoice.amount_paid),
        0
      )
    : null;
  const invoiceIsPaid =
    Boolean(linkedInvoice) &&
    (linkedInvoice?.status?.trim().toLowerCase() === "paid" ||
      linkedInvoiceBalance === 0);
  const workflowNextAction = !linkedEstimate
    ? {
        title: "Create the estimate",
        detail:
          "This queue item has not generated an estimate yet. Start there so Trimax can carry the job into invoicing.",
        href: `/estimates/new?queueId=${item.id}&business=${businessSlug}`,
        action: "Create Estimate",
      }
    : !linkedInvoice
      ? {
          title: "Convert estimate to invoice",
          detail:
            "The estimate exists, but no invoice is attached yet. Convert it when the work is ready to bill.",
          href: `/estimates/${linkedEstimate.id}?business=${businessSlug}`,
          action: "Open Estimate",
        }
      : !invoiceWasSent
        ? {
            title: "Send invoice",
            detail:
              "The invoice exists, but Trimax has not found saved send proof yet.",
            href: `/invoices/${linkedInvoice.id}?business=${businessSlug}`,
            action: "Open Invoice",
          }
        : !invoiceIsPaid
          ? {
              title: "Watch payment",
              detail: `${formatMoney(
                linkedInvoiceBalance
              )} is still open. Payment matching and reminders stay tied to this invoice.`,
              href: `/payments?business=${businessSlug}&customer=${encodeURIComponent(
                linkedInvoice.customer_name ?? item.property ?? ""
              )}`,
              action: "Open Payments",
            }
          : !item.completed_date
            ? {
                title: "Mark queue item complete",
                detail:
                  "Billing is paid, but this unit still has no completed date saved.",
                href: `#complete-work`,
                action: "Complete Work",
              }
            : {
                title: "Workflow complete",
                detail:
                  "Estimate, invoice, payment, and completion are all accounted for.",
                href: `/activity?business=${businessSlug}&type=queue`,
                action: "View Proof",
            };
  const managerLifecycleStatus = item.completed_date
    ? "Completed"
    : invoiceWasSent
      ? "Invoice Sent"
      : linkedInvoice
        ? "Invoice Created"
        : linkedEstimate
          ? "Estimate Created"
          : item.status || "Pending Estimate";
  const deleteBlockReasons = [
    item.linked_estimate_id || queueLinkedEstimateCount > 0
      ? "estimate"
      : null,
    linkedInvoice ? "invoice" : null,
    queueJobSessionCount > 0 ? "job session" : null,
    queueProofActivityCount > 0 ? "work history" : null,
  ].filter(Boolean);
  const deleteDisabledReason =
    deleteBlockReasons.length > 0
      ? "This queue item already has work history and cannot be deleted."
      : null;
  const tbdDecisions = queueTbdDecisions(item);
  const queueChangeLogs = queueActivityLogs.filter(
    (log) => queueActivityChanges(log).length > 0
  );
  const queueVolatilityScore = queueChangeLogs.reduce(
    (total, log) => total + queueActivityChanges(log).length,
    0
  );

  return (
    <AppShell>
      {showCompletedToast ? (
        <Toast
          type="success"
          message="Work marked complete. If the invoice has been sent, this item is ready to leave the Active Queue."
        />
      ) : null}
      <div className="space-y-6">
        <BackButton label="Back" fallbackHref={`/queue?business=${businessSlug}`} />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="queue-unit-plate queue-unit-plate-v2 queue-unit-plate-large">
              <span className="queue-unit-plate-label">Unit</span>
              <span className="queue-unit-plate-value">
                {displayUnit || "-"}
              </span>
            </div>

            <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax Queue
            </p>

              <h1 className="mt-2 text-4xl font-bold">
                {item.property || "Queue Item"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge status={item.status ?? "Pending Estimate"} />
            <RoleVisible
              businessSlug={businessSlug}
              allow={["owner", "admin", "accountant", "property_manager"]}
            >
              {linkedInvoice ? (
                <StatusBadge
                  status={
                    invoiceWasSent
                      ? "Invoice Sent"
                      : linkedInvoice.status ?? "Invoiced"
                  }
                />
              ) : null}
            </RoleVisible>
          </div>
        </div>

        <RoleVisible
          businessSlug={businessSlug}
          allow={["owner", "admin", "accountant"]}
        >
          <QueueWorkflowIntelligence
            linkedEstimate={linkedEstimate}
            linkedInvoice={linkedInvoice}
            invoiceWasSent={invoiceWasSent}
            invoiceDeliveryLabel={invoiceDeliveryLabel}
            invoiceIsPaid={invoiceIsPaid}
            invoiceBalance={linkedInvoiceBalance}
            completedDate={item.completed_date}
            nextAction={workflowNextAction}
          />

          <QueueChangeIntelligence
            logs={queueActivityLogs}
            changeCount={queueVolatilityScore}
          />
        </RoleVisible>

        <RoleVisible businessSlug={businessSlug} allow={["property_manager"]}>
          <Card className="border-sky-500/25 bg-sky-500/10">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-sky-200">
                  Queue Status
                </p>
                <div className="mt-3">
                  <StatusBadge status={managerLifecycleStatus} />
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-sky-50/80">
                  This shows where the request is in the workflow without
                  exposing internal planning or financial controls.
                </p>
              </div>
              <Link href={`/queue/${item.id}/edit?business=${businessSlug}`}>
                <Button variant="secondary">Edit Queue Item</Button>
              </Link>
            </div>
          </Card>
        </RoleVisible>

        {tbdDecisions.length > 0 ? (
          <Card className="border-amber-400/30 bg-amber-500/10">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-amber-200">
                  Outstanding Decisions
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  {tbdDecisions.length} TBD
                </h2>
                <p className="mt-2 text-sm leading-6 text-amber-100/80">
                  This queue item can stay active, but these details still need
                  a real decision after inspection.
                </p>
              </div>

              <div className="grid gap-2 text-sm font-semibold text-amber-50 md:min-w-72">
                {tbdDecisions.map((decision) => (
                  <p
                    key={decision.field}
                    className="rounded-2xl border border-amber-300/25 bg-black/25 px-4 py-3"
                  >
                    {decision.field}: {decision.value}
                  </p>
                ))}
              </div>
            </div>
          </Card>
        ) : null}

        <RoleVisible businessSlug={businessSlug} allow={fieldWorkerRoles}>
          <JobSessionPanel
            businessId={selectedBusiness.id}
            businessSlug={businessSlug}
            propertyName={item.property}
            unitLabel={displayUnit || item.unit}
            queueItemId={item.id}
            estimateId={linkedEstimate?.id ?? item.linked_estimate_id}
            invoiceId={linkedInvoice?.id ?? null}
            jobType={item.paint_type || item.renovation_needed_details || "Paint"}
          />
        </RoleVisible>

        <RoleVisible
          businessSlug={businessSlug}
          allow={["owner", "admin", "accountant", "technician"]}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <AttentionCard
              tone={readiness.tone}
              label="Readiness"
              value={readiness.label}
              detail={readiness.detail}
            />

            <AttentionCard
              tone={timingTone}
              label="Timing"
              value={timingBadge}
              detail={
                item.projected_completion_date
                  ? `Robbie ETA: ${item.projected_completion_date}`
                  : "No Robbie ETA set."
              }
            />

            <AttentionCard
              tone={turnaroundDays === null ? "zinc" : "green"}
              label="Turnaround"
              value={
                turnaroundDays === null
                  ? "-"
                  : `${turnaroundDays} day${
                      turnaroundDays === 1 ? "" : "s"
                    }`
              }
              detail="Move out to completed date."
            />

            <AttentionCard
              tone={item.smoked_in ? "red" : "zinc"}
              label="Remediation"
              value={item.smoked_in ? "Yes" : "No"}
              detail={
                item.smoked_in
                  ? item.primer_requested === false
                    ? "Smoke is tracked, but full primer is not requested for estimate creation."
                    : "This is counted in smoker/remediation reporting and can add primer to estimates."
                  : "No remediation flag is set."
              }
            />

            <AttentionCard
              tone={item.renovation_needed ? "orange" : "zinc"}
              label="Renovation"
              value={item.renovation_needed ? "Needed" : "Not Flagged"}
              detail={
                item.renovation_needed
                  ? item.renovation_needed_details ||
                    "Estimate creation will include renovation and cabinet paint."
                  : item.prior_renovation || item.prior_renovation_details
                    ? "Prior renovation history is saved for this unit."
                    : "No renovation flag is set."
              }
            />
          </div>
        </RoleVisible>

        <Card className="border-emerald-500/25 bg-emerald-500/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                Manager Update
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white">
                {item.manager_update || "No manager-visible update yet."}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Last updated {formatManagerUpdateTime(item.manager_update_at)}.
                Private internal notes stay hidden from managers.
              </p>
            </div>

            <RoleVisible
              businessSlug={businessSlug}
              allow={["owner", "admin", "accountant", "technician"]}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[26rem]">
                <AttentionCard
                  tone={timingTone}
                  label="Timing Badge"
                  value={timingBadge}
                  detail="Calculated from Needed By, Robbie ETA, progress, and completion."
                />
                <AttentionCard
                  tone={item.progress_stage === "Blocked / Waiting" ? "violet" : "zinc"}
                  label="Progress"
                  value={item.progress_stage || "Not Started"}
                  detail={
                    item.percent_complete !== null &&
                    item.percent_complete !== undefined
                      ? `${item.percent_complete}% complete`
                      : "No percent saved."
                  }
                />
                <AttentionCard
                  tone="zinc"
                  label="Robbie ETA"
                  value={item.projected_completion_date || "No ETA set"}
                  detail="Separate from the property Needed By date."
                />
                <AttentionCard
                  tone={item.delay_reason ? "amber" : "zinc"}
                  label="Delay Reason"
                  value={item.delay_reason || "No delay reason"}
                  detail="Used only when the work needs explanation."
                />
              </div>
            </RoleVisible>
          </div>
        </Card>

        <RoleVisible
          businessSlug={businessSlug}
          allow={["owner", "admin", "accountant"]}
        >
          {linkedEstimate && (
            <Card className="border-purple-500/40">
              <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
                Linked Estimate
              </p>

              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">
                    {linkedEstimate.display_id ?? "Estimate"}
                  </p>

                  <p className="mt-1 text-sm text-zinc-400">
                    {linkedEstimate.project_title ?? "No project title"}
                  </p>
                </div>

                <Link
                  href={`/estimates/${linkedEstimate.id}?business=${businessSlug}`}
                >
                  <Button variant="secondary">Open Estimate</Button>
                </Link>
              </div>
            </Card>
          )}

          {linkedInvoice && (
            <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-zinc-950 to-sky-500/5">
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
                Linked Invoice
              </p>

              <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xl font-semibold">
                      {linkedInvoice.display_id ?? "Invoice"}
                    </p>
                    <StatusBadge status={linkedInvoice.status ?? "Invoiced"} />
                  </div>

                  <p className="mt-1 text-sm text-zinc-400">
                    {linkedInvoice.project_title ?? "No project title"}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-500/20 bg-black/30 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        Invoice Total
                      </p>
                      <p className="mt-1 text-lg font-black text-white">
                        {formatMoney(linkedInvoice.invoice_amount)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-black/30 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        Due Date
                      </p>
                      <p className="mt-1 text-lg font-black text-white">
                        {formatHistoryDate(linkedInvoice.due_date)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-black/30 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        Delivery
                      </p>
                      <p className="mt-1 text-lg font-black text-white">
                        {invoiceDeliveryLabel}
                      </p>
                    </div>
                  </div>

                  {linkedInvoiceActivity ? (
                    <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
                      <p className="font-black">
                        Sent proof saved{" "}
                        {formatEventDateTime(linkedInvoiceActivity.created_at)
                          ? `on ${formatEventDateTime(
                              linkedInvoiceActivity.created_at
                            )}`
                          : ""}
                      </p>
                      <p className="mt-1 text-emerald-100/80">
                        {invoiceRecipient
                          ? `To ${invoiceRecipient}`
                          : "Recipient saved in the activity log"}
                        {invoiceCc ? `, CC ${invoiceCc}` : ""}
                        {invoicePdfAttached ? ". PDF attached." : "."}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                      {invoiceWasSent
                        ? "Invoice is marked sent. No email activity proof was found yet, so the invoice page is the best place to confirm delivery details."
                        : "Invoice created from this estimate. Send it from the invoice page when you are ready to notify the customer."}
                    </div>
                  )}
                </div>

                <Link href={`/invoices/${linkedInvoice.id}?business=${businessSlug}`}>
                  <Button variant={linkedInvoiceActivity ? "secondary" : "primary"}>
                    Open Invoice
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </RoleVisible>

        {isNorthCreekQueueItem ? (
          <Card className="unit-intelligence-card border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/5">
            <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
              Unit Intelligence
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {displayUnitProfile?.unit_label || displayUnit || "Unit"} profile
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <Info
                label="Building"
                value={displayUnitProfile?.building_letter ?? ""}
              />
              <Info
                label="Unit"
                value={displayUnitProfile?.unit_label ?? displayUnit}
              />
              <Info
                label="Floor"
                value={formatFloor(displayUnitProfile?.floor)}
              />
              <Info
                label="Layout"
                value={
                  displayUnitLayout(displayUnitProfile?.floorplan) ||
                  item.unit_layout ||
                  ""
                }
              />
            </div>

            {isUsingConfirmedUnitFallback ? (
              <div className="unit-intelligence-map-confirmed mt-4 rounded-2xl border px-4 py-3 text-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-black text-sky-50">Map confirmed</p>
                    <p className="mt-1 leading-6 text-sky-100/85">
                      Trimax recognizes this unit from the confirmed North Creek
                      map and is using that trusted fallback for the profile.
                    </p>
                  </div>
                  {northCreekPropertyId && confirmedNorthCreekUnit ? (
                    <SyncUnitProfileButton
                      businessId={selectedBusiness.id}
                      propertyId={northCreekPropertyId}
                      unit={confirmedNorthCreekUnit}
                    />
                  ) : (
                    <Link
                      href={`/property-intelligence?business=${businessSlug}&unit=${encodeURIComponent(
                        displayUnit || item.unit || ""
                      )}&returnTo=${encodeURIComponent(
                        `/queue/${item.id}?business=${businessSlug}`
                      )}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-sky-300/40 bg-sky-400/15 px-4 py-2 font-black text-sky-50 transition hover:-translate-y-0.5 hover:border-sky-200"
                    >
                      Open Property Intelligence
                    </Link>
                  )}
                </div>
              </div>
            ) : !displayUnitProfile ? (
              <p className="unit-intelligence-warning mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                This unit is not in the saved North Creek unit map yet. The
                queue item still works, and the unit can be added to the map
                later.
              </p>
            ) : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <HistorySummary
                label="Latest Paint"
                entry={latestPaintHistory}
                fallback={item.paint_type}
                detail={item.wall_paint_color}
              />
              <HistorySummary
                label="Latest Flooring"
                entry={latestFlooringHistory}
                fallback={item.flooring}
              />
              <HistorySummary
                label="Latest Smoker / Remediation"
                entry={latestSmokerHistory}
                fallback={item.smoked_in ? "Smoker/remediation flagged" : ""}
              />
              <HistorySummary
                label="Latest Renovation"
                entry={latestRenovationHistory}
                fallback={
                  item.renovation_needed_details ||
                  item.prior_renovation_details ||
                  ""
                }
              />
            </div>

            {unitHistory.length > 0 ? (
              <div className="mt-5 space-y-2">
                <p className="text-sm font-semibold text-zinc-200">
                  Recent history
                </p>
                {unitHistory.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className="unit-intelligence-history-row rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm"
                  >
                    <p className="font-semibold text-zinc-100">
                      {entry.event_type || "History"} /{" "}
                      {formatHistoryDate(entry.event_date)}
                    </p>
                    <p className="mt-1 text-zinc-400">
                      {[
                        entry.paint_type,
                        entry.wall_paint_color,
                        entry.flooring,
                        entry.smoker_remediation
                          ? "Smoker/remediation"
                          : null,
                        entry.prior_renovation_details,
                        entry.notes,
                      ]
                        .filter(Boolean)
                        .join(" / ") || "No detail saved."}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card className="min-w-0 overflow-hidden">
          <div className="mb-6 grid min-w-0 gap-4 md:grid-cols-3">
            <LifecycleStep
              label="Move Out"
              value={item.move_out_date}
              active={Boolean(item.move_out_date)}
            />
            <RoleVisible
              businessSlug={businessSlug}
              allow={["owner", "admin", "accountant", "technician"]}
            >
              <LifecycleStep
                label="Scheduled"
                value={item.scheduled_date}
                active={Boolean(item.scheduled_date)}
              />
              <LifecycleStep
                label="Completed"
                value={item.completed_date}
                active={Boolean(item.completed_date)}
              />
            </RoleVisible>
          </div>

          <RoleVisible
            businessSlug={businessSlug}
            allow={["owner", "admin"]}
          >
            <div
              id="schedule-work"
              className="queue-detail-notice mb-6 min-w-0 scroll-mt-6 overflow-hidden rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4"
            >
              <p className="text-sm uppercase tracking-[0.25em] text-orange-300">
                Schedule Work
              </p>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-100/80">
                Pick the date you plan to perform the work, then click Schedule.
                The submitted date is saved automatically when the queue item is
                created.
              </p>

              <div className="mt-4">
                <MarkScheduledButton
                  queueItemId={item.id}
                  businessId={item.business_id}
                  businessSlug={businessSlug}
                  initialScheduledDate={item.scheduled_date}
                  readyDate={item.ready_date}
                  label={`${item.property || "Property"} - Unit ${
                    displayUnit || "-"
                  }`}
                />
              </div>
            </div>
          </RoleVisible>

          <div className="grid gap-6 md:grid-cols-2">
            <Info label="Property" value={item.property ?? ""} />
            <Info label="Priority" value={item.priority ?? ""} />
            <Info
              label="Manager Priority Order"
              value={
                item.priority_order ? `Priority ${item.priority_order}` : ""
              }
              emptyValue="No priority order"
            />
            <Info label="Unit Layout" value={item.unit_layout ?? ""} />
            <Info label="Paint Type" value={item.paint_type ?? ""} />
            <Info
              label="Wall Paint Color"
              value={tbdDisplay(item.wall_paint_color)}
            />
            <Info label="Flooring" value={tbdDisplay(item.flooring)} />
            <Info
              label="Prior Renovation"
              value={
                item.prior_renovation || item.prior_renovation_details
                  ? "Yes"
                  : "No"
              }
            />
            <Info
              label="Prior Renovation Details"
              value={item.prior_renovation_details ?? ""}
            />
            <Info
              label="Renovation Needed"
              value={item.renovation_needed ? "Yes" : "No"}
            />
            <Info
              label="Current Renovation Style / Scope"
              value={item.renovation_needed_details ?? ""}
            />
            <Info label="Move Out Date" value={item.move_out_date ?? ""} />
            <Info
              label="Needed By Date"
              value={item.ready_date ?? ""}
              emptyValue="No deadline provided"
            />
            <RoleVisible
              businessSlug={businessSlug}
              allow={["owner", "admin", "accountant", "technician"]}
            >
              <Info label="Scheduled Date" value={item.scheduled_date ?? ""} />
              <Info label="Completed Date" value={item.completed_date ?? ""} />
              <Info
                label="Progress"
                value={item.progress_stage || "Not Started"}
              />
              <Info
                label="Percent Complete"
                value={
                  item.percent_complete !== null &&
                  item.percent_complete !== undefined
                    ? `${item.percent_complete}%`
                    : ""
                }
                emptyValue="Not recorded"
              />
              <Info
                label="Robbie ETA"
                value={item.projected_completion_date ?? ""}
                emptyValue="No ETA set"
              />
              <Info
                label="Delay Reason"
                value={item.delay_reason ?? ""}
                emptyValue="No delay reason"
              />
            </RoleVisible>
            <Info
              label="Full Primer Requested"
              value={
                item.smoked_in
                  ? item.primer_requested === false
                    ? "No"
                    : "Yes"
                  : "No"
              }
            />
          </div>

          <RoleVisible
            businessSlug={businessSlug}
            allow={["owner", "admin", "accountant", "technician"]}
          >
            <div className="mt-6 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm leading-6 text-sky-100">
              <p className="font-black uppercase tracking-[0.18em] text-sky-200">
                Internal scheduling note
              </p>
              <p className="mt-2">
                Needed By = property deadline. Priority = manager&apos;s requested
                order. Schedule = internal work plan.
              </p>
            </div>
          </RoleVisible>

          {item.smoked_in && (
            <div className="mt-6 inline-flex rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-300">
              {item.primer_requested === false
                ? "Smoker Unit / No Full Primer"
                : "Smoker Unit / Full Primer"}
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm text-zinc-500">Notes</p>
            <p className="mt-2 leading-7 text-zinc-300">
              {item.notes || "No notes added."}
            </p>
          </div>
        </Card>

        <RoleVisible
          businessSlug={businessSlug}
          allow={["owner", "admin", "accountant", "technician"]}
        >
          <InternalNotes
            businessId={item.business_id}
            entityType="queue_item"
            entityId={item.id}
            title="Queue Item Conversation"
          />
        </RoleVisible>

        <div id="complete-work" className="flex scroll-mt-6 flex-wrap gap-4">
          <BackButton label="Back" fallbackHref={`/queue?business=${businessSlug}`} />

          <RoleVisible
            businessSlug={businessSlug}
            allow={["owner", "admin", "accountant"]}
          >
            {!linkedEstimate && (
              <Link
                href={`/estimates/new?queueId=${item.id}&business=${businessSlug}`}
              >
                <Button>Create Estimate</Button>
              </Link>
            )}

            <Link href={`/queue/${item.id}/edit?business=${businessSlug}`}>
              <Button variant="secondary">Edit Queue Item</Button>
            </Link>
          </RoleVisible>

          <RoleVisible businessSlug={businessSlug} allow={["property_manager"]}>
            <Link href={`/queue/${item.id}/edit?business=${businessSlug}`}>
              <Button variant="secondary">Edit Queue Item</Button>
            </Link>
          </RoleVisible>

          {calendarHref ? (
            <a
              href={calendarHref}
              download={calendarFileName(calendarTitle, item.scheduled_date)}
              title="Download an .ics calendar file for Outlook, Apple Calendar, Google Calendar, or your phone."
              className="inline-flex items-center justify-center rounded-2xl bg-green-400 px-5 py-3 text-center font-semibold text-black transition hover:opacity-90"
            >
              Add To Calendar
            </a>
          ) : null}

          <RoleVisible businessSlug={businessSlug} allow={["owner", "admin"]}>
            <MarkCompletedButton
              queueItemId={item.id}
              businessId={item.business_id}
              businessSlug={businessSlug}
              label={`${item.property || "Property"} - Unit ${
                displayUnit || "-"
              }`}
              returnToQueue
            />
          </RoleVisible>

          <RoleVisible
            businessSlug={businessSlug}
            allow={["owner", "admin", "property_manager"]}
          >
            <DeleteQueueItemButton
              queueItemId={item.id}
              returnHref={`/queue?business=${businessSlug}`}
              disabledReason={deleteDisabledReason}
            />
          </RoleVisible>
        </div>
      </div>
    </AppShell>
  );
}

function AttentionCard({
  tone,
  label,
  value,
  detail,
}: {
  tone: string;
  label: string;
  value: string;
  detail: string;
}) {
  const toneClasses: Record<string, string> = {
    green: "attention-card attention-card-green border-green-500/40 bg-green-500/10",
    orange: "attention-card attention-card-orange border-orange-500/40 bg-orange-500/10",
    red: "attention-card attention-card-red border-red-500/40 bg-red-500/10",
    yellow: "attention-card attention-card-yellow border-yellow-500/40 bg-yellow-500/10",
    emerald:
      "attention-card attention-card-green border-emerald-500/40 bg-emerald-500/10",
    amber:
      "attention-card attention-card-yellow border-amber-500/40 bg-amber-500/10",
    rose: "attention-card attention-card-red border-rose-500/40 bg-rose-500/10",
    violet:
      "attention-card attention-card-violet border-violet-500/40 bg-violet-500/10",
    zinc: "attention-card attention-card-zinc border-zinc-800 bg-zinc-900",
  };

  return (
    <Card className={toneClasses[tone] ?? toneClasses.zinc}>
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-sm text-zinc-300">{detail}</p>
    </Card>
  );
}

function QueueWorkflowIntelligence({
  linkedEstimate,
  linkedInvoice,
  invoiceWasSent,
  invoiceDeliveryLabel,
  invoiceIsPaid,
  invoiceBalance,
  completedDate,
  nextAction,
}: {
  linkedEstimate: LinkedEstimate | null;
  linkedInvoice: LinkedInvoice | null;
  invoiceWasSent: boolean;
  invoiceDeliveryLabel: string;
  invoiceIsPaid: boolean;
  invoiceBalance: number | null;
  completedDate: string | null;
  nextAction: {
    title: string;
    detail: string;
    href: string;
    action: string;
  };
}) {
  const steps = [
    {
      label: "Estimate",
      value: linkedEstimate?.display_id ?? "Start estimate",
      done: Boolean(linkedEstimate),
    },
    {
      label: "Invoice",
      value: linkedInvoice?.display_id ?? "Not created",
      done: Boolean(linkedInvoice),
    },
    {
      label: "Delivery Proof",
      value: invoiceDeliveryLabel,
      done: invoiceWasSent,
    },
    {
      label: "Payment",
      value: invoiceIsPaid
        ? "Paid in full"
        : invoiceBalance !== null
          ? `${formatMoney(invoiceBalance)} open`
          : "Awaiting invoice",
      done: invoiceIsPaid,
    },
    {
      label: "Completion",
      value: completedDate ? formatHistoryDate(completedDate) : "In progress",
      done: Boolean(completedDate),
    },
  ];

  return (
    <Card className="queue-workflow-intelligence border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-indigo-500/10">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-sky-300">
            Workflow Intelligence
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            {nextAction.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            {nextAction.detail}
          </p>
        </div>

        <Link href={nextAction.href}>
          <Button variant="primary">{nextAction.action}</Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`queue-workflow-step rounded-2xl border px-4 py-3 ${
              step.done
                ? "border-emerald-400/30 bg-emerald-500/10"
                : "border-zinc-700 bg-black/25"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
              {step.label}
            </p>
            <p
              className={`mt-2 text-sm font-black ${
                step.done ? "text-emerald-200" : "text-zinc-200"
              }`}
            >
              {step.value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QueueChangeIntelligence({
  logs,
  changeCount,
}: {
  logs: QueueActivityLog[];
  changeCount: number;
}) {
  const latestLogs = logs.slice(0, 5);

  return (
    <Card className="queue-change-intelligence border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-zinc-950 to-amber-500/10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200">
            Change Intelligence
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            What changed on this job
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Schedule, priority, status, and field-session updates stay attached
            to this queue item so the history is easy to explain later.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
            Volatility
          </p>
          <p className="mt-1 text-2xl font-black text-white">
            {changeCount}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {latestLogs.length > 0 ? (
          latestLogs.map((log) => {
            const changes = queueActivityChanges(log);

            return (
              <div
                key={log.id}
                className="queue-change-row rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-white">
                      {queueActivityLabel(log.action)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {formatEventDateTime(log.created_at) || "Recent"}
                    </p>
                  </div>
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">
                    {changes.length > 0
                      ? `${changes.length} change${
                          changes.length === 1 ? "" : "s"
                        }`
                      : "Event"}
                  </span>
                </div>

                {changes.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {changes.slice(0, 4).map((change) => (
                      <span
                        key={`${log.id}-${change.field}`}
                        className="queue-change-chip rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300"
                      >
                        <span className="text-zinc-500">
                          {change.label}:{" "}
                        </span>
                        <span className="font-semibold text-white">
                          {formatChangeValue(change.previousValue)} to{" "}
                          {formatChangeValue(change.newValue)}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {detailValue(log.details, "jobType") ||
                      detailValue(log.details, "completedDate") ||
                      detailValue(log.details, "scheduledDate") ||
                      "Operational event saved to the activity trail."}
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <p className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-zinc-400">
            Changes will appear here after this queue item is scheduled,
            edited, completed, or worked by a technician.
          </p>
        )}
      </div>
    </Card>
  );
}

function Info({
  label,
  value,
  emptyValue = "-",
}: {
  label: string;
  value: string;
  emptyValue?: string;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-medium">{value || emptyValue}</p>
    </div>
  );
}

function HistorySummary({
  label,
  entry,
  fallback,
  detail,
}: {
  label: string;
  entry: UnitHistoryEntry | null;
  fallback?: string | null;
  detail?: string | null;
}) {
  const summary =
    entry?.paint_type ||
    entry?.wall_paint_color ||
    entry?.flooring ||
    entry?.prior_renovation_details ||
    entry?.notes ||
    fallback ||
    "";
  const subDetail =
    entry?.event_date
      ? formatHistoryDate(entry.event_date)
      : detail
        ? detail
        : fallback
          ? "From current queue item"
          : "No saved history yet";

  return (
    <div className="unit-intelligence-history-card rounded-2xl border border-sky-500/20 bg-black/25 p-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 font-semibold text-zinc-100">
        {summary || "-"}
      </p>
      <p className="mt-1 text-sm text-zinc-400">{subDetail}</p>
    </div>
  );
}

function LifecycleStep({
  label,
  value,
  active,
}: {
  label: string;
  value: string | null;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active
          ? "queue-lifecycle-step-active border-orange-500/40 bg-orange-500/10"
          : "queue-lifecycle-step-idle border-zinc-800 bg-zinc-950"
      }`}
    >
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 font-semibold">{value || "-"}</p>
    </div>
  );
}
