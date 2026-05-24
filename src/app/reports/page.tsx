import Link from "next/link";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  paint_type: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  notes: string | null;
  created_at: string | null;
};

type Estimate = {
  id: string;
  customer_name: string | null;
  estimate_amount: string | number | null;
  status: string | null;
  created_at: string | null;
};

type Invoice = {
  id: string;
  customer_name: string | null;
  invoice_amount: string | number | null;
  status: string | null;
  created_at: string | null;
};

type ReportRange = "week" | "month" | "all";

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return value;
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

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeStatus(value: string | null) {
  return (value || "Pending Estimate").trim();
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

function rangeStart(range: ReportRange) {
  const now = new Date();

  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return null;
}

function isInRange(value: string | null, range: ReportRange) {
  if (range === "all") {
    return true;
  }

  const date = dateValue(value);
  const start = rangeStart(range);

  if (!date || !start) {
    return false;
  }

  return date >= start;
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

function includesProperty(item: QueueItem, propertyFilter: string) {
  if (propertyFilter === "all") {
    return true;
  }

  return (item.property || "").toLowerCase() === propertyFilter;
}

function countBy<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined
) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = getKey(item)?.trim() || "Not Set";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count);
}

function reportsHref(
  businessSlug: string,
  options: {
    property?: string;
    range?: ReportRange;
  }
) {
  const params = new URLSearchParams({
    business: businessSlug,
    property: options.property ?? "all",
    range: options.range ?? "month",
  });

  return `/reports?${params.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    property?: string;
    range?: ReportRange;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const propertyFilter =
    resolvedSearchParams.property?.trim().toLowerCase() ?? "all";
  const range =
    resolvedSearchParams.range === "week" ||
    resolvedSearchParams.range === "all"
      ? resolvedSearchParams.range
      : "month";

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  if (businessError) {
    console.error(businessError);
  }

  const selectedBusiness = businessData as Business | null;

  let queueItems: QueueItem[] = [];
  let estimates: Estimate[] = [];
  let invoices: Invoice[] = [];

  if (selectedBusiness?.id) {
    const [queueResponse, estimateResponse, invoiceResponse] =
      await Promise.all([
        supabase
          .from("queue_items")
          .select("*")
          .eq("business_id", selectedBusiness.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("estimates")
          .select("id, customer_name, estimate_amount, status, created_at")
          .eq("business_id", selectedBusiness.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("invoices")
          .select("id, customer_name, invoice_amount, status, created_at")
          .eq("business_id", selectedBusiness.id)
          .order("created_at", { ascending: false }),
      ]);

    if (queueResponse.error) {
      console.error(queueResponse.error);
    }

    if (estimateResponse.error) {
      console.error(estimateResponse.error);
    }

    if (invoiceResponse.error) {
      console.error(invoiceResponse.error);
    }

    queueItems = (queueResponse.data ?? []) as QueueItem[];
    estimates = (estimateResponse.data ?? []) as Estimate[];
    invoices = (invoiceResponse.data ?? []) as Invoice[];
  }

  const properties = Array.from(
    new Set(
      queueItems
        .map((item) => item.property?.trim())
        .filter((property): property is string => Boolean(property))
    )
  ).sort((first, second) => first.localeCompare(second));

  const filteredQueueItems = queueItems.filter(
    (item) =>
      includesProperty(item, propertyFilter) &&
      (isInRange(item.created_at, range) ||
        isInRange(item.move_out_date, range) ||
        isInRange(item.ready_date, range) ||
        isInRange(item.scheduled_date, range) ||
        isInRange(item.completed_date, range))
  );

  const activeQueueItems = filteredQueueItems.filter(
    (item) =>
      !["completed", "invoiced", "paid"].includes(
        normalizeStatus(item.status).toLowerCase()
      )
  );

  const pendingReview = filteredQueueItems.filter((item) =>
    ["pending", "pending estimate", "new", "review"].includes(
      normalizeStatus(item.status).toLowerCase()
    )
  );

  const scheduledItems = filteredQueueItems.filter(
    (item) =>
      normalizeStatus(item.status).toLowerCase() === "scheduled" ||
      Boolean(item.scheduled_date)
  );

  const completedItems = filteredQueueItems.filter(
    (item) =>
      normalizeStatus(item.status).toLowerCase() === "completed" ||
      Boolean(item.completed_date)
  );

  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(now.getDate() + 7);

  const approachingReadyUnscheduled = filteredQueueItems.filter((item) => {
    const readyDate = dateValue(item.ready_date);

    return (
      Boolean(readyDate) &&
      readyDate! >= now &&
      readyDate! <= sevenDaysFromNow &&
      !item.scheduled_date &&
      normalizeStatus(item.status).toLowerCase() !== "scheduled" &&
      normalizeStatus(item.status).toLowerCase() !== "completed"
    );
  });

  const turnaroundDays = filteredQueueItems
    .map((item) => daysBetween(item.move_out_date, item.completed_date))
    .filter((days): days is number => days !== null);

  const averageTurnaround =
    turnaroundDays.length > 0
      ? Math.round(
          turnaroundDays.reduce((total, days) => total + days, 0) /
            turnaroundDays.length
        )
      : null;

  const smokerUnits = filteredQueueItems.filter(
    (item) =>
      item.smoked_in ||
      (item.notes || "").toLowerCase().includes("smok")
  );

  const flooringUnits = filteredQueueItems.filter((item) => {
    const flooring = (item.flooring || "").toLowerCase();

    return (
      flooring.includes("replace") ||
      flooring.includes("new") ||
      flooring.includes("floor")
    );
  });

  const propertyLabel =
    propertyFilter === "all"
      ? "All Properties"
      : properties.find(
          (property) => property.toLowerCase() === propertyFilter
        ) ?? "Selected Property";

  const rangeLabel =
    range === "week"
      ? "Last 7 Days"
      : range === "month"
        ? "This Month"
        : "All Time";

  const filteredEstimates = estimates.filter((estimate) =>
    isInRange(estimate.created_at, range)
  );

  const filteredInvoices = invoices.filter((invoice) =>
    isInRange(invoice.created_at, range)
  );

  const estimatedRevenue = filteredEstimates.reduce(
    (total, estimate) => total + parseMoney(estimate.estimate_amount),
    0
  );

  const invoicedRevenue = filteredInvoices.reduce(
    (total, invoice) => total + parseMoney(invoice.invoice_amount),
    0
  );

  const statusBreakdown = countBy(filteredQueueItems, (item) =>
    normalizeStatus(item.status)
  );
  const paintBreakdown = countBy(
    filteredQueueItems,
    (item) => item.paint_type
  );
  const flooringBreakdown = countBy(
    filteredQueueItems,
    (item) => item.flooring
  );
  const unitHistory = filteredQueueItems.slice(0, 12);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Reporting
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Property Operations
            </h1>

            <p className="mt-3 max-w-3xl text-zinc-400">
              A first reporting view for retained queue history,
              readiness, scheduling, completion, and job mix.
            </p>
          </div>

          <Link href={`/queue?business=${businessSlug}`}>
            <Button variant="secondary">Open Queue</Button>
          </Link>
        </div>

        <Card className="p-5">
          <div className="grid gap-5 xl:grid-cols-[1fr_auto_auto] xl:items-end">
            <div>
              <p className="text-sm text-zinc-400">Property</p>

              <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-auto pr-1">
                <Link
                  href={reportsHref(businessSlug, {
                    property: "all",
                    range,
                  })}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    propertyFilter === "all"
                      ? "bg-orange-500 text-black"
                      : "bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  All
                </Link>

                {properties.map((property) => (
                  <Link
                    key={property}
                    href={reportsHref(businessSlug, {
                      property: property.toLowerCase(),
                      range,
                    })}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      propertyFilter === property.toLowerCase()
                        ? "bg-orange-500 text-black"
                        : "bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {property}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-zinc-400">Date Range</p>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["week", "month", "all"] as ReportRange[]).map(
                  (rangeOption) => (
                    <Link
                      key={rangeOption}
                      href={reportsHref(businessSlug, {
                        property: propertyFilter,
                        range: rangeOption,
                      })}
                      className={`rounded-full px-4 py-2 text-center text-sm font-semibold capitalize transition ${
                        range === rangeOption
                          ? "bg-orange-500 text-black"
                          : "bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {rangeOption === "all" ? "All Time" : rangeOption}
                    </Link>
                  )
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 xl:min-w-72">
              <p className="text-sm text-zinc-400">Current View</p>
              <p className="mt-1 font-semibold">
                {propertyLabel} / {rangeLabel}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Units Submitted"
            value={filteredQueueItems.length}
          />
          <MetricCard label="Active Units" value={activeQueueItems.length} />
          <MetricCard label="Pending Review" value={pendingReview.length} />
          <MetricCard label="Scheduled" value={scheduledItems.length} />
          <MetricCard label="Completed" value={completedItems.length} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Ready Soon, Not Scheduled"
            value={approachingReadyUnscheduled.length}
          />
          <MetricCard
            label="Avg Turnaround"
            value={
              averageTurnaround === null ? "-" : `${averageTurnaround} days`
            }
          />
          <MetricCard label="Smoker / Remediation" value={smokerUnits.length} />
          <MetricCard label="Flooring Work" value={flooringUnits.length} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Estimated Revenue
            </p>

            <p className="mt-3 text-4xl font-black">
              {formatMoney(estimatedRevenue)}
            </p>

            <p className="mt-3 text-sm text-zinc-400">
              Based on estimates created in the selected date range.
            </p>
          </Card>

          <Card>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Invoiced Revenue
            </p>

            <p className="mt-3 text-4xl font-black">
              {formatMoney(invoicedRevenue)}
            </p>

            <p className="mt-3 text-sm text-zinc-400">
              Based on invoices created in the selected date range.
            </p>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <BreakdownCard title="Status Breakdown" items={statusBreakdown} />
          <BreakdownCard title="Paint Type" items={paintBreakdown} />
          <BreakdownCard title="Flooring Type" items={flooringBreakdown} />
        </div>

        <Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Unit History
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Recent Property Work
              </h2>
            </div>

            <p className="text-sm text-zinc-400">
              Showing latest {unitHistory.length} matching records.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
            {unitHistory.length === 0 ? (
              <p className="p-5 text-zinc-400">
                No queue records match this report view yet.
              </p>
            ) : (
              unitHistory.map((item) => (
                <Link
                  key={item.id}
                  href={`/queue/${item.id}?business=${businessSlug}`}
                  className="grid gap-4 border-b border-zinc-800 bg-zinc-950 p-5 transition last:border-b-0 hover:bg-zinc-900 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold">
                        {item.property || "Property"} - Unit{" "}
                        {item.unit || "-"}
                      </p>

                      <StatusBadge status={normalizeStatus(item.status)} />
                    </div>

                    <p className="mt-2 text-sm text-zinc-400">
                      Paint: {item.paint_type || "-"} / Flooring:{" "}
                      {item.flooring || "-"}
                    </p>
                  </div>

                  <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-3 md:text-right">
                    <MiniDate label="Move Out" value={item.move_out_date} />
                    <MiniDate label="Ready" value={item.ready_date} />
                    <MiniDate label="Done" value={item.completed_date} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="border-purple-500/30 bg-purple-500/5">
          <p className="text-sm uppercase tracking-[0.3em] text-purple-300">
            Future Property Portal
          </p>

          <h2 className="mt-3 text-2xl font-bold">
            Built toward Diana&apos;s dashboard
          </h2>

          <p className="mt-3 max-w-3xl text-zinc-300">
            This page is internal for now. Later, the same reporting
            foundation can power a limited property manager view that
            shows only her property queue, readiness dates, status
            updates, and property-level reports.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card className="min-h-32 p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-3 text-4xl font-bold leading-none">{value}</p>
    </Card>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; count: number }[];
}) {
  return (
    <Card>
      <h2 className="text-xl font-bold">{title}</h2>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">No data yet.</p>
        ) : (
          items.slice(0, 6).map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3"
            >
              <p className="text-sm text-zinc-300">{item.label}</p>
              <p className="font-bold text-orange-400">{item.count}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function MiniDate({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p>{formatDate(value)}</p>
    </div>
  );
}
