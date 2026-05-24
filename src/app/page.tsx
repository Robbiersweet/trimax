import Link from "next/link";
import AppShell from "./components/AppShell";
import Card from "./components/Card";
import Button from "./components/Button";
import StatusBadge from "./components/StatusBadge";
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
  invoice_amount: string | null;
  status: string | null;
};

function parseMoney(value: string | null) {
  return Number(value?.replace(/[^0-9.-]+/g, "") || 0);
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
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
    (item) => item.status !== "Scheduled"
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

    return (
      Boolean(readyDate) &&
      readyDate! >= today &&
      readyDate! <= sevenDaysFromNow &&
      !item.scheduled_date &&
      item.status !== "Scheduled" &&
      item.status !== "Completed"
    );
  });

  const remediationQueueItems = queueItems.filter(
    (item) =>
      item.smoked_in ||
      (item.notes || "").toLowerCase().includes("smok")
  );

  const pendingEstimates = estimates.filter(
    (estimate) => estimate.status !== "Approved"
  );

  const openInvoices = invoices.filter(
    (invoice) => invoice.status !== "Paid"
  );

  const outstandingRevenueTotal =
    openInvoices.reduce(
      (total, invoice) =>
        total + parseMoney(invoice.invoice_amount),
      0
    );

  const outstandingRevenue = formatMoney(
    outstandingRevenueTotal
  );

  const estimatedRevenue = formatMoney(
    estimates.reduce(
      (total, estimate) =>
        total + parseMoney(estimate.estimate_amount),
      0
    )
  );

  const invoicedRevenue = formatMoney(
    invoices.reduce(
      (total, invoice) =>
        total + parseMoney(invoice.invoice_amount),
      0
    )
  );

  const ytdRevenue = formatMoney(
    invoices
      .filter((invoice) => invoice.status === "Paid")
      .reduce(
        (total, invoice) =>
          total + parseMoney(invoice.invoice_amount),
        0
      )
  );

  const quickActions = [
    {
      title: "New Queue Item",
      subtitle: "Add apartment turn or work request",
      href: `/new-request?business=${selectedBusinessSlug}`,
      label: "Queue",
    },
    {
      title: "New Estimate",
      subtitle: "Create a customer estimate",
      href: `/estimates/new?business=${selectedBusinessSlug}`,
      label: "Estimate",
    },
    {
      title: "New Invoice",
      subtitle: "Create invoice or deposit request",
      href: `/invoices/new?business=${selectedBusinessSlug}`,
      label: "Invoice",
    },
    {
      title: "Record Payment",
      subtitle: "Apply payment to invoice",
      href: `/invoices?business=${selectedBusinessSlug}&status=sent`,
      label: "Payment",
    },
    {
      title: "Review Queue",
      subtitle: "Check upcoming units",
      href: `/queue?business=${selectedBusinessSlug}`,
      label: "Review",
    },
    {
      title: "Property Reports",
      subtitle: "Review unit history and readiness",
      href: `/reports?business=${selectedBusinessSlug}`,
      label: "Reports",
    },
    {
      title: "Print Documents",
      subtitle: "Estimates and invoices",
      href: `/estimates?business=${selectedBusinessSlug}`,
      label: "Print",
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

          <div className="flex flex-wrap gap-3">
            {businesses.map((business) => {
              const isSelected =
                business.id === selectedBusiness?.id;

              return (
                <Link
                  key={business.id}
                  href={`/?business=${business.slug}`}
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    isSelected
                      ? "border-orange-500 bg-orange-500/10 text-orange-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-orange-500/60"
                  }`}
                >
                  {business.name}
                </Link>
              );
            })}

            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-300">
              Robbie
            </div>
          </div>
        </div>

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
                Open invoices, deposits requested, and
                unpaid balances.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-zinc-400">
                  Open Invoices
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {openInvoices.length}
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
              Pending Estimates
            </p>

            <p className="mt-2 text-4xl font-bold">
              {pendingEstimates.length}
            </p>

            <Link
              href={`/queue?business=${selectedBusinessSlug}&view=needs-estimate`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View queue needs
            </Link>
          </Card>

          <Card>
            <p className="text-sm text-zinc-400">
              Open Invoices
            </p>

            <p className="mt-2 text-4xl font-bold">
              {openInvoices.length}
            </p>

            <Link
              href={`/invoices?business=${selectedBusinessSlug}`}
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View invoices
            </Link>
          </Card>
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
              Total retained queue records for this
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
              {selectedBusiness?.name ?? "this business"}.
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
              {selectedBusiness?.name ?? "this business"}.
            </p>
          </Card>
        </div>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Next Action
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Review apartment queue items
              </h2>

              <p className="mt-2 text-zinc-400">
                New turns, smoker units, flooring notes,
                and paint scopes should be reviewed before
                scheduling.
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

          <div className="grid gap-3 md:grid-cols-3">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-800"
              >
                <p className="inline-flex rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">
                  {action.label}
                </p>

                <p className="mt-3 font-semibold">
                  {action.title}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {action.subtitle}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="text-2xl font-bold">
              Recent Queue Items
            </h2>

            <div className="mt-4 space-y-3">
              {queueItems.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  href={`/queue/${item.id}?business=${selectedBusinessSlug}`}
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 hover:border-orange-500/60"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {item.property || "Property"} - Unit{" "}
                        {item.unit || "-"}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {item.paint_type || "Paint TBD"} /{" "}
                        {item.flooring || "Flooring TBD"}
                      </p>
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

          <Card>
            <h2 className="text-2xl font-bold">
              Recent Invoices
            </h2>

            <div className="mt-4 space-y-3">
              {invoices.slice(0, 3).map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}?business=${selectedBusinessSlug}`}
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 hover:border-orange-500/60"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-orange-400">
                        {invoice.display_id ?? "Invoice"}
                      </p>

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
                        {invoice.invoice_amount || "$0"}
                      </p>

                      <p className="text-sm text-zinc-400">
                        {invoice.status || "Draft"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}

              {invoices.length === 0 && (
                <p className="text-sm text-zinc-400">
                  No invoices for this business yet.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
