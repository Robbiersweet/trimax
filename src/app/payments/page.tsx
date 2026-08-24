import Link from "next/link";
import AppShell from "../components/AppShell";
import BatchInvoicePayments from "../components/BatchInvoicePayments";
import Button from "../components/Button";
import Card from "../components/Card";
import PersistentDetails from "../components/PersistentDetails";
import {
  invoiceCollectionAmountDue,
  isPaymentEligibleInvoice,
  type InvoiceEligibilityLineItem,
} from "../lib/invoiceEligibility";
import { moneyNumber } from "../lib/invoiceLifecycle";
import {
  summarizePaymentTimeliness,
  timelinessLogFromActivity,
} from "../lib/paymentTimeliness";
import { createSupabaseServerClient } from "../lib/supabaseServer";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type Invoice = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  status: string | null;
  due_date: string | null;
  updated_at: string | null;
  created_at: string | null;
  split_parent_invoice_id?: string | null;
};

type InvoiceWithoutUpdatedAt = Omit<Invoice, "updated_at">;

type InvoiceLineItem = InvoiceEligibilityLineItem & {
  invoice_id: string;
};

type ActivityLog = {
  id: string;
  action: string;
  actor_email: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

type PaymentHistoryFilter = "all" | "on-time" | "late";
type PaymentHistorySort = "recent" | "days-late" | "client" | "invoice";

function parseMoney(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseMoney(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function daysPastDue(value: string | null) {
  if (!value) {
    return null;
  }

  const dueDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
}

function hasActiveDepositRequest(invoice: Invoice) {
  return (
    String(invoice.deposit_status ?? "none").toLowerCase() === "requested" &&
    parseMoney(invoice.deposit_requested_amount) > 0
  );
}

function activityAmount(log: ActivityLog) {
  const amount =
    log.details?.amountApplied ??
    log.details?.checkAmount ??
    log.details?.depositAmount ??
    log.details?.paymentAmount;

  return typeof amount === "string" || typeof amount === "number"
    ? parseMoney(amount)
    : 0;
}

function detailText(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function paymentActivityLabel(action: string) {
  const labels: Record<string, string> = {
    "invoice.batch_payment_applied": "Payment Applied",
    "invoice.deposit_requested": "Deposit Requested",
    "invoice.deposit_cleared": "Deposit Cleared",
  };

  return labels[action] ?? "Payment Activity";
}

function paymentOutcomeLabel(log: ActivityLog) {
  const outcome = detailText(log.details?.paymentOutcome).toLowerCase();

  if (outcome === "paid") {
    return "Paid in full";
  }

  if (outcome === "partial") {
    return "Partial payment";
  }

  if (log.action === "invoice.deposit_requested") {
    return "Deposit requested";
  }

  if (log.action === "invoice.deposit_cleared") {
    return "Deposit cleared";
  }

  return "Proof saved";
}

function paymentReferenceLabel(log: ActivityLog) {
  const reference = detailText(log.details?.paymentReference);
  const type = detailText(log.details?.paymentType);
  const image = detailText(log.details?.paymentImageFileName);

  if (reference && type) {
    return `${type} ${reference}`;
  }

  if (reference) {
    return `Reference ${reference}`;
  }

  if (image) {
    return `Image ${image}`;
  }

  return "";
}

function paymentProofChips(log: ActivityLog) {
  const details = log.details ?? {};
  const chips = [
    { label: "Payment Date", value: formatDate(detailText(details.paymentDate)) },
    { label: "Type", value: detailText(details.paymentType) },
    { label: "Reference", value: detailText(details.paymentReference) },
    { label: "Check Amount", value: formatMoney(details.checkAmount as string | number | null | undefined) },
    { label: "Applied", value: formatMoney(details.amountApplied as string | number | null | undefined) },
    { label: "Deposit", value: formatMoney(details.depositAmount as string | number | null | undefined) },
    { label: "Batch", value: detailText(details.batchInvoiceCount) },
    { label: "Stub Match", value: detailText(details.remittanceStubMatched) },
    { label: "Image", value: detailText(details.paymentImageFileName) },
    { label: "Note", value: detailText(details.internalNote ?? details.note) },
  ];

  return chips.filter((chip) => {
    if (!chip.value || chip.value === "-") {
      return false;
    }

    return (
      !["Check Amount", "Applied", "Deposit"].includes(chip.label) ||
      parseMoney(chip.value) > 0
    );
  });
}

function paymentHistoryHref({
  businessSlug,
  filter,
  sort,
  from,
  to,
  client,
}: {
  businessSlug: string;
  filter: PaymentHistoryFilter;
  sort: PaymentHistorySort;
  from: string;
  to: string;
  client: string;
}) {
  const params = new URLSearchParams({ business: businessSlug });

  if (filter !== "all") params.set("paymentHistory", filter);
  if (sort !== "recent") params.set("paymentSort", sort);
  if (from) params.set("paymentFrom", from);
  if (to) params.set("paymentTo", to);
  if (client) params.set("paymentClient", client);

  return `/payments?${params.toString()}#payment-history`;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    customer?: string;
    invoiceIds?: string;
    paymentClient?: string;
    paymentFrom?: string;
    paymentHistory?: PaymentHistoryFilter;
    paymentSort?: PaymentHistorySort;
    paymentTo?: string;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;
  const focusedCustomer = resolvedSearchParams.customer?.trim() ?? "";
  const paymentHistoryFilter: PaymentHistoryFilter =
    resolvedSearchParams.paymentHistory === "late" ||
    resolvedSearchParams.paymentHistory === "on-time"
      ? resolvedSearchParams.paymentHistory
      : "all";
  const paymentHistorySort: PaymentHistorySort =
    resolvedSearchParams.paymentSort === "days-late" ||
    resolvedSearchParams.paymentSort === "client" ||
    resolvedSearchParams.paymentSort === "invoice"
      ? resolvedSearchParams.paymentSort
      : "recent";
  const paymentHistoryClient = resolvedSearchParams.paymentClient?.trim() ?? "";
  const paymentHistoryFrom = resolvedSearchParams.paymentFrom?.trim() ?? "";
  const paymentHistoryTo = resolvedSearchParams.paymentTo?.trim() ?? "";
  const initialInvoiceIds = (resolvedSearchParams.invoiceIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const business = businessData as Business | null;

  let invoices: Invoice[] = [];
  let lineItems: InvoiceLineItem[] = [];
  let paymentLogs: ActivityLog[] = [];
  const loadIssues: string[] = [];

  if (businessError) {
    loadIssues.push("Trimax could not load the selected business.");
  }

  if (business?.id) {
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, display_id, customer_name, project_title, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, due_date, updated_at, created_at, split_parent_invoice_id"
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (invoiceError) {
      const { data: fallbackInvoiceData, error: fallbackInvoiceError } =
        await supabase
          .from("invoices")
          .select(
            "id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, due_date, created_at, split_parent_invoice_id"
          )
          .eq("business_id", business.id)
          .order("created_at", { ascending: false });

      if (fallbackInvoiceError) {
        loadIssues.push(
          "Invoices could not be loaded yet. Try signing in again; if this stays here, invoice access settings need attention."
        );
      } else {
        invoices = ((fallbackInvoiceData ?? []) as InvoiceWithoutUpdatedAt[]).map(
          (invoice) => ({
            ...invoice,
            updated_at: null,
          })
        );
      }
    } else {
      invoices = (invoiceData ?? []) as Invoice[];
    }

    const invoiceIds = invoices.map((invoice) => invoice.id);
    if (invoiceIds.length > 0) {
      const { data: lineItemData, error: lineItemError } = await supabase
        .from("invoice_line_items")
        .select("invoice_id, description, quantity, unit_price, line_total")
        .in("invoice_id", invoiceIds);

      if (lineItemError) {
        loadIssues.push("Invoice payment eligibility could not be fully checked.");
      } else {
        lineItems = (lineItemData ?? []) as InvoiceLineItem[];
      }
    }

    const { data: activityData, error: activityError } = await supabase
      .from("activity_logs")
      .select("id, action, actor_email, entity_label, details, created_at")
      .eq("business_id", business.id)
      .in("action", [
        "invoice.batch_payment_applied",
        "invoice.deposit_requested",
        "invoice.deposit_cleared",
      ])
      .order("created_at", { ascending: false })
      .limit(250);

    if (activityError) {
      loadIssues.push(
        "Recent payment activity could not be loaded yet. Payments can still be reviewed once activity access is ready."
      );
    }

    paymentLogs = (activityData ?? []) as ActivityLog[];
  }

  const splitChildrenByParentId = new Map<string, number>();
  invoices.forEach((invoice) => {
    if (!invoice.split_parent_invoice_id) return;
    splitChildrenByParentId.set(
      invoice.split_parent_invoice_id,
      (splitChildrenByParentId.get(invoice.split_parent_invoice_id) ?? 0) + 1
    );
  });
  const lineItemsByInvoiceId = lineItems.reduce((itemsById, item) => {
    const current = itemsById.get(item.invoice_id) ?? [];
    current.push(item);
    itemsById.set(item.invoice_id, current);
    return itemsById;
  }, new Map<string, InvoiceEligibilityLineItem[]>());
  const payableInvoices = invoices
    .map((invoice) => {
      const invoiceAmount = moneyNumber(invoice.invoice_amount);
      const amountPaid = moneyNumber(invoice.amount_paid);
      const isDepositRequest = hasActiveDepositRequest(invoice);

      return {
        ...invoice,
        split_children_count: splitChildrenByParentId.get(invoice.id) ?? 0,
        invoiceAmount,
        amountPaid,
        amountDue: invoiceCollectionAmountDue(invoice),
        isDepositRequest,
        daysLate: daysPastDue(invoice.due_date),
      };
    })
    .filter((invoice) =>
      isPaymentEligibleInvoice({
        invoice,
        lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
      })
    );
  const paymentTimelinessLogs = paymentLogs
    .map((log) => timelinessLogFromActivity(log))
    .filter((log): log is NonNullable<typeof log> => Boolean(log));
  const paymentClients = Array.from(
    new Set(paymentTimelinessLogs.map((log) => log.customerName))
  ).sort((first, second) => first.localeCompare(second));
  const filteredPaymentTimelinessLogs = paymentTimelinessLogs
    .filter((log) => {
      if (paymentHistoryFilter === "late" && !log.paidLate) return false;
      if (paymentHistoryFilter === "on-time" && log.paidLate) return false;
      if (paymentHistoryClient && log.customerName !== paymentHistoryClient) {
        return false;
      }
      if (paymentHistoryFrom && log.fullyPaidDate < paymentHistoryFrom) {
        return false;
      }
      if (paymentHistoryTo && log.fullyPaidDate > paymentHistoryTo) {
        return false;
      }

      return true;
    })
    .sort((first, second) => {
      if (paymentHistorySort === "days-late") {
        return (
          second.daysLate - first.daysLate ||
          second.fullyPaidDate.localeCompare(first.fullyPaidDate)
        );
      }

      if (paymentHistorySort === "client") {
        return (
          first.customerName.localeCompare(second.customerName) ||
          second.fullyPaidDate.localeCompare(first.fullyPaidDate)
        );
      }

      if (paymentHistorySort === "invoice") {
        return (
          first.invoiceNumber.localeCompare(second.invoiceNumber) ||
          second.fullyPaidDate.localeCompare(first.fullyPaidDate)
        );
      }

      return second.fullyPaidDate.localeCompare(first.fullyPaidDate);
    });
  const paymentTimelinessStats = summarizePaymentTimeliness(
    filteredPaymentTimelinessLogs
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-300">
              Payments
            </p>

            <h1 className="mt-3 text-4xl font-bold">Payment Workspace</h1>
          </div>
        </div>

        {loadIssues.length > 0 ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-200">
              Payment Data Notice
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Payments page is open, but some data needs attention
            </h2>

            <div className="mt-4 space-y-2 text-sm leading-6 text-amber-100/90">
              {loadIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          </Card>
        ) : null}

        {payableInvoices.length === 0 ? (
          <Card className="payment-empty-state border-sky-500/25 bg-sky-500/5">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
                  Payment Desk Clear
                </p>

                <h2 className="mt-2 text-3xl font-black">
                  No open invoices need payment right now
                </h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href={`/invoices/new${businessQuery}`}>
                  <Button>New Invoice</Button>
                </Link>

                <Link href={`/invoices${businessQuery}`}>
                  <Button variant="secondary">Review Invoices</Button>
                </Link>
              </div>
            </div>
          </Card>
        ) : null}

        <div id="batch-payment-tool" className="scroll-mt-6">
          <BatchInvoicePayments
            businessId={business?.id}
            businessSlug={businessSlug}
            initialCustomer={focusedCustomer}
            initialInvoiceIds={initialInvoiceIds}
            invoices={invoices.map((invoice) => ({
              invoiceAmount: parseMoney(invoice.invoice_amount),
              amountPaid: parseMoney(invoice.amount_paid),
              collectionAmountDue: invoiceCollectionAmountDue(invoice),
              isDepositRequest: hasActiveDepositRequest(invoice),
              id: invoice.id,
              displayId: invoice.display_id ?? "Invoice",
              customerName: invoice.customer_name ?? "Unknown Customer",
              projectTitle: invoice.project_title ?? "Untitled Invoice",
              status: invoice.status ?? "Draft",
              dueDate: invoice.due_date,
              splitParentInvoiceId: invoice.split_parent_invoice_id ?? null,
              splitChildrenCount: splitChildrenByParentId.get(invoice.id) ?? 0,
            }))}
          />
        </div>

          <PersistentDetails
            storageKey={`trimax.payments.late-history.${businessSlug}`}
            title="Payment History"
            subtitle={`${paymentTimelinessStats.completedInvoices} completed invoices`}
            summaryMeta={
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">
                {paymentTimelinessStats.onTimePercent}% on time
              </span>
            }
            className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
            contentClassName="mt-4"
          >
            <div id="payment-history" className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-xs text-zinc-500">Completed</p>
                <p className="mt-1 text-xl font-black text-white">
                  {paymentTimelinessStats.completedInvoices}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
                <p className="text-xs text-emerald-100/80">On Time</p>
                <p className="mt-1 text-xl font-black text-emerald-100">
                  {paymentTimelinessStats.onTimePayments}
                </p>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2">
                <p className="text-xs text-amber-100/80">Late</p>
                <p className="mt-1 text-xl font-black text-amber-100">
                  {paymentTimelinessStats.latePayments}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-xs text-zinc-500">Avg Days Late</p>
                <p className="mt-1 text-xl font-black text-white">
                  {paymentTimelinessStats.averageDaysLate}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              {(["all", "on-time", "late"] as PaymentHistoryFilter[]).map((filter) => (
                <Link
                  key={filter}
                  href={paymentHistoryHref({
                    businessSlug,
                    filter,
                    sort: paymentHistorySort,
                    from: paymentHistoryFrom,
                    to: paymentHistoryTo,
                    client: paymentHistoryClient,
                  })}
                  className={`rounded-full border px-3 py-1.5 ${
                    paymentHistoryFilter === filter
                      ? "border-green-400 bg-green-400 text-black"
                      : "border-zinc-700 bg-black/20 text-zinc-200"
                  }`}
                >
                  {filter === "all" ? "All" : filter === "on-time" ? "On time" : "Late"}
                </Link>
              ))}
              {(["recent", "days-late", "client", "invoice"] as PaymentHistorySort[]).map((sort) => (
                <Link
                  key={sort}
                  href={paymentHistoryHref({
                    businessSlug,
                    filter: paymentHistoryFilter,
                    sort,
                    from: paymentHistoryFrom,
                    to: paymentHistoryTo,
                    client: paymentHistoryClient,
                  })}
                  className={`rounded-full border px-3 py-1.5 ${
                    paymentHistorySort === sort
                      ? "border-sky-300 bg-sky-300 text-black"
                      : "border-zinc-700 bg-black/20 text-zinc-200"
                  }`}
                >
                  {sort === "recent"
                    ? "Recent"
                    : sort === "days-late"
                      ? "Most late"
                      : sort === "client"
                        ? "Client"
                        : "Invoice #"}
                </Link>
              ))}
              {paymentClients.slice(0, 8).map((client) => (
                <Link
                  key={client}
                  href={paymentHistoryHref({
                    businessSlug,
                    filter: paymentHistoryFilter,
                    sort: paymentHistorySort,
                    from: paymentHistoryFrom,
                    to: paymentHistoryTo,
                    client,
                  })}
                  className={`rounded-full border px-3 py-1.5 ${
                    paymentHistoryClient === client
                      ? "border-orange-300 bg-orange-300 text-black"
                      : "border-zinc-700 bg-black/20 text-zinc-200"
                  }`}
                >
                  {client}
                </Link>
              ))}
              {(paymentHistoryClient || paymentHistoryFilter !== "all" || paymentHistorySort !== "recent") ? (
                <Link
                  href={`/payments${businessQuery}#payment-history`}
                  className="rounded-full border border-zinc-700 bg-black/20 px-3 py-1.5 text-zinc-200"
                >
                  Clear
                </Link>
              ) : null}
            </div>

            <form
              action="/payments"
              className="mt-3 grid gap-2 text-sm sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
            >
              <input type="hidden" name="business" value={businessSlug} />
              <input type="hidden" name="paymentHistory" value={paymentHistoryFilter} />
              <input type="hidden" name="paymentSort" value={paymentHistorySort} />
              {paymentHistoryClient ? (
                <input type="hidden" name="paymentClient" value={paymentHistoryClient} />
              ) : null}
              <label className="grid gap-1 text-zinc-400">
                From
                <input
                  type="date"
                  name="paymentFrom"
                  defaultValue={paymentHistoryFrom}
                  className="rounded-xl border border-zinc-700 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="grid gap-1 text-zinc-400">
                To
                <input
                  type="date"
                  name="paymentTo"
                  defaultValue={paymentHistoryTo}
                  className="rounded-xl border border-zinc-700 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="grid gap-1 text-zinc-400">
                Client
                <select
                  name="paymentClient"
                  defaultValue={paymentHistoryClient}
                  className="rounded-xl border border-zinc-700 bg-black/30 px-3 py-2 text-white"
                >
                  <option value="">All clients</option>
                  {paymentClients.map((client) => (
                    <option key={client} value={client}>
                      {client}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="self-end rounded-xl bg-green-500 px-4 py-2 font-black text-black"
              >
                Filter
              </button>
            </form>

            <div className="mt-4 grid gap-2">
              {filteredPaymentTimelinessLogs.length > 0 ? (
                filteredPaymentTimelinessLogs.slice(0, 50).map((log) => (
                  <Link
                    key={log.logId}
                    href={`/invoices/${log.invoiceId}${businessQuery}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition hover:border-green-400/50"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-black text-white">
                          {log.invoiceNumber} {log.customerName}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          Due {formatDate(log.dueDateAtCompletion)} · Paid {formatDate(log.fullyPaidDate)}
                          {log.finalPaymentReference
                            ? ` · Ref ${log.finalPaymentReference}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${
                          log.paidLate
                            ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                            : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        }`}
                      >
                        {log.paidLate ? `Paid ${log.daysLate} days late` : "Paid on time"}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-700 bg-black/20 p-4 text-sm text-zinc-300">
                  No completed payment-timeliness snapshots match these filters yet.
                </div>
              )}
            </div>
          </PersistentDetails>

          <PersistentDetails
            storageKey={`trimax.payments.history.${businessSlug}`}
            title="History"
            subtitle="Recent payments"
            summaryMeta={
              <Link
                href={`/activity${businessQuery}&type=payment`}
                className="text-sm font-semibold text-orange-400"
              >
                Open log
              </Link>
            }
            className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
          >

            {paymentLogs.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
                <p className="font-semibold text-green-200">
                  No recent payment activity.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {paymentLogs.map((log) => {
                  const chips = paymentProofChips(log);
                  const amount = activityAmount(log);
                  const outcome = paymentOutcomeLabel(log);
                  const reference = paymentReferenceLabel(log);

                  return (
                    <div
                      key={log.id}
                      className="payment-log-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
                            {paymentActivityLabel(log.action)}
                          </p>
                          <p className="mt-1 font-semibold text-white">
                            {log.entity_label ?? "Invoice payment"}
                          </p>
                          <p className="mt-1 text-sm text-zinc-300">
                            {formatDate(log.created_at)}
                            {log.actor_email ? ` by ${log.actor_email}` : ""}
                          </p>
                          {reference ? (
                            <p className="mt-1 text-sm font-semibold text-zinc-200">
                              {reference}
                            </p>
                          ) : null}
                        </div>

                        <div className="text-right">
                          {amount > 0 ? (
                            <p className="font-black text-green-300">
                              {formatMoney(amount)}
                            </p>
                          ) : null}
                          <p className="mt-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">
                            {outcome}
                          </p>
                        </div>
                      </div>

                      {chips.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {chips.map((chip) => (
                            <span
                              key={`${log.id}-${chip.label}-${chip.value}`}
                              className="payment-proof-chip rounded-full border border-zinc-700 bg-black/30 px-3 py-1 text-xs font-semibold text-zinc-200"
                            >
                              {chip.label}: {chip.value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </PersistentDetails>
      </div>
    </AppShell>
  );
}
