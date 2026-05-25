import Link from "next/link";
import AppShell from "./components/AppShell";
import Card from "./components/Card";
import Button from "./components/Button";
import StatusBadge from "./components/StatusBadge";
import DashboardQuickActions from "./components/DashboardQuickActions";
import RoleVisible from "./components/RoleVisible";
import { supabase } from "./lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
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
};

type Invoice = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  customer_name: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  status: string | null;
  due_date: string | null;
  updated_at: string | null;
  created_at: string | null;
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
      bar: "from-orange-500 to-amber-300",
      dot: "bg-orange-400",
      panel: "border-orange-500/20 bg-orange-500/5",
      text: "text-orange-100",
    },
    amber: {
      bar: "from-amber-400 to-yellow-200",
      dot: "bg-amber-300",
      panel: "border-amber-500/20 bg-amber-500/5",
      text: "text-amber-100",
    },
    rose: {
      bar: "from-rose-400 to-pink-300",
      dot: "bg-rose-300",
      panel: "border-rose-500/20 bg-rose-500/5",
      text: "text-rose-100",
    },
    emerald: {
      bar: "from-emerald-400 to-teal-300",
      dot: "bg-emerald-300",
      panel: "border-emerald-500/20 bg-emerald-500/5",
      text: "text-emerald-100",
    },
  }[tone];
  const width = Math.max((value / max) * 100, value > 0 ? 8 : 0);

  return (
    <div className={`dashboard-feature-card dark-surface rounded-2xl border p-4 ${toneStyles.panel}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${toneStyles.dot}`} />
          <p className="truncate text-sm font-semibold text-slate-100">
            {label}
          </p>
        </div>

        <p className={`shrink-0 text-sm font-black ${toneStyles.text}`}>
          {formatMoney(value)}
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${toneStyles.bar}`}
          style={{ width: `${width}%` }}
        />
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

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim().toLowerCase();
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "queue_item.created": "Queue Created",
    "queue_item.scheduled": "Work Scheduled",
    "queue_item.completed": "Work Completed",
    "estimate.created": "Estimate Created",
    "estimate.updated": "Estimate Updated",
    "estimate.converted_to_invoice": "Estimate Converted",
    "invoice.created": "Invoice Created",
    "invoice.updated": "Invoice Updated",
    "invoice.status_updated": "Invoice Updated",
    "invoice.batch_payment_applied": "Payment Applied",
    "invoice.split_created": "Split Invoices Created",
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

  const openInvoices = invoices.filter(
    (invoice) => invoice.status !== "Paid"
  );

  const openInvoicesWithAmounts = openInvoices
    .map((invoice) => {
      const invoiceTotal = parseMoney(invoice.invoice_amount);
      const amountPaid =
        typeof invoice.amount_paid === "number"
          ? invoice.amount_paid
          : parseMoney(String(invoice.amount_paid ?? "0"));

      return {
        ...invoice,
        amountDue: Math.max(invoiceTotal - amountPaid, 0),
        daysLate: daysPastDue(invoice.due_date),
      };
    })
    .filter((invoice) => invoice.amountDue > 0);

  const outstandingRevenueTotal =
    openInvoicesWithAmounts.reduce(
      (total, invoice) =>
        total + invoice.amountDue,
      0
    );

  const estimatedRevenueTotal = estimates.reduce(
    (total, estimate) =>
      total + parseMoney(estimate.estimate_amount),
    0
  );

  const invoicedRevenueTotal = invoices.reduce(
    (total, invoice) =>
      total + parseMoney(invoice.invoice_amount),
    0
  );

  const ytdRevenueTotal = invoices
    .filter((invoice) => invoice.status === "Paid")
    .reduce(
      (total, invoice) =>
        total + parseMoney(invoice.invoice_amount),
      0
    );

  const outstandingRevenue = formatMoney(
    outstandingRevenueTotal
  );
  const estimatedRevenue = formatMoney(estimatedRevenueTotal);
  const invoicedRevenue = formatMoney(invoicedRevenueTotal);
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
    const bucketInvoices = openInvoicesWithAmounts.filter((invoice) => {
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

  const mostOverdueInvoices = openInvoicesWithAmounts
    .filter((invoice) => (invoice.daysLate ?? -1) >= 0)
    .sort((first, second) => {
      return (second.daysLate ?? 0) - (first.daysLate ?? 0);
    })
    .slice(0, 5);
  const customerBalances = Array.from(
    openInvoicesWithAmounts
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
    invoices
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
          <Card className="dark-surface border-orange-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Outstanding Revenue
                </p>

                <h2 className="mt-3 text-5xl font-black tracking-tight text-white">
                  {outstandingRevenue}
                </h2>

                <p className="mt-3 text-zinc-400">
                  Open invoices, deposits requested,
                  and unpaid balances.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-zinc-400">
                    Open Invoices
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {openInvoicesWithAmounts.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-zinc-400">
                    YTD Revenue
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
          {customerBalances.length > 0 ? (
            <Card className="border-green-500/20 bg-green-500/5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                    Collection Targets
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Customers with unpaid balances
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                    Start here when one check may cover several invoices. Each
                    customer opens the Payments workspace with matching invoices
                    preselected when possible.
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
                    q: customer.customerName,
                  });

                  return (
                    <div
                      key={customer.customerName}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
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
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="dark-surface border-orange-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-orange-950/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                    Money Flow
                  </p>

                  <h2 className="mt-2 text-2xl font-bold text-white">
                    Revenue snapshot
                  </h2>
                </div>

                <Link
                  href={`/reports?business=${selectedBusinessSlug}`}
                  className="text-sm font-semibold text-orange-400"
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

            <Card className="dark-surface border-sky-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-sky-950/20">
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
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
                      className={`relative overflow-hidden rounded-2xl border p-4 transition hover:-translate-y-0.5 ${style.card}`}
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
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="dark-surface border-emerald-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/20">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
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

                  <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-orange-200">
                    FreshBooks style
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

            <Card className="dark-surface border-violet-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-violet-950/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-violet-300">
                    Revenue By Client
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Top invoice sources
                  </h2>
                </div>

                <Link
                  href={`/invoices?business=${selectedBusinessSlug}`}
                  className="text-sm font-semibold text-orange-400"
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
          <Card className="border-pink-500/20 bg-pink-500/5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-pink-300">
                  Accounts Aging
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Unpaid invoice age
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  A quick FreshBooks-style view of what is still unpaid and how
                  long it has been past due.
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
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
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
              <p className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                No past-due invoices found.
              </p>
            )}
          </Card>
        </RoleVisible>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <p className="text-sm uppercase tracking-[0.3em] text-yellow-300">
              Scheduling Attention
            </p>

            <p className="mt-3 text-4xl font-bold">
              {readySoonUnscheduled.length}
            </p>

            <p className="mt-2 text-zinc-300">
              Units are within 7 days of ready date and not scheduled.
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              Start here when coordinating turns with property managers.
            </p>

            <Link
              href={`/queue?business=${selectedBusinessSlug}&view=ready-soon`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              Open ready soon queue
            </Link>
          </Card>

          <Card className="border-red-500/30 bg-red-500/5">
            <p className="text-sm uppercase tracking-[0.3em] text-red-300">
              Remediation Watch
            </p>

            <p className="mt-3 text-4xl font-bold">
              {remediationQueueItems.length}
            </p>

            <p className="mt-2 text-zinc-300">
              Queue items flagged for smoker or remediation attention.
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              Useful for spotting extra labor, odor treatment, and schedule
              risk.
            </p>

            <Link
              href={`/queue?business=${selectedBusinessSlug}&view=remediation`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              Open remediation queue
            </Link>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-zinc-400">
              Active Queue
            </p>

            <p className="mt-2 text-4xl font-bold">
              {activeQueueItems.length}
            </p>

            <Link
              href={`/queue?business=${selectedBusinessSlug}`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View queue
            </Link>
          </Card>

          <Card>
            <p className="text-sm text-zinc-400">
              Queue Needs Estimate
            </p>

            <p className="mt-2 text-4xl font-bold">
              {queueItemsNeedingEstimate.length}
            </p>

            <Link
              href={`/queue?business=${selectedBusinessSlug}&view=needs-estimate`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View queue items
            </Link>
          </Card>

          <RoleVisible
            businessSlug={selectedBusinessSlug}
            allow={[
              "owner",
              "admin",
              "accountant",
            ]}
          >
            <Card>
              <p className="text-sm text-zinc-400">
                Open Invoices
              </p>

              <p className="mt-2 text-4xl font-bold">
                {openInvoicesWithAmounts.length}
              </p>

              <Link
                href={`/invoices?business=${selectedBusinessSlug}`}
                className="mt-4 inline-block text-sm text-orange-400"
              >
                View invoices
              </Link>
            </Card>
          </RoleVisible>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-zinc-400">
              Scheduled Jobs
            </p>

            <p className="mt-2 text-4xl font-bold">
              {scheduledQueueItems.length}
            </p>

            <Link
              href={`/queue?business=${selectedBusinessSlug}&status=scheduled`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View scheduled
            </Link>
          </Card>

          <Card>
            <p className="text-sm text-zinc-400">
              Completed This Month
            </p>

            <p className="mt-2 text-4xl font-bold">
              {completedThisMonth.length}
            </p>

            <Link
              href={`/queue?business=${selectedBusinessSlug}&status=completed`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View completed
            </Link>
          </Card>

          <Card>
            <p className="text-sm text-zinc-400">
              Reporting Memory
            </p>

            <p className="mt-2 text-4xl font-bold">
              {queueItems.length}
            </p>

            <p className="mt-4 text-sm text-zinc-400">
              Retained apartment turn and property queue records for this
              business.
            </p>

            <Link
              href={`/reports?business=${selectedBusinessSlug}`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              Open reports
            </Link>
          </Card>
        </div>

        <RoleVisible
          businessSlug={selectedBusinessSlug}
          allow={[
            "owner",
            "admin",
            "accountant",
          ]}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Estimated Revenue
              </p>

              <p className="mt-3 text-4xl font-black">
                {estimatedRevenue}
              </p>

              <p className="mt-3 text-zinc-400">
                Total estimate value currently stored for{" "}
                {selectedBusiness?.name ??
                  "this business"}
                .
              </p>
            </Card>

            <Card>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Invoiced Revenue
              </p>

              <p className="mt-3 text-4xl font-black">
                {invoicedRevenue}
              </p>

              <p className="mt-3 text-zinc-400">
                Total invoice value currently stored for{" "}
                {selectedBusiness?.name ??
                  "this business"}
                .
              </p>
            </Card>
          </div>
        </RoleVisible>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Next Action
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Review apartment/unit queue items
              </h2>

              <p className="mt-2 text-zinc-400">
                Queue is for unit turns and property-manager intake. Normal
                estimates and invoices can still start directly from their own
                pages.
              </p>
            </div>

            <Link
              href={`/queue?business=${selectedBusinessSlug}`}
            >
              <Button>Review Queue</Button>
            </Link>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Action Center
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Quick Actions
            </h2>
          </div>

          <DashboardQuickActions
            businessSlug={selectedBusinessSlug}
          />
        </Card>

        <Card>
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
              <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400 lg:col-span-5">
                No activity has been logged for this workspace yet.
              </p>
            ) : null}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
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
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        {item.property || "Property"} - Unit{" "}
                        {item.unit || "-"}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {item.paint_type || "Paint TBD"} /{" "}
                        {item.flooring || "Flooring TBD"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                          Ready {formatShortDate(item.ready_date)}
                        </span>

                        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                          Scheduled {formatShortDate(item.scheduled_date)}
                        </span>

                        {item.smoked_in ? (
                          <span className="rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 text-red-200">
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
            <Card>
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
                {invoices
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
                    const invoiceTotal = parseMoney(invoice.invoice_amount);
                    const amountPaid = parseMoney(invoice.amount_paid);
                    const amountDue = Math.max(invoiceTotal - amountPaid, 0);
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
                        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-orange-400">
                                {invoice.display_id ??
                                  "Invoice"}
                              </p>

                              <StatusBadge status={invoice.status || "Draft"} />

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
                              Amount Due
                            </p>

                            <p className="mt-2 text-xs text-zinc-500">
                              Due {formatShortDate(invoice.due_date)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                          <Link
                            href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}`}
                            className="rounded-full bg-orange-500 px-4 py-2 text-sm font-black text-black transition hover:bg-orange-400"
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
                              className="rounded-full border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-200 transition hover:border-green-300 hover:bg-green-500/20"
                            >
                              Record Payment
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                {invoices.length === 0 && (
                  <p className="text-sm text-zinc-400">
                    No invoices for this business yet.
                  </p>
                )}
              </div>
            </Card>
          </RoleVisible>
        </div>
      </div>
    </AppShell>
  );
}
