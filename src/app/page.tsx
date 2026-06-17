import Link from "next/link";
import AppShell from "./components/AppShell";
import Card from "./components/Card";
import Button from "./components/Button";
import StatusBadge from "./components/StatusBadge";
import RoleVisible from "./components/RoleVisible";
import { supabase } from "./lib/supabase";
import { maybeCanonicalApartmentUnitLabel } from "./utils/unitLabels";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  unit_layout: string | null;
  paint_type: string | null;
  flooring: string | null;
  status: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  notes: string | null;
  linked_estimate_id: string | null;
};

type Estimate = {
  id: string;
  project_title: string | null;
  customer_name: string | null;
  estimate_amount: string | null;
  status: string | null;
  created_at: string | null;
};

type Invoice = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  customer_name: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  updated_at: string | null;
  created_at: string | null;
  split_parent_invoice_id: string | null;
};

type ActivityLog = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value?.replace(/[^0-9.-]+/g, "") || 0);
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function invoiceCollectionAmountDue(invoice: Invoice) {
  const invoiceTotal = parseMoney(invoice.invoice_amount);
  const amountPaid = parseMoney(invoice.amount_paid);
  const fullAmountDue = Math.max(invoiceTotal - amountPaid, 0);
  const depositAmount = parseMoney(invoice.deposit_requested_amount ?? null);

  return hasActiveDepositRequest(invoice)
    ? Math.max(depositAmount - amountPaid, 0)
    : fullAmountDue;
}

function hasActiveDepositRequest(invoice: Invoice) {
  return (
    String(invoice.deposit_status ?? "none").toLowerCase() === "requested" &&
    parseMoney(invoice.deposit_requested_amount ?? null) > 0
  );
}

function isDateInCurrentMonth(value: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  const now = new Date();

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function VisualMoneyBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "orange" | "amber" | "rose" | "emerald";
}) {
  const toneStyles = {
    orange: {
      dot: "bg-sky-500",
      panel: "border-sky-500/20 bg-sky-500/5",
      text: "text-sky-100",
      ring: "#0284c7",
      ringSoft: "rgba(2, 132, 199, 0.14)",
      glow: "shadow-sky-500/20",
      pulse: "from-sky-500 to-cyan-300",
    },
    amber: {
      dot: "bg-indigo-500",
      panel: "border-indigo-500/20 bg-indigo-500/5",
      text: "text-indigo-100",
      ring: "#4f46e5",
      ringSoft: "rgba(79, 70, 229, 0.14)",
      glow: "shadow-indigo-500/20",
      pulse: "from-indigo-500 to-sky-300",
    },
    rose: {
      dot: "bg-rose-300",
      panel: "border-rose-500/20 bg-rose-500/5",
      text: "text-rose-100",
      ring: "#f9a8d4",
      ringSoft: "rgba(249, 168, 212, 0.14)",
      glow: "shadow-rose-500/20",
      pulse: "from-rose-300 to-pink-200",
    },
    emerald: {
      dot: "bg-emerald-300",
      panel: "border-emerald-500/20 bg-emerald-500/5",
      text: "text-emerald-100",
      ring: "#6ee7b7",
      ringSoft: "rgba(110, 231, 183, 0.14)",
      glow: "shadow-emerald-500/20",
      pulse: "from-emerald-300 to-teal-200",
    },
  }[tone];
  const percent = Math.min(
    Math.max((value / Math.max(max, 1)) * 100, 0),
    100
  );
  const displayPercent = Math.round(percent);
  const activePulseCount = Math.max(
    value > 0 ? 1 : 0,
    Math.ceil(percent / 20)
  );

  return (
    <div
      data-tone={tone}
      className={`dashboard-feature-card dark-surface relative overflow-hidden rounded-2xl border p-4 ${toneStyles.panel}`}
    >
      <span
        aria-hidden="true"
        className={`absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${toneStyles.pulse} opacity-10 blur-2xl`}
      />

      <div className="relative flex items-center gap-4">
        <div
          className={`grid h-20 w-20 shrink-0 place-items-center rounded-full shadow-2xl ${toneStyles.glow}`}
          style={{
            background: `conic-gradient(${toneStyles.ring} ${percent}%, rgba(255,255,255,0.1) ${percent}% 100%)`,
          }}
        >
          <div className="grid h-[4.4rem] w-[4.4rem] place-items-center rounded-full bg-zinc-950 text-center ring-1 ring-white/10">
            <span className={`text-lg font-black ${toneStyles.text}`}>
              {displayPercent}%
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${toneStyles.dot}`} />
            <p className="truncate text-sm font-semibold text-slate-100">
              {label}
            </p>
          </div>

          <p className={`mt-2 text-xl font-black ${toneStyles.text}`}>
            {formatMoney(value)}
          </p>

          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((pulseIndex) => (
              <span
                key={pulseIndex}
                aria-hidden="true"
                className={`h-2 rounded-full ${
                  pulseIndex < activePulseCount
                    ? `bg-gradient-to-r ${toneStyles.pulse}`
                    : "bg-white/10"
                }`}
                style={{
                  boxShadow:
                    pulseIndex < activePulseCount
                      ? `0 0 16px ${toneStyles.ringSoft}`
                      : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientRevenueRow({
  name,
  amount,
  invoiceCount,
  max,
  rank,
}: {
  name: string;
  amount: number;
  invoiceCount: number;
  max: number;
  rank: number;
}) {
  const width = Math.max((amount / max) * 100, amount > 0 ? 8 : 0);

  return (
    <div className="dashboard-feature-card dark-surface rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-orange-500/30 bg-orange-500/10 text-xs font-black text-orange-200">
              {rank}
            </span>

            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-50">
                {name}
              </p>

              <p className="mt-1 text-sm text-slate-400">
                {invoiceCount} invoice
                {invoiceCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>

        <p className="shrink-0 text-lg font-black text-orange-300">
          {formatMoney(amount)}
        </p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-300 to-emerald-300"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
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

function daysPastDue(value: string | null) {
  const dueDate = dateValue(value);

  if (!dueDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const difference = today.getTime() - dueDate.getTime();

  return Math.floor(difference / 86_400_000);
}

function formatShortDate(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return "-";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function dateYear(value: string | null) {
  const date = dateValue(value);

  return date ? date.getFullYear() : null;
}

function invoiceBelongsToYear(invoice: Invoice, year: number) {
  return (
    dateYear(invoice.issue_date) === year ||
    (!invoice.issue_date && dateYear(invoice.due_date) === year) ||
    (!invoice.issue_date &&
      !invoice.due_date &&
      dateYear(invoice.created_at) === year)
  );
}

function estimateBelongsToYear(estimate: Estimate, year: number) {
  return dateYear(estimate.created_at) === year;
}

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim().toLowerCase();
}

function invoiceStatusKey(value: string | null) {
  return (value || "Draft").trim().toLowerCase();
}

function isCollectibleInvoiceStatus(value: string | null) {
  const status = invoiceStatusKey(value);

  return status !== "paid" && status !== "draft";
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "queue_item.created": "Queue Created",
    "queue_item.scheduled": "Work Scheduled",
    "queue_item.completed": "Work Completed",
    "estimate.created": "Estimate Created",
    "estimate.updated": "Estimate Updated",
    "estimate.converted_to_invoice": "Estimate Converted",
    "estimate.deleted": "Estimate Deleted",
    "invoice.created": "Invoice Created",
    "invoice.updated": "Invoice Updated",
    "invoice.status_updated": "Invoice Updated",
    "invoice.email_sent": "Invoice Emailed",
    "invoice.payment_reminder_sent": "Payment Reminder Sent",
    "invoice.deposit_requested": "Deposit Requested",
    "invoice.deposit_cleared": "Deposit Cleared",
    "invoice.batch_payment_applied": "Payment Applied",
    "invoice.recurring_draft_created": "Recurring Draft Created",
    "invoice.split_created": "Split Invoices Created",
    "access_request.created": "Access Request Created",
    "estimate.email_sent": "Estimate Emailed",
    "import.clients_csv_completed": "Client CSV Import",
    "import.invoices_csv_completed": "Invoice CSV Import",
  };

  return labels[action] ?? action;
}

function activityTone(action: string) {
  if (action.includes("payment")) {
    return "border-green-500/35 bg-green-500/10 text-green-200";
  }

  if (action.includes("split")) {
    return "border-orange-500/35 bg-orange-500/10 text-orange-200";
  }

  if (action.startsWith("queue_item")) {
    return "border-sky-500/35 bg-sky-500/10 text-sky-200";
  }

  if (action.startsWith("estimate")) {
    return "border-purple-500/35 bg-purple-500/10 text-purple-200";
  }

  if (action.startsWith("invoice")) {
    return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  }

  if (action.startsWith("access_request")) {
    return "border-orange-500/35 bg-orange-500/10 text-orange-200";
  }

  if (action.startsWith("import")) {
    return "border-green-500/35 bg-green-500/10 text-green-200";
  }

  return "border-zinc-700 bg-zinc-950 text-zinc-300";
}

function activityHref(log: ActivityLog, businessSlug: string) {
  if (!log.entity_id) {
    return `/activity?business=${businessSlug}`;
  }

  if (log.entity_type === "queue_item") {
    return `/queue/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "estimate") {
    return `/estimates/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "invoice") {
    return `/invoices/${log.entity_id}?business=${businessSlug}`;
  }

  if (log.entity_type === "access_request") {
    return `/settings?business=${businessSlug}`;
  }

  if (log.entity_type === "import_batch") {
    return `/imports?business=${businessSlug}`;
  }

  return `/activity?business=${businessSlug}`;
}

function activityDetailValue(
  details: ActivityLog["details"],
  key: string
) {
  const value = details?.[key];

  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function activityMoneyValue(
  details: ActivityLog["details"],
  key: string
) {
  const value = details?.[key];

  if (typeof value === "number") {
    return formatMoney(value);
  }

  if (typeof value === "string" && value.trim()) {
    return formatMoney(parseMoney(value));
  }

  return null;
}

function activityProofDetail(log: ActivityLog) {
  const recipient = activityDetailValue(log.details, "recipient_email");
  const ccEmail = activityDetailValue(log.details, "cc_email");
  const pdfAttached = log.details?.pdf_attached === true;
  const depositAmount = activityMoneyValue(log.details, "depositAmount");
  const paymentAmount = activityMoneyValue(log.details, "amountApplied");

  if (recipient) {
    const parts = [`To ${recipient}`];

    if (ccEmail) {
      parts.push(`CC ${ccEmail}`);
    }

    if (pdfAttached) {
      parts.push("PDF attached");
    }

    return parts.join(" / ");
  }

  if (paymentAmount) {
    return `${paymentAmount} applied`;
  }

  if (depositAmount) {
    return `${depositAmount} requested`;
  }

  return log.actor_email ? `Logged by ${log.actor_email}` : "Logged in Trimax";
}

function relativeTime(value: string | null) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const differenceMinutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60_000)
  );

  if (differenceMinutes < 1) {
    return "Just now";
  }

  if (differenceMinutes < 60) {
    return `${differenceMinutes} min ago`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);

  if (differenceHours < 24) {
    return `${differenceHours} hr ago`;
  }

  const differenceDays = Math.floor(differenceHours / 24);

  return `${differenceDays} day${differenceDays === 1 ? "" : "s"} ago`;
}

function isClosedQueueStatus(value: string | null) {
  return ["completed", "invoiced", "paid"].includes(normalizeStatus(value));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const requestedBusinessSlug =
    resolvedSearchParams.business;

  const { data: businessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .order("name", { ascending: true });

  const businesses =
    (businessData ?? []) as Business[];

  const selectedBusiness =
    businesses.find(
      (business) =>
        business.slug === requestedBusinessSlug
    ) ??
    businesses.find(
      (business) => business.slug === "rnl-creations"
    ) ??
    businesses[0] ??
    null;

  const selectedBusinessSlug =
    selectedBusiness?.slug ?? "rnl-creations";

  let queueItems: QueueItem[] = [];
  let estimates: Estimate[] = [];
  let invoices: Invoice[] = [];
  let activityLogs: ActivityLog[] = [];

  if (selectedBusiness) {
    const [
      queueResponse,
      estimateResponse,
      invoiceResponse,
      activityResponse,
    ] = await Promise.all([
      supabase
        .from("queue_items")
        .select(
          "id, property, unit, unit_layout, paint_type, flooring, status, ready_date, scheduled_date, completed_date, smoked_in, notes, linked_estimate_id"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("estimates")
        .select("id, project_title, customer_name, estimate_amount, status, created_at")
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("invoices")
        .select(
          "id, display_id, project_title, customer_name, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, issue_date, due_date, updated_at, created_at, split_parent_invoice_id"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("activity_logs")
        .select(
          "id, actor_email, action, entity_type, entity_id, entity_label, details, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    queueItems =
      (queueResponse.data ?? []) as QueueItem[];
    estimates =
      (estimateResponse.data ?? []) as Estimate[];
    invoices =
      (invoiceResponse.data ?? []) as Invoice[];
    activityLogs =
      (activityResponse.data ?? []) as ActivityLog[];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);

  const queueSummary = queueItems.reduce(
    (summary, item) => {
      const status = normalizeStatus(item.status);
      const isClosed = isClosedQueueStatus(item.status);
      const readyDate = dateValue(item.ready_date);

      if (status !== "scheduled" && !isClosed) {
        summary.active.push(item);
      }

      if (item.status === "Scheduled" || Boolean(item.scheduled_date)) {
        summary.scheduled.push(item);
      }

      if (
        isDateInCurrentMonth(item.completed_date) ||
        (item.status === "Completed" &&
          isDateInCurrentMonth(item.scheduled_date))
      ) {
        summary.completedThisMonth.push(item);
      }

      if (
        Boolean(readyDate) &&
        readyDate! >= today &&
        readyDate! <= sevenDaysFromNow &&
        !item.scheduled_date &&
        status !== "scheduled" &&
        status !== "completed"
      ) {
        summary.readySoonUnscheduled.push(item);
      }

      if (
        item.smoked_in ||
        (item.notes || "").toLowerCase().includes("smok")
      ) {
        summary.remediation.push(item);
      }

      if (!item.linked_estimate_id && !isClosed) {
        summary.needingEstimate.push(item);
      }

      return summary;
    },
    {
      active: [] as QueueItem[],
      scheduled: [] as QueueItem[],
      completedThisMonth: [] as QueueItem[],
      readySoonUnscheduled: [] as QueueItem[],
      remediation: [] as QueueItem[],
      needingEstimate: [] as QueueItem[],
    }
  );
  const activeQueueItems = queueSummary.active;
  const scheduledQueueItems = queueSummary.scheduled;
  const completedThisMonth = queueSummary.completedThisMonth;
  const readySoonUnscheduled = queueSummary.readySoonUnscheduled;
  const remediationQueueItems = queueSummary.remediation;
  const queueItemsNeedingEstimate = queueSummary.needingEstimate;

  const splitParentInvoiceIds = new Set(
    invoices
      .map((invoice) => invoice.split_parent_invoice_id)
      .filter((id): id is string => Boolean(id))
  );
  const billableInvoices = invoices.filter(
    (invoice) => !splitParentInvoiceIds.has(invoice.id)
  );

  const openInvoices = billableInvoices.filter((invoice) =>
    isCollectibleInvoiceStatus(invoice.status)
  );

  const openInvoicesWithAmounts = openInvoices
    .map((invoice) => {
      return {
        ...invoice,
        amountDue: invoiceCollectionAmountDue(invoice),
        daysLate: daysPastDue(invoice.due_date),
      };
    })
    .filter((invoice) => invoice.amountDue > 0);

  const workingYear = new Date().getFullYear();
  const workingYearLabel = String(workingYear);
  const workingYearEstimates = estimates.filter((estimate) =>
    estimateBelongsToYear(estimate, workingYear)
  );
  const workingYearInvoices = billableInvoices.filter((invoice) =>
    invoiceBelongsToYear(invoice, workingYear)
  );
  const workingYearOpenInvoicesWithAmounts = openInvoicesWithAmounts;
  const historicalOpenInvoicesWithAmounts =
    openInvoicesWithAmounts.filter(
      (invoice) => !invoiceBelongsToYear(invoice, workingYear)
    );

  const outstandingRevenueTotal =
    workingYearOpenInvoicesWithAmounts.reduce(
      (total, invoice) =>
        total + invoice.amountDue,
      0
    );

  const estimatedRevenueTotal = workingYearEstimates.reduce(
    (total, estimate) =>
      total + parseMoney(estimate.estimate_amount),
    0
  );

  const invoicedRevenueTotal = workingYearInvoices.reduce(
    (total, invoice) =>
      total + parseMoney(invoice.invoice_amount),
    0
  );

  const ytdRevenueTotal = workingYearInvoices
    .filter((invoice) => invoice.status === "Paid")
    .reduce(
      (total, invoice) =>
        total + parseMoney(invoice.invoice_amount),
      0
    );

  const outstandingRevenue = formatMoney(
    outstandingRevenueTotal
  );
  const ytdRevenue = formatMoney(ytdRevenueTotal);

  const revenueVisualMax = Math.max(
    outstandingRevenueTotal,
    estimatedRevenueTotal,
    invoicedRevenueTotal,
    ytdRevenueTotal,
    1
  );

  const agingBuckets = [
    {
      label: "0-30 Days",
      min: 0,
      max: 30,
    },
    {
      label: "31-60 Days",
      min: 31,
      max: 60,
    },
    {
      label: "61-90 Days",
      min: 61,
      max: 90,
    },
    {
      label: "91+ Days",
      min: 91,
      max: Infinity,
    },
  ].map((bucket) => {
    const bucketInvoices = workingYearOpenInvoicesWithAmounts.filter((invoice) => {
      if (invoice.daysLate === null || invoice.daysLate < 0) {
        return false;
      }

      return (
        invoice.daysLate >= bucket.min &&
        invoice.daysLate <= bucket.max
      );
    });

    return {
      ...bucket,
      count: bucketInvoices.length,
      amount: bucketInvoices.reduce(
        (total, invoice) => total + invoice.amountDue,
        0
      ),
    };
  });

  const agingVisualMax = Math.max(
    ...agingBuckets.map((bucket) => bucket.amount),
    1
  );

  const queueFlow = [
    {
      label: "Review",
      value: queueItemsNeedingEstimate.length,
      detail: "Needs estimate",
      href: `/queue?business=${selectedBusinessSlug}&view=needs-estimate`,
      tone: "purple",
    },
    {
      label: "Schedule",
      value: readySoonUnscheduled.length,
      detail: "Ready soon",
      href: `/queue?business=${selectedBusinessSlug}&view=ready-soon`,
      tone: "amber",
    },
    {
      label: "Work",
      value: scheduledQueueItems.length,
      detail: "Scheduled",
      href: `/queue?business=${selectedBusinessSlug}&status=scheduled`,
      tone: "sky",
    },
    {
      label: "Done",
      value: completedThisMonth.length,
      detail: "This month",
      href: `/queue?business=${selectedBusinessSlug}&status=completed`,
      tone: "emerald",
    },
  ];

  const queueFlowStyles: Record<
    string,
    {
      accent: string;
      card: string;
      count: string;
      label: string;
      step: string;
    }
  > = {
    amber: {
      accent: "bg-amber-400",
      card: "border-amber-500/20 bg-amber-500/5 hover:border-amber-300/50",
      count: "text-amber-100",
      label: "text-amber-200/80",
      step: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    },
    emerald: {
      accent: "bg-emerald-400",
      card: "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-300/50",
      count: "text-emerald-100",
      label: "text-emerald-200/80",
      step: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    },
    purple: {
      accent: "bg-purple-400",
      card: "border-purple-500/20 bg-purple-500/5 hover:border-purple-300/50",
      count: "text-purple-100",
      label: "text-purple-200/80",
      step: "border-purple-400/20 bg-purple-400/10 text-purple-100",
    },
    sky: {
      accent: "bg-sky-400",
      card: "border-sky-500/20 bg-sky-500/5 hover:border-sky-300/50",
      count: "text-sky-100",
      label: "text-sky-200/80",
      step: "border-sky-400/20 bg-sky-400/10 text-sky-100",
    },
  };

  const mostOverdueInvoices = workingYearOpenInvoicesWithAmounts
    .filter((invoice) => (invoice.daysLate ?? -1) >= 0)
    .sort((first, second) => {
      return (second.daysLate ?? 0) - (first.daysLate ?? 0);
    })
    .slice(0, 5);
  const pastDueInvoices = workingYearOpenInvoicesWithAmounts.filter(
    (invoice) => (invoice.daysLate ?? -1) > 0
  );
  const pastDueTotal = pastDueInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const depositRequestInvoices = workingYearOpenInvoicesWithAmounts
    .filter(hasActiveDepositRequest)
    .sort((first, second) => second.amountDue - first.amountDue);
  const depositRequestTotal = depositRequestInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const largestOpenInvoice =
    [...workingYearOpenInvoicesWithAmounts].sort(
      (first, second) => second.amountDue - first.amountDue
    )[0] ?? null;
  const customerBalances = Array.from(
    workingYearOpenInvoicesWithAmounts
      .reduce(
        (
          groups,
          invoice
        ): Map<
          string,
          {
            customerName: string;
            count: number;
            total: number;
            oldestDue: string | null;
          }
        > => {
          const customerName = invoice.customer_name ?? "Unknown Customer";
          const current = groups.get(customerName) ?? {
            customerName,
            count: 0,
            total: 0,
            oldestDue: null,
          };
          const oldestDue =
            current.oldestDue && invoice.due_date
              ? current.oldestDue < invoice.due_date
                ? current.oldestDue
                : invoice.due_date
              : current.oldestDue ?? invoice.due_date;

          groups.set(customerName, {
            customerName,
            count: current.count + 1,
            total: current.total + invoice.amountDue,
            oldestDue,
          });

          return groups;
        },
        new Map<
          string,
          {
            customerName: string;
            count: number;
            total: number;
            oldestDue: string | null;
          }
        >()
      )
      .values()
  )
    .sort((first, second) => second.total - first.total)
    .slice(0, 3);

  const clientRevenueMix = Array.from(
    workingYearInvoices
      .reduce(
        (
          groups,
          invoice
        ): Map<
          string,
          {
            customerName: string;
            invoiceCount: number;
            total: number;
          }
        > => {
          const customerName = invoice.customer_name ?? "Unknown Customer";
          const current = groups.get(customerName) ?? {
            customerName,
            invoiceCount: 0,
            total: 0,
          };

          groups.set(customerName, {
            customerName,
            invoiceCount: current.invoiceCount + 1,
            total: current.total + parseMoney(invoice.invoice_amount),
          });

          return groups;
        },
        new Map<
          string,
          {
            customerName: string;
            invoiceCount: number;
            total: number;
          }
        >()
      )
      .values()
  )
    .sort((first, second) => second.total - first.total)
    .slice(0, 4);
  const clientRevenueMax = Math.max(
    ...clientRevenueMix.map((client) => client.total),
    1
  );
  const collectionRate =
    invoicedRevenueTotal > 0
      ? Math.round((ytdRevenueTotal / invoicedRevenueTotal) * 100)
      : 0;
  const outstandingRate =
    invoicedRevenueTotal > 0
      ? Math.round((outstandingRevenueTotal / invoicedRevenueTotal) * 100)
      : 0;
  const priorityInvoice =
    mostOverdueInvoices[0] ??
    depositRequestInvoices[0] ??
    largestOpenInvoice;
  const priorityCustomerBalance = customerBalances[0] ?? null;
  const priorityPaymentParams = new URLSearchParams({
    business: selectedBusinessSlug,
    customer:
      priorityCustomerBalance?.customerName ??
      priorityInvoice?.customer_name ??
      "",
  });
  const commandCenterItems = [
    {
      label: "Collect",
      title: priorityCustomerBalance
        ? `Collect from ${priorityCustomerBalance.customerName}`
        : "Open payment workspace",
      metric: priorityCustomerBalance
        ? formatMoney(priorityCustomerBalance.total)
        : outstandingRevenue,
      detail: priorityCustomerBalance
        ? `${priorityCustomerBalance.count} open invoice${
            priorityCustomerBalance.count === 1 ? "" : "s"
          } ready to reconcile.`
        : "Review open balances and apply incoming checks.",
      href: `/payments?${priorityPaymentParams.toString()}`,
      action: "Open Payments",
      tone: "collect",
    },
    {
      label: "Remind",
      title:
        pastDueInvoices.length > 0
          ? "Send late payment reminders"
          : "No late reminders due",
      metric: String(pastDueInvoices.length),
      detail:
        pastDueInvoices.length > 0
          ? `${formatMoney(pastDueTotal)} is past due across open invoices.`
          : "The overdue reminder queue is clear right now.",
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      action: "Review Aging",
      tone: "remind",
    },
    {
      label: "Capture",
      title: "Photograph a check",
      metric: String(workingYearOpenInvoicesWithAmounts.length),
      detail:
        "Open the camera-ready check workflow and match payments to invoices.",
      href: `/payments?business=${selectedBusinessSlug}#check-capture`,
      action: "Capture Check",
      tone: "capture",
    },
    {
      label: "Create",
      title: "Send the next invoice",
      metric: workingYearLabel,
      detail:
        "Create an invoice, request a deposit, or turn approved work into billable revenue.",
      href: `/invoices/new?business=${selectedBusinessSlug}`,
      action: "New Invoice",
      tone: "create",
    },
  ];
  const queueFocusHeadline =
    readySoonUnscheduled.length > 0
      ? "Schedule ready units first"
      : queueItemsNeedingEstimate.length > 0
        ? "Finish queue estimates"
        : remediationQueueItems.length > 0
          ? "Watch remediation risk"
          : scheduledQueueItems.length > 0
            ? "Work is already scheduled"
            : "Queue is calm";
  const queueFocusDetail =
    readySoonUnscheduled.length > 0
      ? `${readySoonUnscheduled.length} unit${
          readySoonUnscheduled.length === 1 ? "" : "s"
        } are due within 7 days and not scheduled.`
      : queueItemsNeedingEstimate.length > 0
        ? `${queueItemsNeedingEstimate.length} queue item${
            queueItemsNeedingEstimate.length === 1 ? "" : "s"
          } still need an estimate before billing can move.`
        : remediationQueueItems.length > 0
          ? `${remediationQueueItems.length} item${
              remediationQueueItems.length === 1 ? "" : "s"
            } have smoker or remediation notes.`
          : scheduledQueueItems.length > 0
            ? `${scheduledQueueItems.length} job${
                scheduledQueueItems.length === 1 ? "" : "s"
              } are on the schedule.`
            : "No active queue work needs immediate attention.";
  const queueActionItems = [
    {
      label: "Needs Estimate",
      value: queueItemsNeedingEstimate.length,
      detail: "Queue work not linked to an estimate",
      href: `/queue?business=${selectedBusinessSlug}&view=needs-estimate`,
      tone: "sky",
    },
    {
      label: "Ready Soon",
      value: readySoonUnscheduled.length,
      detail: "Due within 7 days and unscheduled",
      href: `/queue?business=${selectedBusinessSlug}&view=ready-soon`,
      tone: "amber",
    },
    {
      label: "Scheduled",
      value: scheduledQueueItems.length,
      detail: "Jobs already on the calendar",
      href: `/queue?business=${selectedBusinessSlug}&status=scheduled`,
      tone: "emerald",
    },
    {
      label: "Remediation",
      value: remediationQueueItems.length,
      detail: "Smoker or extra-prep watch list",
      href: `/queue?business=${selectedBusinessSlug}&view=remediation`,
      tone: "rose",
    },
  ];
  const recentQueueItems = queueItems.slice(0, 3);
  const mobilePriorityItems = [
    {
      label: "Collect",
      value: outstandingRevenue,
      detail: "Open revenue",
      href: `/payments?${priorityPaymentParams.toString()}`,
      tone: "collect",
    },
    {
      label: "Queue",
      value: String(activeQueueItems.length),
      detail: "Active items",
      href: `/queue?business=${selectedBusinessSlug}`,
      tone: "queue",
    },
    {
      label: "Late",
      value: String(pastDueInvoices.length),
      detail: formatMoney(pastDueTotal),
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      tone: "late",
    },
    {
      label: "Checks",
      value: String(workingYearOpenInvoicesWithAmounts.length),
      detail: "Match payments",
      href: `/payments?business=${selectedBusinessSlug}#check-capture`,
      tone: "checks",
    },
  ];
  const dashboardFocusItems = [
    {
      label: "Collect",
      title: priorityCustomerBalance
        ? priorityCustomerBalance.customerName
        : priorityInvoice?.customer_name ?? "Open payment workspace",
      metric: priorityCustomerBalance
        ? formatMoney(priorityCustomerBalance.total)
        : priorityInvoice
          ? formatMoney(invoiceCollectionAmountDue(priorityInvoice))
          : outstandingRevenue,
      detail: priorityCustomerBalance
        ? `${priorityCustomerBalance.count} open invoice${
            priorityCustomerBalance.count === 1 ? "" : "s"
          } ready for payment review.`
        : "Open balances and deposit requests are ready to reconcile.",
      href: `/payments?${priorityPaymentParams.toString()}`,
      tone: "collect",
    },
    {
      label: "Queue",
      title: queueFocusHeadline,
      metric: String(activeQueueItems.length),
      detail: queueFocusDetail,
      href: `/queue?business=${selectedBusinessSlug}`,
      tone: "queue",
    },
    {
      label: "Follow Up",
      title:
        pastDueInvoices.length > 0
          ? "Late reminders"
          : depositRequestInvoices.length > 0
            ? "Deposit requests"
            : "Check capture",
      metric:
        pastDueInvoices.length > 0
          ? String(pastDueInvoices.length)
          : depositRequestInvoices.length > 0
            ? String(depositRequestInvoices.length)
            : String(workingYearOpenInvoicesWithAmounts.length),
      detail:
        pastDueInvoices.length > 0
          ? `${formatMoney(pastDueTotal)} is past due and ready for reminder review.`
          : depositRequestInvoices.length > 0
            ? `${formatMoney(depositRequestTotal)} is waiting on active deposit requests.`
            : "Use check capture when a payment arrives and Trimax will suggest invoice matches.",
      href:
        pastDueInvoices.length > 0
          ? `/invoices?business=${selectedBusinessSlug}&view=aging`
          : depositRequestInvoices[0]
            ? `/invoices/${depositRequestInvoices[0].id}?business=${selectedBusinessSlug}`
            : `/payments?business=${selectedBusinessSlug}#check-capture`,
      tone:
        pastDueInvoices.length > 0
          ? "late"
          : depositRequestInvoices.length > 0
            ? "deposit"
            : "checks",
    },
  ];
  const proofActions = new Set([
    "estimate.email_sent",
    "invoice.email_sent",
    "invoice.payment_reminder_sent",
    "invoice.deposit_requested",
    "invoice.deposit_cleared",
    "invoice.batch_payment_applied",
    "invoice.recurring_draft_created",
    "invoice.split_created",
  ]);
  const communicationProofLogs = activityLogs
    .filter((log) => proofActions.has(log.action))
    .slice(0, 3);
  const reminderInvoiceIds = new Set(
    activityLogs
      .filter((log) => log.action === "invoice.payment_reminder_sent")
      .map((log) => log.entity_id)
      .filter(Boolean)
  );
  const pastDueWithoutReminderCount = pastDueInvoices.filter(
    (invoice) => !reminderInvoiceIds.has(invoice.id)
  ).length;
  const customerEmailWithoutPdfCount = activityLogs.filter(
    (log) =>
      [
        "estimate.email_sent",
        "invoice.email_sent",
        "invoice.payment_reminder_sent",
      ].includes(log.action) && log.details?.pdf_attached !== true
  ).length;
  const paymentWithoutImageProofCount = activityLogs.filter(
    (log) =>
      log.action === "invoice.batch_payment_applied" &&
      !log.details?.paymentAttachmentId &&
      !log.details?.paymentImagePath
  ).length;
  const totalRiskFlags =
    pastDueWithoutReminderCount +
    customerEmailWithoutPdfCount +
    paymentWithoutImageProofCount;
  const auditHealthLabel =
    totalRiskFlags === 0
      ? "Audit trail clean"
      : totalRiskFlags <= 2
        ? "Minor proof gaps"
        : "Proof review needed";
  const auditHealthDetail =
    totalRiskFlags === 0
      ? "Trimax sees no obvious proof gaps in the current dashboard snapshot."
      : `${totalRiskFlags} proof gap${
          totalRiskFlags === 1 ? "" : "s"
        } should be reviewed before month-end or a client follow-up.`;
  const riskRadarItems = [
    {
      label: "Reminder Gap",
      value: pastDueWithoutReminderCount,
      detail:
        pastDueWithoutReminderCount > 0
          ? "Past-due invoices without a logged reminder"
          : "Past-due reminders are accounted for",
      action:
        pastDueWithoutReminderCount > 0 ? "Review aging" : "Looks clean",
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      tone: pastDueWithoutReminderCount > 0 ? "rose" : "emerald",
    },
    {
      label: "PDF Gap",
      value: customerEmailWithoutPdfCount,
      detail:
        customerEmailWithoutPdfCount > 0
          ? "Sent messages without attached PDF proof"
          : "Recent sends include PDF proof",
      action:
        customerEmailWithoutPdfCount > 0 ? "Open proof log" : "Looks clean",
      href: `/activity?business=${selectedBusinessSlug}&type=invoice&q=pdf`,
      tone: customerEmailWithoutPdfCount > 0 ? "amber" : "emerald",
    },
    {
      label: "Image Gap",
      value: paymentWithoutImageProofCount,
      detail:
        paymentWithoutImageProofCount > 0
          ? "Payments recorded without check or stub images"
          : "Payment image proof is current",
      action:
        paymentWithoutImageProofCount > 0 ? "Review payments" : "Looks clean",
      href: `/activity?business=${selectedBusinessSlug}&type=payment`,
      tone: paymentWithoutImageProofCount > 0 ? "sky" : "emerald",
    },
  ];
  const topPriorityStackCandidates: {
    action: string;
    detail: string;
    href: string;
    label: string;
    metric: string;
    score: number;
    tone: string;
  }[] = [];

  if (priorityInvoice) {
    const priorityInvoiceAmountDue = invoiceCollectionAmountDue(priorityInvoice);
    const priorityInvoiceDaysLate = daysPastDue(priorityInvoice.due_date) ?? -1;
    const isPriorityDeposit = hasActiveDepositRequest(priorityInvoice);

    topPriorityStackCandidates.push({
      action: isPriorityDeposit ? "Open deposit" : "Open invoice",
      detail:
        priorityInvoice.customer_name ??
        priorityInvoice.project_title ??
        "Customer balance",
      href: `/invoices/${priorityInvoice.id}?business=${selectedBusinessSlug}`,
      label:
        priorityInvoiceDaysLate > 0
          ? "Past-due collection"
          : isPriorityDeposit
            ? "Deposit follow-up"
            : "Largest open invoice",
      metric: formatMoney(priorityInvoiceAmountDue),
      score:
        (priorityInvoiceDaysLate > 0 ? 900 : isPriorityDeposit ? 760 : 520) +
        Math.min(priorityInvoiceAmountDue / 100, 140),
      tone:
        priorityInvoiceDaysLate > 0
          ? "rose"
          : isPriorityDeposit
            ? "emerald"
            : "sky",
    });
  }

  if (readySoonUnscheduled[0]) {
    const item = readySoonUnscheduled[0];

    topPriorityStackCandidates.push({
      action: "Schedule",
      detail: `${item.property || "Property"} - Unit ${
        maybeCanonicalApartmentUnitLabel(item.unit) || "-"
      }`,
      href: `/queue/${item.id}?business=${selectedBusinessSlug}`,
      label: "Ready unit waiting",
      metric: formatShortDate(item.ready_date),
      score: 720,
      tone: "amber",
    });
  }

  if (queueItemsNeedingEstimate[0]) {
    const item = queueItemsNeedingEstimate[0];

    topPriorityStackCandidates.push({
      action: "Build estimate",
      detail: `${item.property || "Property"} - Unit ${
        maybeCanonicalApartmentUnitLabel(item.unit) || "-"
      }`,
      href: `/queue/${item.id}?business=${selectedBusinessSlug}`,
      label: "Estimate needed",
      metric: String(queueItemsNeedingEstimate.length),
      score: 680,
      tone: "violet",
    });
  }

  if (totalRiskFlags > 0) {
    topPriorityStackCandidates.push({
      action: "Review proof",
      detail: auditHealthDetail,
      href: `/activity?business=${selectedBusinessSlug}`,
      label: "Proof gap",
      metric: String(totalRiskFlags),
      score: 640 + totalRiskFlags * 20,
      tone: "rose",
    });
  }

  if (workingYearOpenInvoicesWithAmounts.length > 0) {
    topPriorityStackCandidates.push({
      action: "Capture check",
      detail: "Match incoming payments to the best open invoices.",
      href: `/payments?business=${selectedBusinessSlug}#check-capture`,
      label: "Payment matching",
      metric: String(workingYearOpenInvoicesWithAmounts.length),
      score: 420,
      tone: "emerald",
    });
  }

  const topPriorityStack = topPriorityStackCandidates
    .sort((first, second) => second.score - first.score)
    .slice(0, 4);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Dashboard
            </h1>

            <p className="mt-2 text-zinc-400">
              Operations overview for{" "}
              {selectedBusiness?.name ??
                "your business"}
              .
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Workspace
            </p>

            <p className="mt-1 font-semibold text-orange-300">
              {selectedBusiness?.name ?? "Trimax"}
            </p>
          </div>
        </div>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <section className="dashboard-mobile-priority lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="dashboard-mobile-priority-kicker text-xs font-black uppercase tracking-[0.18em] text-sky-300">
                  Priority Rail
                </p>

                <h2 className="mt-1 text-lg font-black">
                  Start here
                </h2>
              </div>

              <Link
                href={`/reports?business=${selectedBusinessSlug}`}
                className="dashboard-mobile-priority-link rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-sky-100"
              >
                Reports
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {mobilePriorityItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  data-tone={item.tone}
                  className="dashboard-mobile-priority-card rounded-2xl border p-4 transition active:scale-[0.98]"
                >
                  <p className="text-xs font-black uppercase tracking-[0.14em]">
                    {item.label}
                  </p>

                  <p className="mt-2 truncate text-2xl font-black">
                    {item.value}
                  </p>

                  <p className="mt-1 text-xs font-semibold opacity-80">
                    {item.detail}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
          fallback={
            <Card className="border-orange-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Property Coordination
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-tight">
                Review active queue items
              </h2>

              <p className="mt-3 max-w-3xl text-zinc-400">
                This workspace view focuses on queue
                intake, readiness dates, scheduling, and
                property reports.
              </p>

              <Link
                href={`/queue?business=${selectedBusinessSlug}`}
                className="mt-5 inline-block"
              >
                <Button>Open Queue</Button>
              </Link>
            </Card>
          }
        >
          <Card className="dashboard-hero-card dark-surface border-sky-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="dashboard-hero-hud mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.26em] text-sky-200">
                  Platinum Command Signal
                </p>

                <p className="mt-1 text-sm text-zinc-300">
                  {auditHealthLabel} for {selectedBusiness?.name ?? "Trimax"}.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="dashboard-hero-signal rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-zinc-400">
                    Audit
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {totalRiskFlags} flag{totalRiskFlags === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="dashboard-hero-signal rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-zinc-400">
                    Collection
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {collectionRate}% paid
                  </p>
                </div>

                <div className="dashboard-hero-signal rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-zinc-400">
                    Queue
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {activeQueueItems.length} active
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                  Open Revenue
                </p>

                <h2 className="mt-3 text-5xl font-black tracking-tight text-white">
                  {outstandingRevenue}
                </h2>

                <p className="mt-3 text-zinc-400">
                  Open invoices and active deposit requests, including imported
                  FreshBooks balances.
                </p>

                {historicalOpenInvoicesWithAmounts.length > 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    {historicalOpenInvoicesWithAmounts.length} older open
                    invoice
                    {historicalOpenInvoicesWithAmounts.length === 1
                      ? ""
                      : "s"}{" "}
                    included in this dashboard total.
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-zinc-400">
                    Open Now
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {workingYearOpenInvoicesWithAmounts.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-zinc-400">
                    {workingYearLabel} Paid
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {ytdRevenue}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <section id="dashboard-focus" className="dashboard-focus-strip scroll-mt-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="dashboard-section-label text-sm uppercase tracking-[0.3em] text-sky-300">
                  Today&apos;s Focus
                </p>

                <h2 className="mt-1 text-2xl font-black tracking-tight">
                  Three moves worth your attention
                </h2>
              </div>

              <p className="max-w-xl text-sm leading-6 text-zinc-400">
                Trimax keeps the dashboard centered on the work that moves
                money, schedules, and customer follow-up forward.
              </p>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.72fr]">
              <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                {dashboardFocusItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    data-tone={item.tone}
                    className="dashboard-focus-card rounded-2xl border p-4 transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em]">
                        {item.label}
                      </p>

                      <span className="dashboard-focus-metric rounded-full border px-3 py-1 text-sm font-black">
                        {item.metric}
                      </span>
                    </div>

                    <h3 className="mt-4 line-clamp-2 text-lg font-black">
                      {item.title}
                    </h3>

                    <p className="mt-2 line-clamp-3 text-sm leading-6">
                      {item.detail}
                    </p>
                  </Link>
                ))}
              </div>

              <div className="dashboard-priority-stack rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em]">
                      Priority Stack
                    </p>
                    <h3 className="mt-1 text-lg font-black">
                      Cream at the top
                    </h3>
                  </div>

                  <span className="dashboard-priority-stack-count rounded-full border px-3 py-1 text-sm font-black">
                    {topPriorityStack.length}
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {topPriorityStack.length > 0 ? (
                    topPriorityStack.map((item, index) => (
                      <Link
                        key={`${item.label}-${item.href}`}
                        href={item.href}
                        data-tone={item.tone}
                        className="dashboard-priority-stack-item group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 transition hover:-translate-y-0.5"
                      >
                        <span className="dashboard-priority-stack-rank grid h-9 w-9 place-items-center rounded-full text-sm font-black">
                          {index + 1}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-semibold">
                            {item.detail}
                          </span>
                        </span>

                        <span className="text-right">
                          <span className="block text-sm font-black">
                            {item.metric}
                          </span>
                          <span className="mt-0.5 block text-[0.68rem] font-black uppercase tracking-[0.12em]">
                            {item.action}
                          </span>
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="dashboard-priority-stack-empty rounded-2xl border border-dashed p-4 text-sm leading-6">
                      Nothing is pressing right now. The workspace is clean and
                      ready for the next job, invoice, or payment.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </RoleVisible>

        <Card
          id="dashboard-queue"
          className="dashboard-queue-command dark-surface hidden scroll-mt-6 overflow-hidden border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/20 lg:block"
        >
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
            <div>
              <p className="dashboard-section-label text-sm uppercase tracking-[0.3em] text-sky-300">
                Queue Command
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                {queueFocusHeadline}
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                {queueFocusDetail} This keeps apartment turns visible without
                making the dashboard feel like a full queue page.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/queue?business=${selectedBusinessSlug}`}
                  className="rounded-full bg-sky-400 px-5 py-3 text-sm font-black text-zinc-950 shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-300"
                >
                  Open Queue
                </Link>

                <Link
                  href={`/new-request?business=${selectedBusinessSlug}`}
                  className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-white/10"
                >
                  New Queue Item
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {queueActionItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  data-tone={item.tone}
                  className="dashboard-queue-command-card rounded-2xl border border-zinc-800 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
                      {item.label}
                    </p>

                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                      {item.value}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-5 text-zinc-300">
                    {item.detail}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {recentQueueItems.length > 0 ? (
            <div className="dashboard-queue-mini-list mt-5 grid gap-3 lg:grid-cols-3">
              {recentQueueItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/queue/${item.id}?business=${selectedBusinessSlug}`}
                  className="dashboard-feature-card dark-surface rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-sky-400/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {item.property || "Property"} - Unit{" "}
                        {maybeCanonicalApartmentUnitLabel(item.unit) || "-"}
                      </p>

                      <p className="mt-1 truncate text-sm text-zinc-400">
                        {item.paint_type || "Paint TBD"} /{" "}
                        {item.flooring || "Flooring TBD"}
                      </p>
                    </div>

                    <StatusBadge status={item.status || "Pending"} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                      Due {formatShortDate(item.ready_date)}
                    </span>

                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                      Scheduled {formatShortDate(item.scheduled_date)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <Card
            id="dashboard-accounting"
            className="dashboard-command-center dark-surface scroll-mt-6 overflow-hidden border-sky-500/20 bg-zinc-950"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="dashboard-command-label text-sm uppercase tracking-[0.3em] text-sky-300">
                  Today&apos;s Command Center
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
                  The next best accounting moves
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  Start with collection, reminders, check capture, or a new
                  invoice without hunting through the dashboard.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <p className="text-zinc-400">Open revenue</p>
                <p className="mt-1 text-xl font-black text-white">
                  {outstandingRevenue}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {commandCenterItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  data-tone={item.tone}
                  className="dashboard-command-card group rounded-2xl border border-zinc-800 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">
                      {item.label}
                    </p>

                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                      {item.metric}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-black text-white">
                    {item.title}
                  </h3>

                  <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-300">
                    {item.detail}
                  </p>

                  <p className="mt-4 inline-flex items-center gap-2 text-sm font-black text-sky-200 transition group-hover:text-white">
                    {item.action}
                    <span aria-hidden="true">&gt;</span>
                  </p>
                </Link>
              ))}
            </div>

            <div className="dashboard-proof-strip mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">
                    Communication Proof
                  </p>

                  <h3 className="mt-1 text-lg font-black text-white">
                    Recently logged customer touches
                  </h3>
                </div>

                <Link
                  href={`/activity?business=${selectedBusinessSlug}`}
                  className="text-sm font-black text-sky-200 transition hover:text-white"
                >
                  Open activity
                </Link>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {communicationProofLogs.map((log) => (
                  <Link
                    key={log.id}
                    href={activityHref(log, selectedBusinessSlug)}
                    className="dashboard-proof-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">
                        {activityLabel(log.action)}
                      </p>

                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-black text-white">
                        {relativeTime(log.created_at)}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-1 font-black text-white">
                      {log.entity_label ?? "Workspace activity"}
                    </p>

                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-300">
                      {activityProofDetail(log)}
                    </p>
                  </Link>
                ))}

                {communicationProofLogs.length === 0 ? (
                  <p className="dashboard-proof-card rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-sm leading-6 text-zinc-300 lg:col-span-3">
                    Send an invoice, estimate, reminder, deposit request, or
                    payment batch and Trimax will show the latest proof here.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="dashboard-risk-radar mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                    Risk Radar
                  </p>

                  <h3 className="mt-1 text-lg font-black text-white">
                    {auditHealthLabel}
                  </h3>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-300">
                    {auditHealthDetail}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="dashboard-risk-health rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                    {totalRiskFlags} flag{totalRiskFlags === 1 ? "" : "s"}
                  </span>

                  <Link
                    href={`/activity?business=${selectedBusinessSlug}`}
                    className="text-sm font-black text-cyan-200 transition hover:text-white"
                  >
                    Audit trail
                  </Link>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {riskRadarItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    data-tone={item.tone}
                    className="dashboard-risk-card rounded-2xl border border-white/10 bg-zinc-950/70 p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                        {item.label}
                      </p>

                      <span className="dashboard-risk-count rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-white">
                        {item.value}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      {item.detail}
                    </p>

                    <p className="mt-3 text-sm font-black text-cyan-100">
                      {item.action}
                      <span aria-hidden="true"> &gt;</span>
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </Card>

        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          {customerBalances.length > 0 ? (
            <Card className="dashboard-collection-targets dark-surface border-green-500/20 bg-green-500/5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                    Collection Targets
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Customers with unpaid balances
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                    Active collection targets include imported FreshBooks
                    balances and deposit requests.
                  </p>
                </div>

                <Link href={`/payments?business=${selectedBusinessSlug}`}>
                  <Button variant="secondary">Open Payments</Button>
                </Link>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {customerBalances.map((customer) => {
                  const paymentParams = new URLSearchParams({
                    business: selectedBusinessSlug,
                    customer: customer.customerName,
                  });
                  const invoiceParams = new URLSearchParams({
                    business: selectedBusinessSlug,
                    customer: customer.customerName,
                    collection: "open",
                    year: workingYearLabel,
                  });

                  return (
                    <div
                      key={customer.customerName}
                      className="dashboard-collection-target-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-white">
                            {customer.customerName}
                          </p>
                          <p className="mt-1 text-sm text-zinc-500">
                            {customer.count} open invoice
                            {customer.count === 1 ? "" : "s"}
                          </p>
                        </div>

                        <p className="text-xl font-black text-green-300">
                          {formatMoney(customer.total)}
                        </p>
                      </div>

                      <p className="mt-3 text-sm text-zinc-400">
                        Oldest due date: {formatShortDate(customer.oldestDue)}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          href={`/payments?${paymentParams.toString()}`}
                          className="rounded-full bg-green-400 px-4 py-2 text-sm font-black text-black transition hover:bg-green-300"
                        >
                          Record Payment
                        </Link>

                        <Link
                          href={`/invoices?${invoiceParams.toString()}`}
                          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
                        >
                          View Invoices
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <div
            id="dashboard-reports"
            className="hidden scroll-mt-6 gap-4 lg:grid xl:grid-cols-[1.2fr_0.8fr]"
          >
            <Card className="dashboard-money-section dark-surface border-sky-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-sky-950/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="dashboard-section-label text-sm uppercase tracking-[0.3em] text-sky-300">
                    Money Flow
                  </p>

                  <h2 className="mt-2 text-2xl font-bold text-white">
                    Revenue snapshot
                  </h2>

                  <p className="mt-1 text-sm text-zinc-400">
                    Showing {workingYearLabel} activity by default.
                  </p>
                </div>

                <Link
                  href={`/reports?business=${selectedBusinessSlug}`}
                  className="text-sm font-semibold text-sky-400"
                >
                  Open reports
                </Link>
              </div>

              <div className="mt-6 grid gap-3">
                <VisualMoneyBar
                  label="Estimated"
                  value={estimatedRevenueTotal}
                  max={revenueVisualMax}
                  tone="orange"
                />
                <VisualMoneyBar
                  label="Invoiced"
                  value={invoicedRevenueTotal}
                  max={revenueVisualMax}
                  tone="amber"
                />
                <VisualMoneyBar
                  label="Outstanding"
                  value={outstandingRevenueTotal}
                  max={revenueVisualMax}
                  tone="rose"
                />
                <VisualMoneyBar
                  label="Paid YTD"
                  value={ytdRevenueTotal}
                  max={revenueVisualMax}
                  tone="emerald"
                />
              </div>
            </Card>

            <Card className="dashboard-queue-section dark-surface border-sky-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-sky-950/20">
              <p className="dashboard-section-label text-sm uppercase tracking-[0.3em] text-sky-300">
                Queue Flow
              </p>

              <h2 className="mt-2 text-2xl font-bold text-white">
                Turnover pipeline
              </h2>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {queueFlow.map((step, index) => {
                  const style = queueFlowStyles[step.tone];

                  return (
                    <Link
                      key={step.label}
                      href={step.href}
                      data-tone={step.tone}
                      className={`dashboard-flow-card relative overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 ${style.card}`}
                    >
                      <span className={`absolute inset-x-0 top-0 h-1 ${style.accent}`} />

                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-xs uppercase tracking-[0.2em] ${style.label}`}>
                          {step.label}
                        </p>

                        <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-black ${style.step}`}>
                          {index + 1}
                        </span>
                      </div>

                      <p className={`mt-3 text-3xl font-black ${style.count}`}>
                        {step.value}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {step.detail}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </div>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <div className="hidden gap-4 lg:grid xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="dashboard-cash-section dark-surface border-emerald-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/20">
              <p className="dashboard-section-label text-sm uppercase tracking-[0.3em] text-emerald-300">
                Collection Health
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Cash position
              </h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="text-sm text-emerald-100/80">
                    Collected
                  </p>

                  <p className="mt-2 text-3xl font-black text-emerald-100">
                    {collectionRate}%
                  </p>

                  <p className="mt-1 text-sm text-zinc-400">
                    Paid against total invoice value.
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                  <p className="text-sm text-rose-100/80">
                    Still Open
                  </p>

                  <p className="mt-2 text-3xl font-black text-rose-100">
                    {outstandingRate}%
                  </p>

                  <p className="mt-1 text-sm text-zinc-400">
                    Open unpaid invoice balance.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold text-white">
                    Next collection move
                  </p>

                  <span className="app-sky-pill rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sky-200">
                    Batch-ready workflow
                  </span>
                </div>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Use Payments when one check covers several invoices. It keeps
                  the batch workflow together and updates invoice balances in
                  one place.
                </p>

                <Link
                  href={`/payments?business=${selectedBusinessSlug}`}
                  className="mt-4 inline-block rounded-full bg-emerald-400 px-4 py-2 text-sm font-black text-black transition hover:bg-emerald-300"
                >
                  Open Payments
                </Link>
              </div>
            </Card>

            <Card className="dashboard-client-section dark-surface border-sky-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-sky-950/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="dashboard-section-label text-sm uppercase tracking-[0.3em] text-sky-300">
                    Revenue By Client
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Top invoice sources
                  </h2>
                </div>

                <Link
                  href={`/invoices?business=${selectedBusinessSlug}`}
                  className="text-sm font-semibold text-sky-400"
                >
                  View invoices
                </Link>
              </div>

              <div className="mt-5 grid gap-3">
                {clientRevenueMix.map((client, index) => (
                  <ClientRevenueRow
                    key={client.customerName}
                    name={client.customerName}
                    amount={client.total}
                    invoiceCount={client.invoiceCount}
                    max={clientRevenueMax}
                    rank={index + 1}
                  />
                ))}

                {clientRevenueMix.length === 0 ? (
                  <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                    No invoice revenue has been recorded for this workspace yet.
                  </p>
                ) : null}
              </div>
            </Card>
          </div>
        </RoleVisible>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <Card className="dashboard-aging-section hidden border-pink-500/20 bg-pink-500/5 lg:block">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-pink-300">
                  Accounts Aging
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Unpaid invoice age
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  Active unpaid invoices, including imported FreshBooks
                  balances and deposit requests.
                </p>
              </div>

              <Link href={`/invoices?business=${selectedBusinessSlug}&view=aging`}>
                <Button variant="secondary">Open Aging View</Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {agingBuckets.map((bucket) => (
                <div
                  key={bucket.label}
                  className="dashboard-feature-card dark-surface rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <p className="text-sm text-zinc-400">{bucket.label}</p>

                  <p className="mt-2 text-2xl font-black">
                    {formatMoney(bucket.amount)}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    {bucket.count} invoice{bucket.count === 1 ? "" : "s"}
                  </p>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-pink-400"
                      style={{
                        width: `${Math.max(
                          (bucket.amount / agingVisualMax) * 100,
                          bucket.amount > 0 ? 8 : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {mostOverdueInvoices.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
                {mostOverdueInvoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}`}
                    className="grid gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-3 last:border-b-0 hover:bg-zinc-900 md:grid-cols-[1fr_auto_auto]"
                  >
                    <span>
                      <span className="block font-semibold">
                        {invoice.display_id ?? "Invoice"} -{" "}
                        {invoice.customer_name ?? "Unknown Customer"}
                      </span>
                      <span className="text-sm text-zinc-400">
                        {invoice.project_title ?? "Untitled Invoice"}
                      </span>
                    </span>

                    <span className="font-bold text-pink-200">
                      {invoice.daysLate} day
                      {invoice.daysLate === 1 ? "" : "s"} late
                    </span>

                    <span className="font-bold text-orange-300">
                      {formatMoney(invoice.amountDue)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="dashboard-feature-card dark-surface mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                No past-due invoices found.
              </p>
            )}
          </Card>
        </RoleVisible>

        <Card
          id="dashboard-activity"
          className="dashboard-activity-section hidden scroll-mt-6 lg:block"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Recently Updated
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Latest activity
              </h2>

              <p className="mt-2 max-w-3xl text-zinc-400">
                A quick trail of the newest queue, estimate, invoice, payment,
                and split actions in this workspace.
              </p>
            </div>

            <Link href={`/activity?business=${selectedBusinessSlug}`}>
              <Button variant="secondary">Open Activity Log</Button>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {activityLogs.map((log) => (
              <Link
                key={log.id}
                href={activityHref(log, selectedBusinessSlug)}
                className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${activityTone(log.action)}`}
              >
                <p className="text-xs font-black uppercase tracking-[0.2em]">
                  {activityLabel(log.action)}
                </p>

                <p className="mt-3 line-clamp-2 min-h-12 text-sm font-semibold text-white">
                  {log.entity_label ?? "Workspace activity"}
                </p>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span>{relativeTime(log.created_at)}</span>
                  <span className="truncate">
                    {log.actor_email ?? "Trimax"}
                  </span>
                </div>
              </Link>
            ))}

            {activityLogs.length === 0 ? (
              <p className="dashboard-feature-card dark-surface rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400 lg:col-span-5">
                No activity has been logged for this workspace yet.
              </p>
            ) : null}
          </div>
        </Card>

        <section id="dashboard-workstream" className="dashboard-workstream-section scroll-mt-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="dashboard-section-label text-sm uppercase tracking-[0.3em] text-sky-300">
                Workstream
              </p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Recent queue and invoice movement
              </h2>
            </div>

            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              The newest operational and accounting records stay together here
              so the dashboard ends with what changed most recently.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="dashboard-workstream-card">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                    Queue Pulse
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Recent Queue Items
                  </h2>
                </div>

                <Link
                  href={`/queue?business=${selectedBusinessSlug}`}
                  className="text-sm font-semibold text-orange-400"
                >
                  View all
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {queueItems.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={`/queue/${item.id}?business=${selectedBusinessSlug}`}
                    className="dashboard-feature-card dark-surface block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">
                          {item.property || "Property"} - Unit{" "}
                          {maybeCanonicalApartmentUnitLabel(item.unit) || "-"}
                        </p>

                        <p className="mt-1 text-sm text-zinc-400">
                          {item.unit_layout ? `Layout ${item.unit_layout} / ` : ""}
                          {item.paint_type || "Paint TBD"} /{" "}
                          {item.flooring || "Flooring TBD"}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                            Paint due {formatShortDate(item.ready_date)}
                          </span>

                          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                            Scheduled {formatShortDate(item.scheduled_date)}
                          </span>

                          {item.smoked_in ? (
                            <span className="dashboard-remediation-pill rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 font-semibold text-red-200">
                              Remediation
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <StatusBadge
                        status={item.status || "Pending"}
                      />
                    </div>
                  </Link>
                ))}

                {queueItems.length === 0 && (
                  <p className="text-sm text-zinc-400">
                    No queue items for this business yet.
                  </p>
                )}
              </div>
            </Card>

          <RoleVisible
            businessSlug={selectedBusinessSlug}
            allow={[
              "owner",
              "admin",
              "accountant",
            ]}
          >
            <Card className="dashboard-workstream-card">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                    Invoice Pulse
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Recent Invoices
                  </h2>
                </div>

                <Link
                  href={`/invoices?business=${selectedBusinessSlug}`}
                  className="text-sm font-semibold text-orange-400"
                >
                  View all
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {billableInvoices
                  .sort((first, second) => {
                    const firstDate = new Date(
                      first.updated_at ??
                        first.created_at ??
                        "1970-01-01"
                    ).getTime();
                    const secondDate = new Date(
                      second.updated_at ??
                        second.created_at ??
                        "1970-01-01"
                    ).getTime();

                    return secondDate - firstDate;
                  })
                  .slice(0, 3)
                  .map((invoice) => {
                    const amountDue = invoiceCollectionAmountDue(invoice);
                    const isDepositRequest = hasActiveDepositRequest(invoice);
                    const daysLate = daysPastDue(invoice.due_date);
                    const isLate =
                      amountDue > 0 &&
                      daysLate !== null &&
                      daysLate > 0;

                    const paymentParams = new URLSearchParams({
                      business: selectedBusinessSlug,
                      customer: invoice.customer_name ?? "",
                    });

                    return (
                      <div
                        key={invoice.id}
                        className="dashboard-feature-card dark-surface rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-orange-400">
                                {invoice.display_id ??
                                  "Invoice"}
                              </p>

                              <StatusBadge status={invoice.status || "Draft"} />

                              {isDepositRequest ? (
                                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                  Deposit request
                                </span>
                              ) : null}

                              {isLate ? (
                                <span className="rounded-full border border-pink-500/35 bg-pink-500/10 px-3 py-1 text-xs font-semibold text-pink-200">
                                  {daysLate} day
                                  {daysLate === 1 ? "" : "s"} late
                                </span>
                              ) : null}
                            </div>

                            <p className="font-semibold">
                              {invoice.project_title ||
                                "Untitled Invoice"}
                            </p>

                            <p className="mt-1 text-sm text-zinc-400">
                              {invoice.customer_name ||
                                "Unknown Customer"}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="font-bold text-orange-400">
                              {formatMoney(amountDue)}
                            </p>

                            <p className="text-sm text-zinc-400">
                              {isDepositRequest
                                ? "Deposit Due"
                                : "Collection Due"}
                            </p>

                            <p className="mt-2 text-xs text-zinc-500">
                              Due {formatShortDate(invoice.due_date)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                          <Link
                            href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}`}
                            className="app-button-primary rounded-full px-4 py-2 text-sm font-black"
                          >
                            Open
                          </Link>

                          <Link
                            href={`/invoices/${invoice.id}/print?business=${selectedBusinessSlug}`}
                            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
                          >
                            Print
                          </Link>

                          {amountDue > 0 ? (
                            <Link
                              href={`/payments?${paymentParams.toString()}`}
                              className="payment-action-button dashboard-payment-action rounded-full border px-4 py-2 text-sm font-semibold transition"
                            >
                              Record Payment
                            </Link>
                          ) : null}

                          {isLate ? (
                            <Link
                              href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}#late-payment-reminder`}
                              className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-black text-rose-800 transition hover:border-rose-400 hover:bg-rose-100"
                            >
                              Send Reminder
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                {billableInvoices.length === 0 && (
                  <p className="text-sm text-zinc-400">
                    No invoices for this business yet.
                  </p>
                )}
              </div>
            </Card>
          </RoleVisible>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
