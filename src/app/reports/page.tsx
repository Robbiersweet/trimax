import Link from "next/link";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import DateInputField from "../components/DateInputField";
import RoleVisible from "../components/RoleVisible";
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
  unit_layout: string | null;
  status: string | null;
  paint_type: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
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
  amount_paid: string | number | null;
  status: string | null;
  created_at: string | null;
  tax_mode: string | null;
  tax_label: string | null;
  tax_rate: string | number | null;
  tax_number: string | null;
  split_parent_invoice_id: string | null;
};

type ReportRange = "week" | "month" | "all" | "custom";

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value?.replace(/[^0-9.-]+/g, "") || 0);
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value) || 0;
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

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function isInRange(
  value: string | null,
  range: ReportRange,
  customStart: string,
  customEnd: string
) {
  if (range === "all") {
    return true;
  }

  const date = dateValue(value);

  if (range === "custom") {
    const start = dateValue(customStart);
    const end = dateValue(customEnd);

    if (!date) {
      return false;
    }

    if (start && date < start) {
      return false;
    }

    if (end && date > end) {
      return false;
    }

    return Boolean(start || end);
  }

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

  return propertyKey(item.property) === propertyFilter;
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

function taxSummaryKey(invoice: Invoice) {
  const label = invoice.tax_label?.trim() || "Tax";
  const number = invoice.tax_number?.trim();

  return number ? `${label} #${number}` : label;
}

function invoiceTaxMode(invoice: Invoice) {
  return (invoice.tax_mode || "taxable").trim().toLowerCase();
}

function invoiceTaxParts(invoice: Invoice) {
  const gross = parseMoney(invoice.invoice_amount);
  const taxMode = invoiceTaxMode(invoice);
  const rate = toNumber(invoice.tax_rate);

  if (taxMode === "no_tax" || taxMode === "tax_exempt" || rate <= 0) {
    return {
      taxableSales: 0,
      exemptOrNoTaxSales: gross,
      taxCollected: 0,
    };
  }

  const taxableSales = gross / (1 + rate / 100);
  const taxCollected = gross - taxableSales;

  return {
    taxableSales,
    exemptOrNoTaxSales: 0,
    taxCollected,
  };
}

function invoicePaidAmount(invoice: Invoice) {
  const total = parseMoney(invoice.invoice_amount);
  const paid = parseMoney(invoice.amount_paid);

  return Math.min(Math.max(paid, 0), Math.max(total, 0));
}

function invoiceOpenAmount(invoice: Invoice) {
  return Math.max(
    parseMoney(invoice.invoice_amount) - invoicePaidAmount(invoice),
    0
  );
}

function reportsHref(
  businessSlug: string,
  options: {
    property?: string;
    range?: ReportRange;
    from?: string;
    to?: string;
  }
) {
  const params = new URLSearchParams({
    business: businessSlug,
    property: options.property ?? "all",
    range: options.range ?? "month",
  });

  if (options.range === "custom") {
    if (options.from) {
      params.set("from", options.from);
    }

    if (options.to) {
      params.set("to", options.to);
    }
  }

  return `/reports?${params.toString()}`;
}

function queueHref(
  businessSlug: string,
  options?: {
    q?: string;
    status?: string;
    view?: string;
  }
) {
  const params = new URLSearchParams({
    business: businessSlug,
  });

  if (options?.q) {
    params.set("q", options.q);
  }

  if (options?.status) {
    params.set("status", options.status);
  }

  if (options?.view) {
    params.set("view", options.view);
  }

  return `/queue?${params.toString()}`;
}

function appHref(businessSlug: string, path: string) {
  return `${path}?business=${businessSlug}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    property?: string;
    range?: ReportRange;
    from?: string;
    to?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const propertyFilter =
    resolvedSearchParams.property?.trim().toLowerCase() ?? "all";
  const range =
    resolvedSearchParams.range === "week" ||
    resolvedSearchParams.range === "all" ||
    resolvedSearchParams.range === "custom"
      ? resolvedSearchParams.range
      : "month";
  const customStartDate = resolvedSearchParams.from ?? "";
  const customEndDate = resolvedSearchParams.to ?? "";

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const reportLoadMessages: string[] = [];

  if (businessError) {
    console.warn("Reports workspace lookup failed:", businessError.message);
    reportLoadMessages.push(
      "Workspace details could not be loaded. Try signing in again, then reopen this workspace."
    );
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
          .select(
            "id, customer_name, invoice_amount, amount_paid, status, created_at, tax_mode, tax_label, tax_rate, tax_number, split_parent_invoice_id"
          )
          .eq("business_id", selectedBusiness.id)
          .order("created_at", { ascending: false }),
      ]);

    if (queueResponse.error) {
      console.warn(
        "Report queue data could not be loaded:",
        queueResponse.error.message
      );
      reportLoadMessages.push(
        "Queue report data could not be loaded yet."
      );
    }

    if (estimateResponse.error) {
      console.warn(
        "Report estimate data could not be loaded:",
        estimateResponse.error.message
      );
      reportLoadMessages.push(
        "Estimate report data could not be loaded yet."
      );
    }

    if (invoiceResponse.error) {
      console.warn(
        "Report invoice data could not be loaded:",
        invoiceResponse.error.message
      );
      reportLoadMessages.push(
        "Invoice report data could not be loaded yet."
      );
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
      (isInRange(item.created_at, range, customStartDate, customEndDate) ||
        isInRange(
          item.move_out_date,
          range,
          customStartDate,
          customEndDate
        ) ||
        isInRange(
          item.ready_date,
          range,
          customStartDate,
          customEndDate
        ) ||
        isInRange(
          item.scheduled_date,
          range,
          customStartDate,
          customEndDate
        ) ||
        isInRange(
          item.completed_date,
          range,
          customStartDate,
          customEndDate
        ))
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
  const renovationNeededUnits = filteredQueueItems.filter(
    (item) => item.renovation_needed
  );
  const priorRenovationUnits = filteredQueueItems.filter(
    (item) => item.prior_renovation || item.prior_renovation_details
  );

  const propertyLabel =
    propertyFilter === "all"
      ? "All Properties"
      : properties.find(
          (property) => propertyKey(property) === propertyFilter
        ) ?? "Selected Property";
  const queuePropertySearch =
    propertyFilter === "all" ? undefined : propertyLabel;
  const flooringQueueSearch =
    propertyFilter === "all" ? "floor" : `${propertyLabel} floor`;

  const rangeLabel =
    range === "week"
      ? "Last 7 Days"
      : range === "month"
        ? "This Month"
        : range === "custom"
          ? `${customStartDate || "..."} to ${customEndDate || "..."}`
          : "All Time";

  const filteredEstimates = estimates.filter((estimate) =>
    isInRange(estimate.created_at, range, customStartDate, customEndDate)
  );

  const splitParentInvoiceIds = new Set(
    invoices
      .map((invoice) => invoice.split_parent_invoice_id)
      .filter((id): id is string => Boolean(id))
  );
  const billableInvoices = invoices.filter(
    (invoice) => !splitParentInvoiceIds.has(invoice.id)
  );

  const filteredInvoices = billableInvoices.filter((invoice) =>
    isInRange(invoice.created_at, range, customStartDate, customEndDate)
  );

  const estimatedRevenue = filteredEstimates.reduce(
    (total, estimate) => total + parseMoney(estimate.estimate_amount),
    0
  );

  const invoicedRevenue = filteredInvoices.reduce(
    (total, invoice) => total + parseMoney(invoice.invoice_amount),
    0
  );

  const paymentsCollected = filteredInvoices.reduce(
    (total, invoice) => total + invoicePaidAmount(invoice),
    0
  );

  const openReceivables = filteredInvoices.reduce(
    (total, invoice) => total + invoiceOpenAmount(invoice),
    0
  );

  const salesTaxSummary = filteredInvoices.reduce(
    (summary, invoice) => {
      const parts = invoiceTaxParts(invoice);
      summary.taxableSales += parts.taxableSales;
      summary.exemptOrNoTaxSales += parts.exemptOrNoTaxSales;
      summary.taxCollected += parts.taxCollected;

      return summary;
    },
    {
      taxableSales: 0,
      exemptOrNoTaxSales: 0,
      taxCollected: 0,
    }
  );

  const taxBreakdown = Array.from(
    filteredInvoices.reduce((groups, invoice) => {
      const parts = invoiceTaxParts(invoice);
      const key =
        parts.taxCollected > 0
          ? taxSummaryKey(invoice)
          : invoiceTaxMode(invoice) === "tax_exempt"
            ? "Tax Exempt"
            : "No Tax / Not Taxed";
      const existing = groups.get(key) ?? {
        label: key,
        invoiceCount: 0,
        taxableSales: 0,
        exemptOrNoTaxSales: 0,
        taxCollected: 0,
      };

      existing.invoiceCount += 1;
      existing.taxableSales += parts.taxableSales;
      existing.exemptOrNoTaxSales += parts.exemptOrNoTaxSales;
      existing.taxCollected += parts.taxCollected;
      groups.set(key, existing);

      return groups;
    }, new Map<string, {
      label: string;
      invoiceCount: number;
      taxableSales: number;
      exemptOrNoTaxSales: number;
      taxCollected: number;
    }>())
  )
    .map(([, value]) => value)
    .sort((first, second) => second.taxCollected - first.taxCollected);

  const clientRevenueBreakdown = Array.from(
    filteredInvoices.reduce((groups, invoice) => {
      const key = invoice.customer_name?.trim() || "Unknown Client";
      const existing = groups.get(key) ?? {
        label: key,
        invoiceCount: 0,
        invoiceTotal: 0,
        paidTotal: 0,
        openTotal: 0,
      };

      existing.invoiceCount += 1;
      existing.invoiceTotal += parseMoney(invoice.invoice_amount);
      existing.paidTotal += invoicePaidAmount(invoice);
      existing.openTotal += invoiceOpenAmount(invoice);
      groups.set(key, existing);

      return groups;
    }, new Map<string, {
      label: string;
      invoiceCount: number;
      invoiceTotal: number;
      paidTotal: number;
      openTotal: number;
    }>())
  )
    .map(([, value]) => value)
    .sort((first, second) => second.invoiceTotal - first.invoiceTotal);

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
  const unitLayoutBreakdown = countBy(
    filteredQueueItems,
    (item) => item.unit_layout
  );
  const renovationBreakdown = countBy(
    priorRenovationUnits,
    (item) => item.prior_renovation_details || "Prior Renovation"
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
              A first reporting view for retained unit-turn queue history,
              readiness, scheduling, completion, and job mix. Regular
              estimates and invoices can still bypass the queue.
            </p>
          </div>

          <Link
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
            })}
          >
            <Button variant="secondary">Open Queue</Button>
          </Link>
        </div>

        {reportLoadMessages.length > 0 ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Report notice
            </p>

            <p className="mt-2 text-sm leading-6 text-amber-100/90">
              {reportLoadMessages.join(" ")}
            </p>
          </Card>
        ) : null}

        <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 via-zinc-950 to-orange-500/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                Report Library
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Choose the report you need
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Trimax keeps the FreshBooks idea of grouped report cards, but
                focuses on operations, invoices, payments, tax, and activity
                instead of broad bookkeeping extras.
              </p>
            </div>

            <Link
              href={appHref(businessSlug, "/activity")}
              className="text-sm font-semibold text-orange-400 transition hover:text-orange-300"
            >
              Open Activity Log
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ReportTile
              label="Invoice Details"
              description="Open the invoice list to review drafts, sent invoices, split invoices, amounts, and statuses."
              href={appHref(businessSlug, "/invoices")}
              badge="Core"
            />
            <ReportTile
              label="Profit and Loss Lite"
              description="Review the income side of the business without pretending Trimax is full accounting software."
              href="#accounting-lite"
              badge="New"
            />
            <ReportTile
              label="Revenue by Client"
              description="See which customers are driving invoice totals, payments collected, and open balances."
              href="#revenue-by-client"
            />
            <ReportTile
              label="Accounts Aging"
              description="Use invoices and payments together to see unpaid balances and payment attention areas."
              href={appHref(businessSlug, "/payments")}
              badge="Money"
            />
            <ReportTile
              label="Cash Flow Lite"
              description="Track money collected and outstanding invoice balances from the data already in Trimax."
              href="#accounting-lite"
            />
            <ReportTile
              label="Sales Tax Summary"
              description="Use the current report filters with invoice totals and tax labels to review taxable work."
              href="#financial-reports"
              badge="Updated"
            />
            <ReportTile
              label="Queue History"
              description="Review recent property turns, paint due dates, scheduling, completion, and notes."
              href="#queue-history"
              badge="Operations"
            />
            <ReportTile
              label="Schedule Calendar"
              description="Open scheduled work, due-soon units, and calendar downloads for planned paint jobs."
              href={appHref(businessSlug, "/schedule")}
            />
            <ReportTile
              label="Unit Layout Mix"
              description="See how many North Creek queue items are being collected as 2x2, 2x1, or not set."
              href="#job-mix-reports"
              badge="New"
            />
            <ReportTile
              label="Audit Activity"
              description="Review important queue, estimate, invoice, payment, split, and access request activity."
              href={appHref(businessSlug, "/activity")}
            />
            <ReportTile
              label="General Ledger Lite"
              description="Use the Activity Log as the plain-language trail of important workspace events."
              href={appHref(businessSlug, "/activity")}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="grid gap-5 xl:grid-cols-[1fr_auto_auto] xl:items-end">
            <div>
              <p className="text-sm text-zinc-400">Property</p>

              <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-auto pr-1">
                <Link
                  href={reportsHref(businessSlug, {
                    property: "all",
                    range,
                    from: customStartDate,
                    to: customEndDate,
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
                      property: propertyKey(property),
                      range,
                      from: customStartDate,
                      to: customEndDate,
                    })}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      propertyFilter === propertyKey(property)
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

          <form
            action="/reports"
            className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input type="hidden" name="business" value={businessSlug} />
            <input type="hidden" name="property" value={propertyFilter} />
            <input type="hidden" name="range" value="custom" />

            <DateInputField
              label="From"
              name="from"
              defaultValue={customStartDate}
            />

            <DateInputField
              label="To"
              name="to"
              defaultValue={customEndDate}
            />

            <div className="flex items-end">
              <Button type="submit">Apply Dates</Button>
            </div>
          </form>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Units Submitted"
            value={filteredQueueItems.length}
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
            })}
          />
          <MetricCard
            label="Active Units"
            value={activeQueueItems.length}
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
            })}
          />
          <MetricCard
            label="Queue Pending Review"
            value={pendingReview.length}
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
              view: "needs-estimate",
            })}
          />
          <MetricCard
            label="Scheduled"
            value={scheduledItems.length}
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
              status: "scheduled",
            })}
          />
          <MetricCard
            label="Completed"
            value={completedItems.length}
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
              status: "completed",
            })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Due Soon, Not Scheduled"
            value={approachingReadyUnscheduled.length}
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
              view: "ready-soon",
            })}
          />
          <MetricCard
            label="Avg Turnaround"
            value={
              averageTurnaround === null ? "-" : `${averageTurnaround} days`
            }
          />
          <MetricCard
            label="Smoker / Remediation"
            value={smokerUnits.length}
            href={queueHref(businessSlug, {
              q: queuePropertySearch,
              view: "remediation",
            })}
          />
          <MetricCard
            label="Flooring Work"
            value={flooringUnits.length}
            href={queueHref(businessSlug, {
              q: flooringQueueSearch,
            })}
          />
          <MetricCard
            label="Current Renovations"
            value={renovationNeededUnits.length}
            href={queueHref(businessSlug, {
              q: "renovation needed",
            })}
          />
          <MetricCard
            label="Prior Renovation"
            value={priorRenovationUnits.length}
            href={queueHref(businessSlug, {
              q: "prior renovation",
            })}
          />
        </div>

        <div id="financial-reports" className="scroll-mt-24">
        <RoleVisible
          businessSlug={businessSlug}
          allow={["owner", "admin", "accountant"]}
          fallback={
            <Card className="border-purple-500/30 bg-purple-500/5">
              <p className="text-sm uppercase tracking-[0.3em] text-purple-300">
                Property Report View
              </p>

              <h2 className="mt-3 text-2xl font-bold">
                Financial totals are kept internal
              </h2>

              <p className="mt-3 max-w-3xl text-zinc-300">
                This view shows unit history, readiness, scheduling, job
                mix, and completion information without exposing company
                revenue or invoice totals.
              </p>
            </Card>
          }
        >
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

          <Card
            id="accounting-lite"
            className="mt-4 scroll-mt-24 border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/5"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                  Accounting Lite
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Business money snapshot
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  Borrowed from FreshBooks, but kept honest for Trimax:
                  this shows income, payments, open balances, and tax from
                  invoices. It does not calculate true profit until expenses
                  and bank activity are tracked here.
                </p>
              </div>

              <Link
                href={appHref(businessSlug, "/payments")}
                className="text-sm font-semibold text-orange-400 transition hover:text-orange-300"
              >
                Open Payments
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <TaxMetric
                label="Invoice Income"
                value={formatMoney(invoicedRevenue)}
              />
              <TaxMetric
                label="Payments Collected"
                value={formatMoney(paymentsCollected)}
                strong
              />
              <TaxMetric
                label="Open A/R"
                value={formatMoney(openReceivables)}
              />
              <TaxMetric
                label="Tax Collected"
                value={formatMoney(salesTaxSummary.taxCollected)}
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-sky-500/20 bg-black/25 p-4">
                <p className="text-sm font-bold text-sky-200">
                  Profit and Loss Lite
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Useful for revenue review today. True profit needs an
                  expense tracker before the number should be trusted.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-black/25 p-4">
                <p className="text-sm font-bold text-emerald-200">
                  Cash Flow Lite
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Uses invoice payments and open balances so you can see what
                  has actually been collected.
                </p>
              </div>

              <Link
                href={appHref(businessSlug, "/activity")}
                className="rounded-2xl border border-orange-500/20 bg-black/25 p-4 transition hover:border-orange-500/50 hover:bg-zinc-900"
              >
                <p className="text-sm font-bold text-orange-200">
                  General Ledger Lite
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  The Activity Log is the current record trail for important
                  queue, invoice, payment, and access events.
                </p>
              </Link>
            </div>
          </Card>

          <Card id="revenue-by-client" className="mt-4 scroll-mt-24">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Revenue by Client
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Who is driving revenue
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  This uses the same report filters and only counts billable
                  invoices, so split parent invoices do not double count.
                </p>
              </div>

              <Link
                href={appHref(businessSlug, "/clients")}
                className="text-sm font-semibold text-orange-400 transition hover:text-orange-300"
              >
                Open Clients
              </Link>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 bg-zinc-950 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                <span>Client</span>
                <span className="text-right">Invoiced</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Open</span>
              </div>

              {clientRevenueBreakdown.length === 0 ? (
                <div className="p-4 text-sm text-zinc-400">
                  No invoices match this client revenue view yet.
                </div>
              ) : (
                clientRevenueBreakdown.slice(0, 8).map((item) => (
                  <div
                    key={item.label}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-t border-zinc-800 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-zinc-100">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.invoiceCount} invoice
                        {item.invoiceCount === 1 ? "" : "s"}
                      </p>
                    </div>

                    <p className="text-right font-semibold text-zinc-200">
                      {formatMoney(item.invoiceTotal)}
                    </p>
                    <p className="text-right font-semibold text-emerald-300">
                      {formatMoney(item.paidTotal)}
                    </p>
                    <p className="text-right font-bold text-orange-300">
                      {formatMoney(item.openTotal)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="mt-4 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-zinc-950 to-orange-500/5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                  Sales Tax Summary
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Tax review for {rangeLabel}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  This summarizes invoice tax settings saved in Trimax. Use it
                  as a review aid before comparing against official filing
                  records.
                </p>
              </div>

              <Link
                href={appHref(businessSlug, "/invoices")}
                className="text-sm font-semibold text-orange-400 transition hover:text-orange-300"
              >
                Open Invoices
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <TaxMetric
                label="Taxable Sales"
                value={formatMoney(salesTaxSummary.taxableSales)}
              />
              <TaxMetric
                label="Tax Collected"
                value={formatMoney(salesTaxSummary.taxCollected)}
                strong
              />
              <TaxMetric
                label="No Tax / Exempt"
                value={formatMoney(salesTaxSummary.exemptOrNoTaxSales)}
              />
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-zinc-950 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                <span>Tax Area / Number</span>
                <span className="text-right">Taxable</span>
                <span className="text-right">Tax</span>
              </div>

              {taxBreakdown.length === 0 ? (
                <div className="p-4 text-sm text-zinc-400">
                  No invoices match this tax report view yet.
                </div>
              ) : (
                taxBreakdown.map((item) => (
                  <div
                    key={item.label}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-zinc-800 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-zinc-100">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.invoiceCount} invoice
                        {item.invoiceCount === 1 ? "" : "s"}
                        {item.exemptOrNoTaxSales > 0
                          ? ` / ${formatMoney(
                              item.exemptOrNoTaxSales
                            )} no-tax or exempt`
                          : ""}
                      </p>
                    </div>

                    <p className="text-right font-semibold text-zinc-200">
                      {formatMoney(item.taxableSales)}
                    </p>
                    <p className="text-right font-bold text-emerald-300">
                      {formatMoney(item.taxCollected)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </RoleVisible>
        </div>

        <div id="job-mix-reports" className="grid scroll-mt-24 gap-4 lg:grid-cols-3">
          <BreakdownCard title="Status Breakdown" items={statusBreakdown} />
          <BreakdownCard title="Paint Type" items={paintBreakdown} />
          <BreakdownCard title="Flooring Type" items={flooringBreakdown} />
          <BreakdownCard title="Unit Layout" items={unitLayoutBreakdown} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownCard
            title="Prior Renovation History"
            items={renovationBreakdown}
          />

          <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-zinc-950 to-emerald-500/5">
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Renovation Watch
            </p>

            <h2 className="mt-3 text-2xl font-bold">
              Units with current renovation work
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Units marked during queue intake appear here so they can be
              reviewed before estimate creation and remembered as future unit
              history.
            </p>

            <div className="mt-4 space-y-3">
              {renovationNeededUnits.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  href={`/queue/${item.id}?business=${businessSlug}`}
                  className="block rounded-2xl border border-orange-500/20 bg-black/20 px-4 py-3 transition hover:border-orange-500/40"
                >
                  <p className="font-semibold">
                    {item.property || "Property"} - Unit {item.unit || "-"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {item.prior_renovation_details ||
                      item.renovation_needed_details ||
                      "No renovation detail saved."}
                  </p>
                </Link>
              ))}

              {renovationNeededUnits.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-black/20 p-4 text-sm text-zinc-400">
                  No matching units are marked with current renovation work.
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <Card id="queue-history">
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
              <div className="p-5">
                <p className="font-semibold">
                  No property records match this report view yet.
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Try a wider date range, switch the property filter, or open
                  the queue to add the next unit turn.
                </p>
                <Link
                  href={`/queue?business=${businessSlug}`}
                  className="mt-4 inline-flex rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-400"
                >
                  Open Queue
                </Link>
              </div>
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
                    {item.renovation_needed ||
                    item.renovation_needed_details ||
                    item.prior_renovation_details ? (
                      <p className="mt-2 text-sm text-emerald-300">
                        Renovation:{" "}
                        {item.renovation_needed ? "Needed" : "Prior"}
                        {item.renovation_needed_details
                          ? ` / ${item.renovation_needed_details}`
                          : item.prior_renovation_details
                            ? ` / ${item.prior_renovation_details}`
                          : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-3 md:text-right">
                    <MiniDate label="Move Out" value={item.move_out_date} />
                    <MiniDate label="Paint Due" value={item.ready_date} />
                    <MiniDate label="Done" value={item.completed_date} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-sky-500/5 to-emerald-500/10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-purple-300">
                Future Property Portal
              </p>

              <h2 className="mt-3 text-2xl font-bold">
                Built toward property manager dashboards
              </h2>

              <p className="mt-3 max-w-3xl text-zinc-300">
                This reporting foundation now supports limited property
                manager views: queue history, readiness dates, status updates,
                and property-level reports without company financial totals.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[34rem]">
              {[
                "Scoped queue intake",
                "Readiness and scheduling",
                "Property-only reporting",
              ].map((label) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 text-sm font-semibold text-zinc-100"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <Card className="min-h-32 p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-3 text-4xl font-bold leading-none">{value}</p>
      {href ? (
        <p className="mt-4 text-sm font-semibold text-orange-400">
          Open queue view
        </p>
      ) : null}
    </Card>
  );

  if (!href) {
    return content;
  }

  return (
    <Link
      href={href}
      className="block transition hover:-translate-y-0.5 hover:opacity-95"
    >
      {content}
    </Link>
  );
}

function ReportTile({
  label,
  description,
  href,
  badge,
}: {
  label: string;
  description: string;
  href: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 transition hover:-translate-y-0.5 hover:border-orange-500/50 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sm font-black text-sky-300">
            {label
              .split(" ")
              .slice(0, 2)
              .map((word) => word.charAt(0))
              .join("")}
          </span>

          <div>
            <p className="font-semibold text-zinc-100 transition group-hover:text-orange-300">
              {label}
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              {description}
            </p>
          </div>
        </div>

        {badge ? (
          <span className="shrink-0 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-orange-300">
            {badge}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function TaxMetric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-black/25 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-black ${
          strong ? "text-emerald-300" : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; count: number }[];
}) {
  const maxCount = Math.max(
    ...items.map((item) => item.count),
    1
  );

  return (
    <Card className="report-breakdown-card border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-zinc-950 to-sky-500/5">
      <h2 className="text-xl font-bold">{title}</h2>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-orange-500/20 bg-black/20 p-4">
            <p className="text-sm font-semibold">Waiting for report data.</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Matching queue records will fill this section automatically.
            </p>
          </div>
        ) : (
          items.slice(0, 6).map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-orange-500/20 bg-black/25 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-zinc-300">{item.label}</p>
                <p className="font-bold text-orange-400">{item.count}</p>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-900">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{
                    width: `${Math.max(
                      (item.count / maxCount) * 100,
                      item.count > 0 ? 10 : 0
                    )}%`,
                  }}
                />
              </div>
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
