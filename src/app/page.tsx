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
  const colorClass =
    tone === "rose"
      ? "bg-pink-400"
      : tone === "emerald"
        ? "bg-emerald-400"
        : tone === "amber"
          ? "bg-yellow-400"
          : "bg-orange-500";
  const width = Math.max((value / max) * 100, value > 0 ? 8 : 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-zinc-300">
          {label}
        </p>
        <p className="text-sm font-bold text-white">
          {formatMoney(value)}
        </p>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-zinc-950 ring-1 ring-zinc-800">
        <div
          className={`h-full rounded-full ${colorClass}`}
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

  if (selectedBusiness) {
    const [
      queueResponse,
      estimateResponse,
      invoiceResponse,
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
    ]);

    queueItems =
      (queueResponse.data ?? []) as QueueItem[];
    estimates =
      (estimateResponse.data ?? []) as Estimate[];
    invoices =
      (invoiceResponse.data ?? []) as Invoice[];
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
    },
    {
      label: "Schedule",
      value: readySoonUnscheduled.length,
      detail: "Ready soon",
      href: `/queue?business=${selectedBusinessSlug}&view=ready-soon`,
    },
    {
      label: "Work",
      value: scheduledQueueItems.length,
      detail: "Scheduled",
      href: `/queue?business=${selectedBusinessSlug}&status=scheduled`,
    },
    {
      label: "Done",
      value: completedThisMonth.length,
      detail: "This month",
      href: `/queue?business=${selectedBusinessSlug}&status=completed`,
    },
  ];

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
          <Card className="border-orange-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Outstanding Revenue
                </p>

                <h2 className="mt-3 text-5xl font-black tracking-tight">
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
            <Card>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                    Money Flow
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
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

              <div className="mt-6 space-y-4">
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

            <Card>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Queue Flow
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Turnover pipeline
              </h2>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {queueFlow.map((step) => (
                  <Link
                    key={step.label}
                    href={step.href}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      {step.label}
                    </p>

                    <p className="mt-2 text-3xl font-black">
                      {step.value}
                    </p>

                    <p className="mt-1 text-sm text-zinc-400">
                      {step.detail}
                    </p>
                  </Link>
                ))}
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

                    return (
                      <Link
                        key={invoice.id}
                        href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}`}
                        className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
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
                      </Link>
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
