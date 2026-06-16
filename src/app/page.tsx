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
    .select("*")
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
        .select("*")
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("estimates")
        .select("*")
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("invoices")
        .select("*")
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("activity_logs")
        .select(
          "id, actor_email, action, entity_type, entity_id, entity_label, details, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("created_at", { ascending: false })
        .limit(5),
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

  const activeQueueItems = queueItems.filter(
    (item) =>
      normalizeStatus(item.status) !== "scheduled" &&
      !isClosedQueueStatus(item.status)
  );

  const scheduledQueueItems = queueItems.filter(
    (item) =>
      item.status === "Scheduled" ||
      Boolean(item.scheduled_date)
  );

  const completedThisMonth = queueItems.filter(
    (item) =>
      isDateInCurrentMonth(item.completed_date) ||
      (item.status === "Completed" &&
        isDateInCurrentMonth(item.scheduled_date))
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);

  const readySoonUnscheduled = queueItems.filter((item) => {
    const readyDate = dateValue(item.ready_date);
    const status = normalizeStatus(item.status);

    return (
      Boolean(readyDate) &&
      readyDate! >= today &&
      readyDate! <= sevenDaysFromNow &&
      !item.scheduled_date &&
      status !== "scheduled" &&
      status !== "completed"
    );
  });

  const remediationQueueItems = queueItems.filter(
    (item) =>
      item.smoked_in ||
      (item.notes || "").toLowerCase().includes("smok")
  );

  const queueItemsNeedingEstimate = queueItems.filter(
    (item) =>
      !item.linked_estimate_id &&
      !isClosedQueueStatus(item.status)
  );

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
  const priorityHeadline =
    pastDueInvoices.length > 0
      ? "Collect past-due money first"
      : depositRequestInvoices.length > 0
        ? "Follow up on active deposits"
        : largestOpenInvoice
          ? "Keep the cash queue moving"
          : "Accounting is quiet";
  const priorityDetail =
    pastDueInvoices.length > 0
      ? `${pastDueInvoices.length} overdue invoice${
          pastDueInvoices.length === 1 ? "" : "s"
        } account for ${formatMoney(pastDueTotal)}.`
      : depositRequestInvoices.length > 0
        ? `${depositRequestInvoices.length} deposit request${
            depositRequestInvoices.length === 1 ? "" : "s"
          } still need collection.`
        : largestOpenInvoice
          ? `${largestOpenInvoice.customer_name ?? "A customer"} has ${formatMoney(
              largestOpenInvoice.amountDue
            )} still open.`
          : "No open invoice balance needs attention right now.";
  const priorityCards = [
    {
      label: "Past Due",
      tone: "danger",
      value: formatMoney(pastDueTotal),
      detail: `${pastDueInvoices.length} invoice${
        pastDueInvoices.length === 1 ? "" : "s"
      }`,
      href: `/invoices?business=${selectedBusinessSlug}&view=aging`,
      className: "border-rose-500/25 bg-rose-500/10 text-rose-100",
    },
    {
      label: "Deposits",
      tone: "success",
      value: formatMoney(depositRequestTotal),
      detail: `${depositRequestInvoices.length} active request${
        depositRequestInvoices.length === 1 ? "" : "s"
      }`,
      href: depositRequestInvoices[0]
        ? `/invoices/${depositRequestInvoices[0].id}?business=${selectedBusinessSlug}`
        : `/invoices?business=${selectedBusinessSlug}`,
      className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100",
    },
    {
      label: "Largest Open",
      tone: "info",
      value: largestOpenInvoice
        ? formatMoney(largestOpenInvoice.amountDue)
        : "$0.00",
      detail: largestOpenInvoice?.customer_name ?? "No open invoice",
      href: largestOpenInvoice
        ? `/invoices/${largestOpenInvoice.id}?business=${selectedBusinessSlug}`
        : `/invoices?business=${selectedBusinessSlug}`,
      className: "border-sky-500/25 bg-sky-500/10 text-sky-100",
    },
  ];
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
          <Card className="dashboard-hero-card dark-surface border-orange-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
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

        <Card className="dashboard-queue-command dark-surface hidden overflow-hidden border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/20 lg:block">
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
          <Card className="dashboard-command-center dark-surface overflow-hidden border-sky-500/20 bg-zinc-950">
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
          </Card>

          <Card className="dashboard-cash-priority dark-surface overflow-hidden border-sky-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-sky-950/25">
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-20 left-8 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl"
              />

              <div className="relative grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                    Cash Priority Radar
                  </p>

                  <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
                    {priorityHeadline}
                  </h2>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                    {priorityDetail}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/payments?${priorityPaymentParams.toString()}`}
                      className="rounded-full bg-sky-400 px-5 py-3 text-sm font-black text-zinc-950 shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-300"
                    >
                      Open Best Payment Target
                    </Link>

                    <Link
                      href={`/invoices?business=${selectedBusinessSlug}&view=aging`}
                      className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-white/10"
                    >
                      Review Aging
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {priorityCards.map((card) => (
                    <Link
                      key={card.label}
                      href={card.href}
                      data-tone={card.tone}
                      className={`dashboard-priority-card rounded-2xl border p-4 transition hover:-translate-y-0.5 ${card.className}`}
                    >
                      <p className="text-xs font-black uppercase tracking-[0.24em] opacity-75">
                        {card.label}
                      </p>

                      <p className="mt-3 text-2xl font-black tracking-tight">
                        {card.value}
                      </p>

                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-300">
                        {card.detail}
                      </p>
                    </Link>
                  ))}
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
          <div className="hidden gap-4 lg:grid xl:grid-cols-[1.2fr_0.8fr]">
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

        <Card className="dashboard-activity-section hidden lg:block">
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

        <section className="dashboard-workstream-section">
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
