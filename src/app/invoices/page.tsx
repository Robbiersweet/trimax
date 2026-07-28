import Link from "next/link";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InvoiceFilterLink from "../components/InvoiceFilterLink";
import InvoiceResultsScroller from "../components/InvoiceResultsScroller";
import InvoiceWorkspaceNav from "../components/InvoiceWorkspaceNav";
import StatusBadge from "../components/StatusBadge";
import {
  businessDateKey,
  invoiceCollectionAmountDue,
  invoiceDaysPastDue,
  invoiceDueBucket,
  invoicePaymentIneligibleReason,
  isIncompleteDraftInvoice,
  isOverdueCollectibleInvoice,
  isPaymentEligibleInvoice,
  isSplitSourceInvoice,
  isHistoricalImportedDraft,
  nonCollectibleInvoiceLabel,
  type InvoiceEligibilityLineItem,
} from "../lib/invoiceEligibility";
import { invoiceStatusKey, moneyNumber } from "../lib/invoiceLifecycle";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string | null;
  slug: string;
};

type Invoice = {
  id: string;
  client_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  updated_at: string | null;
  created_at: string | null;
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
};

type InvoiceWithSplitInfo = Invoice & {
  split_children_count: number;
  split_parent_display_id: string | null;
};

type InvoiceLineItem = InvoiceEligibilityLineItem & {
  invoice_id: string;
};

type InvoiceActivityLog = {
  action: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
};

function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(moneyNumber(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
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

function parseInvoiceNumber(displayId: string | null) {
  const match = String(displayId ?? "").match(/(\d+)/);

  return match ? Number(match[1]) : 0;
}

function recordTime(value: string | null) {
  if (!value) {
    return 0;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

type InvoiceSortMode =
  | "needs_attention"
  | "oldest_due"
  | "newest_due"
  | "newest_invoice"
  | "highest_balance"
  | "invoice_number";

function invoiceActionRank(
  invoice: InvoiceWithSplitInfo,
  lineItems: InvoiceEligibilityLineItem[],
  todayKey: string
) {
  const status = invoiceStatusKey(invoice.status);
  const amountDue = invoiceCollectionAmountDue(invoice);
  const dueBucket = invoiceDueBucket({
    invoice,
    lineItems,
    todayKey,
  });

  if (dueBucket === "overdue") {
    return 0;
  }

  if (dueBucket === "due_today") {
    return 1;
  }

  if (dueBucket === "due_soon") {
    return 2;
  }

  if (isIncompleteDraftInvoice({ invoice, lineItems })) {
    return 3;
  }

  if (isHistoricalImportedDraft(invoice)) {
    return 8;
  }

  if (status === "sent" && amountDue > 0) {
    return 4;
  }

  if (status === "draft") {
    return 5;
  }

  if (status === "paid" || amountDue <= 0) {
    return 6;
  }

  if (nonCollectibleInvoiceLabel(invoice.status)) {
    return 7;
  }

  return 9;
}

function compareInvoices(
  lineItemsByInvoiceId: Map<string, InvoiceEligibilityLineItem[]>,
  sortMode: InvoiceSortMode,
  todayKey: string
) {
  return (first: InvoiceWithSplitInfo, second: InvoiceWithSplitInfo) => {
    const firstLineItems = lineItemsByInvoiceId.get(first.id) ?? [];
    const secondLineItems = lineItemsByInvoiceId.get(second.id) ?? [];
    const firstRank = invoiceActionRank(
      first,
      firstLineItems,
      todayKey
    );
    const secondRank = invoiceActionRank(
      second,
      secondLineItems,
      todayKey
    );
    const firstDueTime = recordTime(first.due_date);
    const secondDueTime = recordTime(second.due_date);
    const firstBalance = invoiceCollectionAmountDue(first);
    const secondBalance = invoiceCollectionAmountDue(second);
    const firstInvoiceNumber = parseInvoiceNumber(first.display_id);
    const secondInvoiceNumber = parseInvoiceNumber(second.display_id);

    if (sortMode === "oldest_due") {
      return (
        (firstDueTime || Number.MAX_SAFE_INTEGER) -
          (secondDueTime || Number.MAX_SAFE_INTEGER) ||
        firstInvoiceNumber - secondInvoiceNumber
      );
    }

    if (sortMode === "newest_due") {
      return (
        secondDueTime - firstDueTime ||
        secondInvoiceNumber - firstInvoiceNumber
      );
    }

    if (sortMode === "newest_invoice") {
      return (
        recordTime(second.created_at) - recordTime(first.created_at) ||
        secondInvoiceNumber - firstInvoiceNumber
      );
    }

    if (sortMode === "highest_balance") {
      return (
        secondBalance - firstBalance ||
        firstRank - secondRank ||
        firstInvoiceNumber - secondInvoiceNumber
      );
    }

    if (sortMode === "invoice_number") {
      return firstInvoiceNumber - secondInvoiceNumber;
    }

    return (
      firstRank - secondRank ||
      (firstDueTime || Number.MAX_SAFE_INTEGER) -
        (secondDueTime || Number.MAX_SAFE_INTEGER) ||
      recordTime(second.updated_at ?? second.created_at) -
        recordTime(first.updated_at ?? first.created_at) ||
      recordTime(second.created_at) - recordTime(first.created_at) ||
      parseInvoiceNumber(second.display_id) - parseInvoiceNumber(first.display_id)
    );
  };
}

function detailText(
  details: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = details?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildCorrectionLinks(logs: InvoiceActivityLog[]) {
  const replacementByOriginalId = new Map<
    string,
    { id: string | null; displayId: string | null }
  >();
  const originalByReplacementId = new Map<
    string,
    { id: string | null; displayId: string | null }
  >();

  logs.forEach((log) => {
    if (log.action !== "invoice.superseded" && log.action !== "invoice.corrected_replacement_created") {
      return;
    }

    const originalId =
      detailText(log.details, "originalInvoiceId") ?? log.entity_id;
    const originalDisplayId = detailText(log.details, "originalDisplayId");
    const replacementId = detailText(log.details, "replacementInvoiceId");
    const replacementDisplayId = detailText(log.details, "replacementDisplayId");

    if (originalId && (replacementId || replacementDisplayId)) {
      replacementByOriginalId.set(originalId, {
        id: replacementId,
        displayId: replacementDisplayId,
      });
    }

    if (replacementId && (originalId || originalDisplayId)) {
      originalByReplacementId.set(replacementId, {
        id: originalId,
        displayId: originalDisplayId,
      });
    }
  });

  return { replacementByOriginalId, originalByReplacementId };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
    status?: string;
    view?: string;
    collection?: string;
    limit?: string;
    sort?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const statusFilter = [
    "all",
    "draft",
    "sent",
    "paid",
    "overdue",
    "historical",
  ].includes(resolvedSearchParams.status ?? "")
    ? resolvedSearchParams.status ?? "all"
    : "all";
  const view = ["all", "originals", "splits"].includes(
    resolvedSearchParams.view ?? ""
  )
    ? resolvedSearchParams.view ?? "all"
    : "all";
  const collectionFilter =
    resolvedSearchParams.collection === "open" ? "open" : "";
  const sortMode: InvoiceSortMode = [
    "needs_attention",
    "oldest_due",
    "newest_due",
    "newest_invoice",
    "highest_balance",
    "invoice_number",
  ].includes(resolvedSearchParams.sort ?? "")
    ? (resolvedSearchParams.sort as InvoiceSortMode)
    : "needs_attention";
  const resultLimit = Math.min(
    Math.max(Number(resolvedSearchParams.limit) || 30, 20),
    150
  );
  const activeParams = new URLSearchParams({ business: businessSlug });

  if (searchTerm) activeParams.set("q", searchTerm);
  if (statusFilter !== "all") activeParams.set("status", statusFilter);
  if (view !== "all") activeParams.set("view", view);
  if (collectionFilter) activeParams.set("collection", collectionFilter);
  if (sortMode !== "needs_attention") activeParams.set("sort", sortMode);

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();
  const business = businessData as Business | null;
  const loadIssues: string[] = [];

  if (businessError) {
    loadIssues.push("Workspace details could not be loaded.");
  }

  let invoices: Invoice[] = [];
  let invoiceLogs: InvoiceActivityLog[] = [];
  let lineItems: InvoiceLineItem[] = [];

  if (business?.id) {
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, client_id, display_id, customer_name, project_title, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, issue_date, due_date, notes, updated_at, created_at, split_parent_invoice_id, split_sequence, split_count"
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (invoiceError) {
      loadIssues.push("Invoices could not be loaded.");
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
        loadIssues.push("Invoice line-item readiness could not be loaded.");
      } else {
        lineItems = (lineItemData ?? []) as InvoiceLineItem[];
      }

      const { data: logData } = await supabase
        .from("activity_logs")
        .select("action, entity_id, details")
        .eq("business_id", business.id)
        .eq("entity_type", "invoice")
        .in("action", [
          "invoice.superseded",
          "invoice.corrected_replacement_created",
        ])
        .limit(500);

      invoiceLogs = (logData ?? []) as InvoiceActivityLog[];
    }
  }

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const splitChildrenByParentId = new Map<string, number>();

  invoices.forEach((invoice) => {
    if (!invoice.split_parent_invoice_id) {
      return;
    }

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
  const { replacementByOriginalId, originalByReplacementId } =
    buildCorrectionLinks(invoiceLogs);
  const todayKey = businessDateKey();
  const invoicesWithSplitInfo: InvoiceWithSplitInfo[] = invoices.map((invoice) => ({
    ...invoice,
    split_children_count: splitChildrenByParentId.get(invoice.id) ?? 0,
    split_parent_display_id: invoice.split_parent_invoice_id
      ? invoiceById.get(invoice.split_parent_invoice_id)?.display_id ?? null
      : null,
  }));
  const filteredInvoices = invoicesWithSplitInfo
    .filter((invoice) => {
      const status = invoiceStatusKey(invoice.status);
      const searchableText = [
        invoice.display_id,
        invoice.project_title,
        invoice.customer_name,
        invoice.status,
        invoice.split_parent_display_id,
      ]
        .join(" ")
        .toLowerCase();

      if (searchTerm && !searchableText.includes(searchTerm.toLowerCase())) {
        return false;
      }

      if (view === "originals" && invoice.split_parent_invoice_id) {
        return false;
      }

      if (view === "splits" && !invoice.split_parent_invoice_id) {
        return false;
      }

      if (
        collectionFilter === "open" &&
        !isPaymentEligibleInvoice({
          invoice,
          lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
        })
      ) {
        return false;
      }

      if (statusFilter === "overdue") {
        return isOverdueCollectibleInvoice({
          invoice,
          lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
          todayKey,
        });
      }

      if (statusFilter === "historical") {
        return Boolean(nonCollectibleInvoiceLabel(invoice.status));
      }

      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      return true;
    })
    .sort(
      compareInvoices(
        lineItemsByInvoiceId,
        statusFilter === "overdue" && sortMode === "needs_attention"
          ? "oldest_due"
          : sortMode,
        todayKey
      )
    );
  const visibleInvoices = filteredInvoices.slice(0, resultLimit);
  const nextLimitParams = new URLSearchParams(activeParams);
  nextLimitParams.set("limit", String(resultLimit + 30));

  return (
    <AppShell>
      <InvoiceResultsScroller />
      <div className="invoice-dashboard space-y-5 pb-32 sm:space-y-6">
        <div className="invoice-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>
            <h1 className="mt-2 text-4xl font-bold leading-tight">Invoices</h1>
          </div>

          <div className="invoice-page-actions flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={`/recurring-invoices${businessQuery}`}>
              <Button variant="secondary" className="w-full sm:w-auto">
                Recurring Invoices
              </Button>
            </Link>
            <Link href={`/invoices/new${businessQuery}`}>
              <Button className="w-full sm:w-auto">New Invoice</Button>
            </Link>
          </div>
        </div>

        <InvoiceWorkspaceNav businessSlug={businessSlug} active="invoices" />

        {loadIssues.length > 0 ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Invoice notice
            </p>
            <div className="mt-2 space-y-1 text-sm leading-6 text-amber-100/90">
              {loadIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="border-zinc-800 bg-zinc-950/70">
          <form
            action="/invoices"
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_145px_170px_auto]"
          >
            <input type="hidden" name="business" value={businessSlug} />
            <label className="grid gap-2 text-sm font-semibold text-zinc-200">
              Search
              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Invoice, customer, unit, project"
                className="rounded-xl border border-zinc-700 bg-black/40 px-4 py-3 text-white outline-none focus:border-orange-400"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-200">
              Status
              <select
                name="status"
                defaultValue={statusFilter}
                className="rounded-xl border border-zinc-700 bg-black/40 px-4 py-3 text-white outline-none focus:border-orange-400"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="historical">Historical</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-200">
              Type
              <select
                name="view"
                defaultValue={view}
                className="rounded-xl border border-zinc-700 bg-black/40 px-4 py-3 text-white outline-none focus:border-orange-400"
              >
                <option value="all">All</option>
                <option value="originals">Originals</option>
                <option value="splits">Splits</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-200">
              Sort
              <select
                name="sort"
                defaultValue={sortMode}
                className="rounded-xl border border-zinc-700 bg-black/40 px-4 py-3 text-white outline-none focus:border-orange-400"
              >
                <option value="needs_attention">Needs Attention</option>
                <option value="oldest_due">Oldest Due</option>
                <option value="newest_due">Newest Due</option>
                <option value="newest_invoice">Newest Invoice</option>
                <option value="highest_balance">Highest Balance</option>
                <option value="invoice_number">Invoice Number</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Filter
              </Button>
            </div>
          </form>
        </Card>

        <Card id="invoice-results-list" className="scroll-mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Results
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {filteredInvoices.length} invoice
                {filteredInvoices.length === 1 ? "" : "s"}
              </h2>
            </div>

            {searchTerm ||
            statusFilter !== "all" ||
            view !== "all" ||
            collectionFilter ? (
              <InvoiceFilterLink
                href={`/invoices${businessQuery}`}
                className="w-full sm:w-auto"
              >
                <Button variant="secondary">Clear Filters</Button>
              </InvoiceFilterLink>
            ) : null}
          </div>

          {visibleInvoices.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/70 p-5">
              <p className="text-lg font-black text-white">
                No invoices match this view
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {visibleInvoices.map((invoice) => {
                const itemLines = lineItemsByInvoiceId.get(invoice.id) ?? [];
                const amountDue = invoiceCollectionAmountDue(invoice);
                const overdueDays = invoiceDaysPastDue({
                  dueDate: invoice.due_date,
                  todayKey,
                });
                const nonCollectibleLabel = nonCollectibleInvoiceLabel(
                  invoice.status
                );
                const paymentEligible = isPaymentEligibleInvoice({
                  invoice,
                  lineItems: itemLines,
                });
                const paymentReason = invoicePaymentIneligibleReason({
                  invoice,
                  lineItems: itemLines,
                });
                const incompleteDraft = isIncompleteDraftInvoice({
                  invoice,
                  lineItems: itemLines,
                });
                const splitSource = isSplitSourceInvoice(invoice);
                const overdue =
                  overdueDays !== null &&
                  overdueDays > 0 &&
                  isOverdueCollectibleInvoice({
                    invoice,
                    lineItems: itemLines,
                    todayKey,
                  });
                const replacement = replacementByOriginalId.get(invoice.id);
                const original = originalByReplacementId.get(invoice.id);

                return (
                  <div
                    key={invoice.id}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-orange-300">
                            {invoice.display_id ?? "Invoice"}
                          </p>
                          <StatusBadge status={invoice.status || "Draft"} />
                          {nonCollectibleLabel ? (
                            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-black text-zinc-300">
                              {nonCollectibleLabel}
                            </span>
                          ) : null}
                          {incompleteDraft ? (
                            <span className="rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-100">
                              Draft incomplete
                            </span>
                          ) : null}
                          {overdue ? (
                            <span className="rounded-full border border-rose-300/40 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100">
                              Overdue by {overdueDays} day
                              {overdueDays === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-2 break-words text-xl font-black text-white">
                          {invoice.project_title || "Untitled Invoice"}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          {invoice.customer_name || "Unknown Customer"}
                        </p>
                        {replacement?.displayId ? (
                          <p className="mt-2 text-sm font-semibold text-amber-100">
                            Replaced by {replacement.displayId}
                          </p>
                        ) : null}
                        {original?.displayId ? (
                          <p className="mt-2 text-sm font-semibold text-sky-100">
                            Replacement for {original.displayId}
                          </p>
                        ) : null}
                      </div>

                      <div className="sm:text-right">
                        <p className="text-xl font-black text-emerald-200">
                          {splitSource
                            ? "Split Source"
                            : nonCollectibleLabel
                              ? "Non-collectible"
                              : incompleteDraft
                                ? "Draft incomplete"
                                : formatMoney(amountDue)}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                          {paymentReason ?? formatDate(invoice.due_date)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4 sm:flex-row sm:flex-wrap">
                      <Link
                        href={`/invoices/${invoice.id}${businessQuery}`}
                        className="rounded-full bg-sky-600 px-4 py-2 text-center text-sm font-black text-white transition hover:bg-sky-700"
                      >
                        Open
                      </Link>
                      {invoiceStatusKey(invoice.status) === "draft" ? (
                        <Link
                          href={`/invoices/${invoice.id}/edit${businessQuery}`}
                          className="rounded-full border border-zinc-700 px-4 py-2 text-center text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
                        >
                          Edit
                        </Link>
                      ) : null}
                      <Link
                        href={`/invoices/${invoice.id}/print${businessQuery}`}
                        className="rounded-full border border-zinc-700 px-4 py-2 text-center text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
                      >
                        Print
                      </Link>
                      {paymentEligible ? (
                        <Link
                          href={`/payments?${new URLSearchParams({
                            business: businessSlug,
                            customer: invoice.customer_name ?? "",
                          }).toString()}#batch-payment-tool`}
                          className="payment-action-button rounded-full border px-4 py-2 text-center text-sm font-semibold transition"
                        >
                          Record Payment
                        </Link>
                      ) : null}
                      {replacement?.id ? (
                        <Link
                          href={`/invoices/${replacement.id}${businessQuery}`}
                          className="rounded-full border border-amber-300/50 px-4 py-2 text-center text-sm font-semibold text-amber-100 transition hover:bg-amber-500/10"
                        >
                          View Replacement
                        </Link>
                      ) : null}
                      {splitSource ? (
                        <InvoiceFilterLink
                          href={`/invoices?${new URLSearchParams({
                            business: businessSlug,
                            view: "splits",
                            q: invoice.display_id ?? "",
                          }).toString()}#invoice-results-list`}
                          className="rounded-full border border-amber-300/50 px-4 py-2 text-center text-sm font-semibold text-amber-100 transition hover:bg-amber-500/10"
                        >
                          View Split Invoices
                        </InvoiceFilterLink>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredInvoices.length > visibleInvoices.length ? (
            <div className="mt-5 flex justify-center">
              <InvoiceFilterLink
                href={`/invoices?${nextLimitParams.toString()}#invoice-results-list`}
                className="w-full sm:w-auto"
              >
                <Button variant="secondary">
                  Load More ({filteredInvoices.length - visibleInvoices.length} left)
                </Button>
              </InvoiceFilterLink>
            </div>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
