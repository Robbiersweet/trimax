import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import InvoiceBulkPaymentActions from "../components/InvoiceBulkPaymentActions";
import InvoiceFilterLink from "../components/InvoiceFilterLink";
import InvoiceResultsScroller from "../components/InvoiceResultsScroller";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "../lib/supabase";

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
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  updated_at: string | null;
  created_at: string | null;
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
};

type BaseInvoice = Omit<
  Invoice,
  | "updated_at"
  | "split_parent_invoice_id"
  | "split_sequence"
  | "split_count"
>;

type InvoiceWithSplitInfo = Invoice & {
  split_children_count: number;
  split_parent_display_id: string | null;
};

type InvoiceActivityLog = {
  id: string;
  action: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

type InvoiceFilterIconName =
  | "all"
  | "originals"
  | "splits"
  | "aging"
  | "draft"
  | "sent"
  | "paid"
  | "overdue";

function InvoiceFilterIcon({ icon }: { icon: InvoiceFilterIconName }) {
  const iconProps = {
    className: "h-4 w-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "all":
      return (
        <svg {...iconProps}>
          <path d="M4 5h16" />
          <path d="M4 12h16" />
          <path d="M4 19h16" />
        </svg>
      );
    case "originals":
      return (
        <svg {...iconProps}>
          <path d="M7 3h8l4 4v14H7Z" />
          <path d="M15 3v5h5" />
          <path d="M10 13h6" />
          <path d="M10 17h4" />
        </svg>
      );
    case "splits":
      return (
        <svg {...iconProps}>
          <path d="M5 4h7v7H5Z" />
          <path d="M12 13h7v7h-7Z" />
          <path d="M12 7h3a4 4 0 0 1 4 4v2" />
          <path d="M12 17H9a4 4 0 0 1-4-4v-2" />
        </svg>
      );
    case "aging":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "draft":
      return (
        <svg {...iconProps}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
          <path d="M14 3v6h6" />
          <path d="M8 17h5" />
        </svg>
      );
    case "sent":
      return (
        <svg {...iconProps}>
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      );
    case "paid":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.25 2.25L16 9.5" />
        </svg>
      );
    case "overdue":
      return (
        <svg {...iconProps}>
          <path d="M10.3 4.1 2.7 17.3A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.7L13.7 4.1a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
  }
}

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null) {
  const parsed = parseMoney(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatDate(value: string | null) {
  if (!value) {
    return "No Due Date";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(date);
}

function invoiceDaysPastDue(value: string | null) {
  if (!value) {
    return null;
  }

  const dueDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor(
    (today.getTime() - dueDate.getTime()) / 86_400_000
  );
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

function invoiceStatusKey(value: string | null) {
  return (value || "Draft").trim().toLowerCase();
}

function isCollectibleInvoiceStatus(value: string | null) {
  const status = invoiceStatusKey(value);

  return status !== "paid" && status !== "draft";
}

function dateYear(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
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

function parseInvoiceNumber(displayId: string | null) {
  const match = (displayId ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function businessDateTime(value: string | null) {
  if (!value) {
    return 0;
  }

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function recordDateTime(value: string | null) {
  if (!value) {
    return 0;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function compareInvoicesByBusinessOrder(
  first: InvoiceWithSplitInfo,
  second: InvoiceWithSplitInfo
) {
  const dateDifference =
    businessDateTime(second.issue_date) -
    businessDateTime(first.issue_date);

  if (dateDifference !== 0) {
    return dateDifference;
  }

  const numberDifference =
    parseInvoiceNumber(second.display_id) -
    parseInvoiceNumber(first.display_id);

  if (numberDifference !== 0) {
    return numberDifference;
  }

  return (
    recordDateTime(second.created_at) - recordDateTime(first.created_at)
  );
}

function matchesStatusFilter({
  statusFilter,
  invoiceStatus,
  amountDue,
  daysLate,
}: {
  statusFilter: string;
  invoiceStatus: string | null;
  amountDue: number;
  daysLate: number | null;
}) {
  if (statusFilter === "all") {
    return true;
  }

  if (statusFilter === "overdue") {
    return (
      amountDue > 0 &&
      isCollectibleInvoiceStatus(invoiceStatus) &&
      (daysLate ?? -1) >= 0
    );
  }

  return invoiceStatusKey(invoiceStatus) === statusFilter;
}

function invoiceReadinessSignals(invoice: InvoiceWithSplitInfo) {
  const signals: string[] = [];
  const status = invoiceStatusKey(invoice.status);

  if (!invoice.customer_name?.trim()) {
    signals.push("Needs customer");
  }

  if (!invoice.project_title?.trim()) {
    signals.push("Needs project");
  }

  if (!invoice.due_date && status !== "paid") {
    signals.push("Needs due date");
  }

  if (parseMoney(invoice.invoice_amount) <= 0) {
    signals.push("Needs amount");
  }

  if (hasActiveDepositRequest(invoice)) {
    signals.push("Deposit requested");
  }

  if (invoice.split_parent_invoice_id) {
    signals.push("Split child");
  }

  if (invoice.split_children_count > 0) {
    signals.push("Split source");
  }

  return signals;
}

function invoiceCollectionStage({
  amountDue,
  daysLate,
  invoice,
}: {
  amountDue: number;
  daysLate: number | null;
  invoice: InvoiceWithSplitInfo;
}) {
  const status = invoiceStatusKey(invoice.status);

  if (invoice.split_children_count > 0) {
    return {
      label: "Split source",
      detail: "Collect from the split invoices.",
      tone: "amber",
    };
  }

  if (status === "paid" || amountDue <= 0) {
    return {
      label: "Closed",
      detail: "No balance due.",
      tone: "emerald",
    };
  }

  if (status === "draft") {
    return {
      label: "Draft",
      detail: "Review and send before collection.",
      tone: "amber",
    };
  }

  if (daysLate !== null && daysLate >= 30) {
    return {
      label: "Urgent follow-up",
      detail: `${daysLate} day${daysLate === 1 ? "" : "s"} late.`,
      tone: "rose",
    };
  }

  if (daysLate !== null && daysLate >= 0) {
    return {
      label: "Reminder ready",
      detail: `${daysLate} day${daysLate === 1 ? "" : "s"} past due.`,
      tone: "rose",
    };
  }

  if (daysLate !== null && daysLate >= -7) {
    return {
      label: "Due soon",
      detail: `Due in ${Math.abs(daysLate)} day${
        Math.abs(daysLate) === 1 ? "" : "s"
      }.`,
      tone: "orange",
    };
  }

  return {
    label: "On track",
    detail: "No immediate collection pressure.",
    tone: "zinc",
  };
}

function hasInvoicePdfProof(log: InvoiceActivityLog) {
  return (
    (log.action === "invoice.email_sent" ||
      log.action === "invoice.payment_reminder_sent") &&
    log.details?.pdf_attached === true
  );
}

function hasInvoicePaymentProof(log: InvoiceActivityLog) {
  return (
    log.action.includes("payment") &&
    (Boolean(log.details?.paymentAttachmentId) ||
      Boolean(log.details?.paymentImagePath) ||
      Boolean(log.details?.paymentImageFileName))
  );
}

function invoiceCollectionPriorityScore({
  amountDue,
  daysLate,
  invoice,
  proofMissing,
}: {
  amountDue: number;
  daysLate: number | null;
  invoice: InvoiceWithSplitInfo;
  proofMissing: boolean;
}) {
  let score = 0;

  if (amountDue > 0) {
    score += Math.min(35, Math.ceil(amountDue / 250));
  }

  if (daysLate !== null && daysLate >= 60) {
    score += 35;
  } else if (daysLate !== null && daysLate >= 30) {
    score += 28;
  } else if (daysLate !== null && daysLate >= 0) {
    score += 20;
  } else if (daysLate !== null && daysLate >= -7) {
    score += 10;
  }

  if (hasActiveDepositRequest(invoice)) {
    score += 12;
  }

  if (proofMissing && amountDue > 0) {
    score += 10;
  }

  if (invoiceStatusKey(invoice.status) === "sent") {
    score += 5;
  }

  return Math.min(score, 100);
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
    status?: string;
    view?: string;
    customer?: string;
    collection?: string;
    year?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const searchTerm = resolvedSearchParams.q?.trim() ?? "";
  const customerFilter = resolvedSearchParams.customer?.trim() ?? "";
  const collectionFilter =
    resolvedSearchParams.collection === "open" ? "open" : "";
  const workingYear = new Date().getFullYear();
  const requestedYear = Number(resolvedSearchParams.year);
  const yearFilter =
    Number.isInteger(requestedYear) && requestedYear > 2000
      ? requestedYear
      : null;
  const statusFilter =
    resolvedSearchParams.status === "draft" ||
    resolvedSearchParams.status === "sent" ||
    resolvedSearchParams.status === "paid" ||
    resolvedSearchParams.status === "overdue"
      ? resolvedSearchParams.status
      : "all";
  const view =
    resolvedSearchParams.view === "originals" ||
    resolvedSearchParams.view === "splits" ||
    resolvedSearchParams.view === "aging"
      ? resolvedSearchParams.view
      : "all";
  const businessQuery = `?business=${businessSlug}`;

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const businessLoadMessage = businessError
    ? "Workspace details could not be loaded. Try signing in again, then reopen this workspace."
    : null;

  if (businessError) {
    console.warn("Workspace lookup failed:", businessError.message);
  }

  const selectedBusiness = businessData as Business | null;

  let invoices: Invoice[] = [];
  let invoicesWithSplitInfo: InvoiceWithSplitInfo[] = [];
  let invoiceActivityLogs: InvoiceActivityLog[] = [];
  let invoiceLoadMessage: string | null = businessLoadMessage;

  if (selectedBusiness?.id) {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, display_id, customer_name, project_title, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, issue_date, due_date, notes, updated_at, created_at, split_parent_invoice_id, split_sequence, split_count"
      )
      .eq("business_id", selectedBusiness.id)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("display_id", { ascending: false, nullsFirst: false });

    if (error) {
      console.warn("Invoice load with split metadata failed:", error.message);

      const { data: fallbackData, error: fallbackError } = await supabase
        .from("invoices")
        .select(
          "id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, issue_date, due_date, notes, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .order("display_id", { ascending: false, nullsFirst: false });

      if (fallbackError) {
        console.warn("Invoice load failed:", fallbackError.message);
        invoiceLoadMessage =
          "Invoices could not be loaded. Try signing in again; if this stays here, the invoice access settings need attention.";
      } else {
        invoiceLoadMessage =
          "Invoices are shown without split-invoice grouping because split details are not available yet.";
        invoices = ((fallbackData ?? []) as BaseInvoice[]).map(
          (invoice) => ({
            ...invoice,
            updated_at: null,
            split_parent_invoice_id: null,
            split_sequence: null,
            split_count: null,
          })
        );
      }
    } else {
      invoices = (data ?? []) as Invoice[];
    }

    const invoiceById = new Map(
      invoices.map((invoice) => [invoice.id, invoice])
    );

    const splitChildrenByParentId = new Map<string, number>();

    invoices.forEach((invoice) => {
      if (!invoice.split_parent_invoice_id) {
        return;
      }

      splitChildrenByParentId.set(
        invoice.split_parent_invoice_id,
        (splitChildrenByParentId.get(
          invoice.split_parent_invoice_id
        ) ?? 0) + 1
      );
    });

    invoicesWithSplitInfo = invoices
      .map((invoice) => ({
        ...invoice,
        split_children_count:
          splitChildrenByParentId.get(invoice.id) ?? 0,
        split_parent_display_id: invoice.split_parent_invoice_id
          ? invoiceById.get(invoice.split_parent_invoice_id)
              ?.display_id ?? null
          : null,
      }))
      .filter((invoice) => {
        if (view === "originals") {
          return !invoice.split_parent_invoice_id;
        }

        if (view === "splits") {
          return Boolean(invoice.split_parent_invoice_id);
        }

        return true;
      });

    const { data: activityData, error: activityError } = await supabase
      .from("activity_logs")
      .select("id, action, entity_id, details, created_at")
      .eq("business_id", selectedBusiness.id)
      .eq("entity_type", "invoice")
      .order("created_at", { ascending: false })
      .limit(750);

    if (activityError) {
      console.warn("Invoice proof activity load failed:", activityError.message);
    } else {
      invoiceActivityLogs = (activityData ?? []) as InvoiceActivityLog[];
    }
  }

  const activeParams = new URLSearchParams({
    business: businessSlug,
  });

  if (searchTerm) {
    activeParams.set("q", searchTerm);
  }

  if (customerFilter) {
    activeParams.set("customer", customerFilter);
  }

  if (collectionFilter) {
    activeParams.set("collection", collectionFilter);
  }

  if (yearFilter) {
    activeParams.set("year", String(yearFilter));
  }

  if (statusFilter !== "all") {
    activeParams.set("status", statusFilter);
  }

  const invoiceResultsAnchor = "#invoice-results-list";

  if (view !== "all") {
    activeParams.set("view", view);
  }

  const filteredInvoices = invoicesWithSplitInfo
    .filter((invoice) => {
      const amountDue = invoiceCollectionAmountDue(invoice);
      const daysLate = invoiceDaysPastDue(invoice.due_date);
      const collectibleOnly = collectionFilter === "open";
      const searchableText = [
        invoice.display_id,
        invoice.project_title,
        invoice.customer_name,
        invoice.status,
        invoice.split_parent_display_id,
      ]
        .join(" ")
        .toLowerCase();

      if (
        customerFilter &&
        (invoice.customer_name ?? "Unknown Customer").toLowerCase() !==
          customerFilter.toLowerCase()
      ) {
        return false;
      }

      if (yearFilter && !invoiceBelongsToYear(invoice, yearFilter)) {
        return false;
      }

      if (
        collectibleOnly &&
        (!isCollectibleInvoiceStatus(invoice.status) || amountDue <= 0)
      ) {
        return false;
      }

      if (
        searchTerm &&
        !searchableText.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      if (view === "aging") {
        return (
          amountDue > 0 &&
          (daysLate ?? -1) >= 0 &&
          matchesStatusFilter({
            statusFilter,
            invoiceStatus: invoice.status,
            amountDue,
            daysLate,
          })
        );
      }

      if (
        !matchesStatusFilter({
          statusFilter,
          invoiceStatus: invoice.status,
          amountDue,
          daysLate,
        })
      ) {
        return false;
      }

      return true;
    })
    .sort(compareInvoicesByBusinessOrder);

  const billableInvoicesWithSplitInfo = invoicesWithSplitInfo.filter(
    (invoice) => invoice.split_children_count === 0
  );

  const openInvoicesWithAmounts = billableInvoicesWithSplitInfo
    .map((invoice) => {
      return {
        ...invoice,
        amountDue: invoiceCollectionAmountDue(invoice),
        daysLate: invoiceDaysPastDue(invoice.due_date),
      };
    })
    .filter(
      (invoice) =>
        invoice.amountDue > 0 &&
        isCollectibleInvoiceStatus(invoice.status)
    );

  const currentYearOpenInvoicesWithAmounts = openInvoicesWithAmounts;
  const historicalOpenInvoicesWithAmounts =
    openInvoicesWithAmounts.filter(
      (invoice) => !invoiceBelongsToYear(invoice, workingYear)
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
    const bucketInvoices = currentYearOpenInvoicesWithAmounts.filter((invoice) => {
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

  const openBalanceTotal = currentYearOpenInvoicesWithAmounts.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const overdueInvoices = currentYearOpenInvoicesWithAmounts.filter(
    (invoice) => (invoice.daysLate ?? -1) >= 0
  );
  const overdueBalanceTotal = overdueInvoices
    .reduce((total, invoice) => total + invoice.amountDue, 0);
  const oldestOverdueInvoice = [...overdueInvoices].sort(
    (first, second) => (second.daysLate ?? 0) - (first.daysLate ?? 0)
  )[0];
  const depositRequestInvoices = currentYearOpenInvoicesWithAmounts.filter(
    (invoice) => hasActiveDepositRequest(invoice)
  );
  const depositRequestTotal = depositRequestInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const soonDueInvoices = currentYearOpenInvoicesWithAmounts.filter(
    (invoice) =>
      invoice.daysLate !== null &&
      invoice.daysLate < 0 &&
      invoice.daysLate >= -7
  );
  const soonDueBalanceTotal = soonDueInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const largestOpenInvoice = [...currentYearOpenInvoicesWithAmounts].sort(
    (first, second) => second.amountDue - first.amountDue
  )[0];
  const missingDueDateInvoices = billableInvoicesWithSplitInfo.filter(
    (invoice) =>
      invoiceStatusKey(invoice.status) !== "paid" &&
      !invoice.due_date &&
      parseMoney(invoice.invoice_amount) > parseMoney(invoice.amount_paid)
  );
  const missingCustomerInvoices = billableInvoicesWithSplitInfo.filter(
    (invoice) => !invoice.customer_name?.trim()
  );
  const missingProjectInvoices = billableInvoicesWithSplitInfo.filter(
    (invoice) => !invoice.project_title?.trim()
  );
  const invoiceReadinessIssueCount =
    missingDueDateInvoices.length +
    missingCustomerInvoices.length +
    missingProjectInvoices.length;
  const invoiceReadinessScore = billableInvoicesWithSplitInfo.length
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            100 -
              missingDueDateInvoices.length * 8 -
              missingCustomerInvoices.length * 10 -
              missingProjectInvoices.length * 5
          )
        )
      )
    : 100;
  const urgentFollowUpInvoices = overdueInvoices.filter(
    (invoice) => (invoice.daysLate ?? 0) >= 30
  );
  const draftBalanceTotal = billableInvoicesWithSplitInfo
    .filter(
      (invoice) => (invoice.status || "Draft").toLowerCase() === "draft"
    )
    .reduce(
      (total, invoice) =>
        total +
        Math.max(
          parseMoney(invoice.invoice_amount) -
            parseMoney(invoice.amount_paid),
          0
        ),
      0
    );
  const agingVisualMax = Math.max(
    ...agingBuckets.map((bucket) => bucket.amount),
    1
  );

  const customerBalanceRows = Array.from(
    currentYearOpenInvoicesWithAmounts.reduce(
      (customers, invoice) => {
        const customerName =
          invoice.customer_name?.trim() || "Unknown Customer";
        const existing = customers.get(customerName) ?? {
          customerName,
          invoiceCount: 0,
          amountDue: 0,
          oldestDaysLate: null as number | null,
        };

        existing.invoiceCount += 1;
        existing.amountDue += invoice.amountDue;

        if (
          invoice.daysLate !== null &&
          invoice.daysLate >= 0 &&
          (existing.oldestDaysLate === null ||
            invoice.daysLate > existing.oldestDaysLate)
        ) {
          existing.oldestDaysLate = invoice.daysLate;
        }

        customers.set(customerName, existing);

        return customers;
      },
      new Map<
        string,
        {
          customerName: string;
          invoiceCount: number;
          amountDue: number;
          oldestDaysLate: number | null;
        }
      >()
    ).values()
  )
    .sort((first, second) => second.amountDue - first.amountDue)
    .slice(0, 6);

  const recentlyUpdatedInvoices = [...billableInvoicesWithSplitInfo]
    .sort((first, second) => {
      const firstTime = new Date(
        first.updated_at ?? first.created_at ?? "1970-01-01"
      ).getTime();
      const secondTime = new Date(
        second.updated_at ?? second.created_at ?? "1970-01-01"
      ).getTime();

      return secondTime - firstTime;
    })
    .slice(0, 5);
  const draftsToSend = billableInvoicesWithSplitInfo
    .filter(
      (invoice) =>
        (invoice.status || "Draft").toLowerCase() === "draft" &&
        (invoice.notes || "")
          .toLowerCase()
          .includes("recurring draft prepared by trimax")
    )
    .slice(0, 6);
  const batchPaymentCustomerCount = customerBalanceRows.filter(
    (customer) => customer.invoiceCount > 1
  ).length;
  const topCustomerBalance = customerBalanceRows[0] ?? null;
  const customerRadarCards = [
    {
      label: "Top Balance",
      value: topCustomerBalance
        ? formatMoney(topCustomerBalance.amountDue)
        : "$0.00",
      detail: topCustomerBalance
        ? `${topCustomerBalance.customerName} / ${topCustomerBalance.invoiceCount} open invoice${
            topCustomerBalance.invoiceCount === 1 ? "" : "s"
          }`
        : "No customer balance pressure",
      href: topCustomerBalance
        ? `/payments?${new URLSearchParams({
            business: businessSlug,
            customer: topCustomerBalance.customerName,
          }).toString()}#batch-payment-tool`
        : `/payments${businessQuery}#batch-payment-tool`,
      tone: topCustomerBalance ? "emerald" : "zinc",
    },
    {
      label: "Multi-Invoice",
      value: String(batchPaymentCustomerCount),
      detail: "Customers where one check may cover several invoices",
      href: "#customer-collection-radar",
      tone: batchPaymentCustomerCount > 0 ? "sky" : "zinc",
    },
    {
      label: "Late Customers",
      value: String(
        customerBalanceRows.filter(
          (customer) => customer.oldestDaysLate !== null
        ).length
      ),
      detail: "Customer groups with at least one past-due invoice",
      href: `/invoices${businessQuery}&view=aging${invoiceResultsAnchor}`,
      tone: overdueInvoices.length > 0 ? "rose" : "zinc",
    },
  ];
  const nextMoneyMoves = [
    {
      label: "Reminder Queue",
      title:
        overdueInvoices.length > 0
          ? "Send the oldest late reminder"
          : "No overdue reminders due",
      metric: formatMoney(overdueBalanceTotal),
      detail:
        overdueInvoices.length > 0
          ? `${overdueInvoices.length} overdue invoice${
              overdueInvoices.length === 1 ? "" : "s"
            } need follow-up.`
          : soonDueInvoices.length > 0
            ? `${soonDueInvoices.length} invoice${
                soonDueInvoices.length === 1 ? "" : "s"
              } due in the next 7 days.`
            : "No late invoice pressure right now.",
      href: oldestOverdueInvoice
        ? `/invoices/${oldestOverdueInvoice.id}${businessQuery}#late-payment-reminder`
        : `/invoices${businessQuery}&view=aging${invoiceResultsAnchor}`,
      action: overdueInvoices.length > 0 ? "Send Reminder" : "Review Aging",
      tone: "danger",
    },
    {
      label: "Deposits",
      title:
        depositRequestInvoices.length > 0
          ? "Collect active deposits"
          : "No deposits waiting",
      metric: formatMoney(depositRequestTotal),
      detail:
        depositRequestInvoices.length > 0
          ? `${depositRequestInvoices.length} active deposit request${
              depositRequestInvoices.length === 1 ? "" : "s"
            } can be applied before final collection.`
          : "Deposit requests will appear here once created.",
      href: `/payments${businessQuery}#batch-payment-tool`,
      action: "Open Payments",
      tone: "success",
    },
    {
      label: "Drafts",
      title:
        draftsToSend.length > 0
          ? "Review prepared drafts"
          : "Draft balance is visible",
      metric: formatMoney(draftBalanceTotal),
      detail:
        draftsToSend.length > 0
          ? `${draftsToSend.length} recurring draft${
              draftsToSend.length === 1 ? "" : "s"
            } may be ready to send.`
          : "Draft invoices stay out of collection totals until sent.",
      href: `/recurring-invoices${businessQuery}`,
      action: "Open Drafts",
      tone: "warning",
    },
    {
      label: "Batch Checks",
      title:
        batchPaymentCustomerCount > 0
          ? "Group invoices by check"
          : "Batch workspace ready",
      metric: String(batchPaymentCustomerCount),
      detail:
        batchPaymentCustomerCount > 0
          ? `${batchPaymentCustomerCount} customer${
              batchPaymentCustomerCount === 1 ? "" : "s"
            } have multiple open invoices.`
          : "Use this when one check covers several invoices.",
      href: `/payments${businessQuery}#batch-payment-tool`,
      action: "Record Check",
      tone: "info",
    },
  ];
  const invoiceIntelligenceCards = [
    {
      label: "Readiness",
      value: `${invoiceReadinessScore}%`,
      detail:
        invoiceReadinessIssueCount > 0
          ? `${invoiceReadinessIssueCount} data signal${
              invoiceReadinessIssueCount === 1 ? "" : "s"
            } to tighten before reporting.`
          : "Invoice records are clean enough for reporting.",
      href: missingDueDateInvoices.length > 0
        ? `/invoices${businessQuery}&collection=open${invoiceResultsAnchor}`
        : `/invoices${businessQuery}${invoiceResultsAnchor}`,
      tone: invoiceReadinessIssueCount > 0 ? "amber" : "emerald",
    },
    {
      label: "Due This Week",
      value: formatMoney(soonDueBalanceTotal),
      detail: `${soonDueInvoices.length} invoice${
        soonDueInvoices.length === 1 ? "" : "s"
      } due in the next 7 days.`,
      href: `/invoices${businessQuery}&collection=open${invoiceResultsAnchor}`,
      tone: soonDueInvoices.length > 0 ? "orange" : "zinc",
    },
    {
      label: "Urgent Late",
      value: String(urgentFollowUpInvoices.length),
      detail: "Past-due invoices aged 30+ days.",
      href: `/invoices${businessQuery}&view=aging${invoiceResultsAnchor}`,
      tone: urgentFollowUpInvoices.length > 0 ? "rose" : "zinc",
    },
    {
      label: "Largest Open",
      value: largestOpenInvoice ? formatMoney(largestOpenInvoice.amountDue) : "$0.00",
      detail: largestOpenInvoice
        ? `${largestOpenInvoice.display_id ?? "Invoice"} / ${
            largestOpenInvoice.customer_name ?? "Unknown Customer"
          }`
        : "No open invoice balance.",
      href: largestOpenInvoice
        ? `/invoices/${largestOpenInvoice.id}${businessQuery}`
        : `/invoices${businessQuery}${invoiceResultsAnchor}`,
      tone: largestOpenInvoice ? "emerald" : "zinc",
    },
  ];
  const invoiceCleanupSteps = [
    {
      label: "Missing due dates",
      value: missingDueDateInvoices.length,
      detail: "Unpaid invoices without a due date cannot age cleanly.",
      href: `/invoices${businessQuery}&collection=open${invoiceResultsAnchor}`,
      complete: missingDueDateInvoices.length === 0,
    },
    {
      label: "Missing customers",
      value: missingCustomerInvoices.length,
      detail: "Customer names drive search, reminders, and batch payments.",
      href: `/invoices${businessQuery}${invoiceResultsAnchor}`,
      complete: missingCustomerInvoices.length === 0,
    },
    {
      label: "Missing projects",
      value: missingProjectInvoices.length,
      detail: "Project titles make invoice lists easier to scan in meetings.",
      href: `/invoices${businessQuery}${invoiceResultsAnchor}`,
      complete: missingProjectInvoices.length === 0,
    },
  ];
  const invoiceActivityById = invoiceActivityLogs.reduce((logsById, log) => {
    if (!log.entity_id) {
      return logsById;
    }

    const existing = logsById.get(log.entity_id) ?? [];
    existing.push(log);
    logsById.set(log.entity_id, existing);

    return logsById;
  }, new Map<string, InvoiceActivityLog[]>());
  const invoiceProofById = new Map(
    invoicesWithSplitInfo.map((invoice) => {
      const logs = invoiceActivityById.get(invoice.id) ?? [];
      const sentLog = logs.find((log) => log.action === "invoice.email_sent");
      const reminderLog = logs.find(
        (log) => log.action === "invoice.payment_reminder_sent"
      );
      const paymentProofLog = logs.find(hasInvoicePaymentProof);
      const pdfProofLog = logs.find(hasInvoicePdfProof);

      return [
        invoice.id,
        {
          sent: Boolean(sentLog),
          reminder: Boolean(reminderLog),
          paymentProof: Boolean(paymentProofLog),
          pdfProof: Boolean(pdfProofLog),
          lastProofDate:
            paymentProofLog?.created_at ??
            reminderLog?.created_at ??
            sentLog?.created_at ??
            null,
        },
      ];
    })
  );
  const invoiceEmailProofCount = Array.from(invoiceProofById.values()).filter(
    (proof) => proof.sent
  ).length;
  const invoiceReminderProofCount = Array.from(invoiceProofById.values()).filter(
    (proof) => proof.reminder
  ).length;
  const invoicePdfProofCount = Array.from(invoiceProofById.values()).filter(
    (proof) => proof.pdfProof
  ).length;
  const invoicePaymentProofCount = Array.from(invoiceProofById.values()).filter(
    (proof) => proof.paymentProof
  ).length;
  const openInvoicesMissingProof = currentYearOpenInvoicesWithAmounts.filter(
    (invoice) => {
      const proof = invoiceProofById.get(invoice.id);

      return !proof?.sent && !proof?.reminder && !proof?.paymentProof;
    }
  );
  const proofRadarCards = [
    {
      label: "Sent Proof",
      value: String(invoiceEmailProofCount),
      detail: "Invoices with email-send activity.",
      href: `/activity?business=${businessSlug}&filter=invoice`,
      tone: invoiceEmailProofCount > 0 ? "emerald" : "zinc",
    },
    {
      label: "Reminder Proof",
      value: String(invoiceReminderProofCount),
      detail: "Late-payment reminders recorded in the audit trail.",
      href: `/activity?business=${businessSlug}&filter=invoice`,
      tone: invoiceReminderProofCount > 0 ? "orange" : "zinc",
    },
    {
      label: "PDF Proof",
      value: String(invoicePdfProofCount),
      detail: "Sent invoice/reminder events with PDF attached.",
      href: `/activity?business=${businessSlug}&filter=invoice`,
      tone: invoicePdfProofCount > 0 ? "emerald" : "zinc",
    },
    {
      label: "Payment Proof",
      value: String(invoicePaymentProofCount),
      detail: "Payment actions with check image or attachment evidence.",
      href: `/activity?business=${businessSlug}&filter=payment`,
      tone: invoicePaymentProofCount > 0 ? "emerald" : "zinc",
    },
    {
      label: "Needs Proof",
      value: String(openInvoicesMissingProof.length),
      detail: "Open invoices without send, reminder, or payment proof yet.",
      href: `/invoices${businessQuery}&collection=open${invoiceResultsAnchor}`,
      tone: openInvoicesMissingProof.length > 0 ? "rose" : "emerald",
    },
  ];
  const collectionPlaybookSteps = [
    {
      step: "01",
      label: "Recover late money",
      value: formatMoney(overdueBalanceTotal),
      detail:
        urgentFollowUpInvoices.length > 0
          ? `${urgentFollowUpInvoices.length} invoice${
              urgentFollowUpInvoices.length === 1 ? "" : "s"
            } are 30+ days late.`
          : overdueInvoices.length > 0
            ? `${overdueInvoices.length} overdue invoice${
                overdueInvoices.length === 1 ? "" : "s"
              } ready for reminder.`
            : "No overdue pressure right now.",
      href: oldestOverdueInvoice
        ? `/invoices/${oldestOverdueInvoice.id}${businessQuery}#late-payment-reminder`
        : `/invoices${businessQuery}&view=aging`,
      action: overdueInvoices.length > 0 ? "Open oldest" : "Review aging",
      tone: overdueInvoices.length > 0 ? "rose" : "zinc",
    },
    {
      step: "02",
      label: "Collect deposits",
      value: formatMoney(depositRequestTotal),
      detail:
        depositRequestInvoices.length > 0
          ? `${depositRequestInvoices.length} active deposit request${
              depositRequestInvoices.length === 1 ? "" : "s"
            } waiting.`
          : "Deposit requests will surface here.",
      href: `/payments${businessQuery}#batch-payment-tool`,
      action: "Open payments",
      tone: depositRequestInvoices.length > 0 ? "emerald" : "zinc",
    },
    {
      step: "03",
      label: "Send ready drafts",
      value: formatMoney(draftBalanceTotal),
      detail:
        draftsToSend.length > 0
          ? `${draftsToSend.length} recurring draft${
              draftsToSend.length === 1 ? "" : "s"
            } need review.`
          : "Draft balance stays separated from collections.",
      href: `/recurring-invoices${businessQuery}`,
      action: "Review drafts",
      tone: draftsToSend.length > 0 ? "amber" : "zinc",
    },
    {
      step: "04",
      label: "Sweep due soon",
      value: formatMoney(soonDueBalanceTotal),
      detail:
        soonDueInvoices.length > 0
          ? `${soonDueInvoices.length} invoice${
              soonDueInvoices.length === 1 ? "" : "s"
            } due within 7 days.`
          : "No near-term due-date pressure.",
      href: `/invoices${businessQuery}&collection=open${invoiceResultsAnchor}`,
      action: "Open open invoices",
      tone: soonDueInvoices.length > 0 ? "orange" : "zinc",
    },
    {
      step: "05",
      label: "Close proof gaps",
      value: String(openInvoicesMissingProof.length),
      detail:
        openInvoicesMissingProof.length > 0
          ? "Open invoices missing send, reminder, or payment proof."
          : "Open invoice proof trail is clean.",
      href: `/activity?business=${businessSlug}&filter=invoice`,
      action: "Open proof",
      tone: openInvoicesMissingProof.length > 0 ? "rose" : "emerald",
    },
    {
      step: "06",
      label: "Batch checks",
      value: String(batchPaymentCustomerCount),
      detail:
        batchPaymentCustomerCount > 0
          ? "Customers with multiple open invoices can be handled together."
          : "Batch payment workspace is ready when checks arrive.",
      href: `/payments${businessQuery}#batch-payment-tool`,
      action: "Record check",
      tone: batchPaymentCustomerCount > 0 ? "sky" : "zinc",
    },
  ];
  const priorityInvoiceQueue = currentYearOpenInvoicesWithAmounts
    .map((invoice) => {
      const proof = invoiceProofById.get(invoice.id);
      const proofMissing =
        !proof?.sent && !proof?.reminder && !proof?.paymentProof;
      const score = invoiceCollectionPriorityScore({
        amountDue: invoice.amountDue,
        daysLate: invoice.daysLate,
        invoice,
        proofMissing,
      });
      const stage = invoiceCollectionStage({
        amountDue: invoice.amountDue,
        daysLate: invoice.daysLate,
        invoice,
      });

      return {
        ...invoice,
        priorityScore: score,
        priorityStage: stage,
        proofMissing,
      };
    })
    .sort((first, second) => {
      const scoreDifference =
        second.priorityScore - first.priorityScore;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return second.amountDue - first.amountDue;
    })
    .slice(0, 5);

  const viewCounts = {
    all: invoicesWithSplitInfo.length,
    originals: invoicesWithSplitInfo.filter(
      (invoice) => !invoice.split_parent_invoice_id
    ).length,
    splits: invoicesWithSplitInfo.filter((invoice) =>
      Boolean(invoice.split_parent_invoice_id)
    ).length,
    aging: openInvoicesWithAmounts.filter(
      (invoice) => (invoice.daysLate ?? -1) >= 0
    ).length,
  };
  const statusCounts = {
    all: invoicesWithSplitInfo.length,
    draft: invoicesWithSplitInfo.filter(
      (invoice) => invoiceStatusKey(invoice.status) === "draft"
    ).length,
    sent: invoicesWithSplitInfo.filter(
      (invoice) => invoiceStatusKey(invoice.status) === "sent"
    ).length,
    paid: invoicesWithSplitInfo.filter(
      (invoice) => invoiceStatusKey(invoice.status) === "paid"
    ).length,
    overdue: openInvoicesWithAmounts.filter(
      (invoice) => (invoice.daysLate ?? -1) >= 0
    ).length,
  };

  const viewLinks = [
    {
      label: "All",
      value: "all",
      icon: "all" as const,
      count: viewCounts.all,
    },
    {
      label: "Originals",
      value: "originals",
      icon: "originals" as const,
      count: viewCounts.originals,
    },
    {
      label: "Split Invoices",
      value: "splits",
      icon: "splits" as const,
      count: viewCounts.splits,
    },
    {
      label: "Aging",
      value: "aging",
      icon: "aging" as const,
      count: viewCounts.aging,
    },
  ].map((filter) => {
    const params = new URLSearchParams(activeParams);

    if (filter.value === "all") {
      params.delete("view");
    } else {
      params.set("view", filter.value);
    }

    return {
      ...filter,
      href: `/invoices?${params.toString()}${invoiceResultsAnchor}`,
    };
  });

  const statusLinks = [
    {
      label: "All Statuses",
      value: "all",
      icon: "all" as const,
      count: statusCounts.all,
    },
    {
      label: "Draft",
      value: "draft",
      icon: "draft" as const,
      count: statusCounts.draft,
    },
    {
      label: "Sent",
      value: "sent",
      icon: "sent" as const,
      count: statusCounts.sent,
    },
    {
      label: "Paid",
      value: "paid",
      icon: "paid" as const,
      count: statusCounts.paid,
    },
    {
      label: "Overdue",
      value: "overdue",
      icon: "overdue" as const,
      count: statusCounts.overdue,
    },
  ].map((filter) => {
    const params = new URLSearchParams(activeParams);

    if (filter.value === "all") {
      params.delete("status");
    } else {
      params.set("status", filter.value);
    }

    return {
      ...filter,
      href: `/invoices?${params.toString()}${invoiceResultsAnchor}`,
    };
  });

  const hasFocusedInvoiceResultView = Boolean(
    searchTerm ||
      customerFilter ||
      collectionFilter ||
      yearFilter ||
      statusFilter !== "all" ||
      view !== "all"
  );

  const focusedInvoiceResultTitle =
    statusFilter !== "all"
      ? `${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} invoices`
      : view !== "all"
        ? `${view.charAt(0).toUpperCase()}${view.slice(1)} invoices`
        : "Filtered invoices";

  return (
    <AppShell>
      <InvoiceResultsScroller />
      <div className="invoice-dashboard space-y-5 sm:space-y-6">
        <div className="invoice-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold leading-tight">Invoices</h1>

            <p className="mt-2 text-zinc-400">
              Showing invoices for{" "}
              {selectedBusiness?.name ?? "selected business"}.
            </p>
          </div>

          <div className="invoice-page-actions flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={`/recurring-invoices${businessQuery}`}>
              <Button variant="secondary" className="w-full sm:w-auto">
                Recurring Drafts
              </Button>
            </Link>

            <Link href={`/invoices/new${businessQuery}`}>
              <Button className="w-full sm:w-auto">+ New Invoice</Button>
            </Link>
          </div>
        </div>

        {invoiceLoadMessage ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Invoice notice
            </p>

            <p className="mt-2 text-sm leading-6 text-amber-100/90">
              {invoiceLoadMessage}
            </p>
          </Card>
        ) : null}

        {hasFocusedInvoiceResultView ? (
          <Card
            id="invoice-results-list"
            className="focused-invoice-results-card scroll-mt-6 border-emerald-500/30 bg-emerald-500/10"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-emerald-200">
                  Invoice Results
                </p>

                <h2 className="mt-2 text-2xl font-bold text-white">
                  {focusedInvoiceResultTitle}
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Showing {filteredInvoices.length} matching invoice
                  {filteredInvoices.length === 1 ? "" : "s"}. These results
                  are pinned near the top so filtered invoice views open
                  directly where the work is.
                </p>
              </div>

              <InvoiceFilterLink
                href={`/invoices${businessQuery}${invoiceResultsAnchor}`}
                className="w-full sm:w-auto"
              >
                <Button variant="secondary" className="w-full sm:w-auto">
                  Show All Invoices
                </Button>
              </InvoiceFilterLink>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/70 p-5">
                <p className="text-lg font-black text-white">
                  No invoices match this view
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Clear the filters to return to the full invoice list, or
                  create a new invoice when this is a fresh billing item.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                {filteredInvoices.slice(0, 12).map((invoice) => {
                  const isBillableInvoice =
                    invoice.split_children_count <= 0;
                  const amountDue = isBillableInvoice
                    ? invoiceCollectionAmountDue(invoice)
                    : 0;
                  const daysLate = isBillableInvoice
                    ? invoiceDaysPastDue(invoice.due_date)
                    : null;
                  const isPastDue =
                    amountDue > 0 && (daysLate ?? -1) >= 0;
                  const paymentParams = new URLSearchParams({
                    business: businessSlug,
                    customer: invoice.customer_name ?? "",
                  });

                  return (
                    <div
                      key={invoice.id}
                      className="focused-invoice-result-row rounded-2xl border border-white/10 bg-zinc-950/80 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-orange-300">
                              {invoice.display_id ?? "Invoice"}
                            </p>
                            <StatusBadge status={invoice.status || "Draft"} />
                          </div>

                          <h3 className="mt-2 text-xl font-black text-white">
                            {invoice.project_title || "Untitled Invoice"}
                          </h3>

                          <p className="mt-1 text-sm text-zinc-400">
                            {invoice.customer_name || "Unknown Customer"}
                          </p>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-xl font-black text-emerald-200">
                            {isBillableInvoice
                              ? formatMoney(amountDue)
                              : "Split Source"}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
                            {formatDate(invoice.due_date)}
                          </p>
                          {isPastDue ? (
                            <p className="mt-2 text-sm font-semibold text-pink-200">
                              {daysLate} day
                              {daysLate === 1 ? "" : "s"} past due
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:flex-wrap">
                        <Link
                          href={`/invoices/${invoice.id}${businessQuery}`}
                          className="rounded-full bg-sky-600 px-4 py-2 text-center text-sm font-black text-white transition hover:bg-sky-700"
                        >
                          Open
                        </Link>

                        {amountDue > 0 ? (
                          <Link
                            href={`/payments?${paymentParams.toString()}#batch-payment-tool`}
                            className="payment-action-button rounded-full border px-4 py-2 text-center text-sm font-semibold transition"
                          >
                            Record Payment
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredInvoices.length > 12 ? (
              <p className="mt-4 text-sm text-zinc-400">
                Showing the first 12 matches here. The complete filtered list is
                still available farther down the page.
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card className="invoice-snapshot-card border-blue-500/20 bg-blue-500/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-blue-300">
                Invoice Snapshot
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Money waiting to be collected
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                A quick Trimax view of collectible balances, active deposit
                requests, past-due work, drafts, and invoices ready for batch
                payment.
              </p>

              {historicalOpenInvoicesWithAmounts.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {historicalOpenInvoicesWithAmounts.length} older imported
                  open invoice
                  {historicalOpenInvoicesWithAmounts.length === 1 ? "" : "s"}{" "}
                  included in these active collection totals.
                </p>
              ) : null}
            </div>

            <div className="invoice-snapshot-actions flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href={`/payments${businessQuery}`}>
                <Button className="w-full sm:w-auto">
                  Record Batch Payment
                </Button>
              </Link>

              <Link href={`/invoices${businessQuery}&view=aging`}>
                <Button variant="secondary" className="w-full sm:w-auto">
                  Aging View
                </Button>
              </Link>
            </div>
          </div>

          <div className="invoice-metric-grid mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="invoice-metric-card invoice-metric-neutral rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">
                Outstanding
              </p>
              <p className="mt-2 text-3xl font-black text-slate-950">
                {formatMoney(openBalanceTotal)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {currentYearOpenInvoicesWithAmounts.length} collectible
                invoice
                {currentYearOpenInvoicesWithAmounts.length === 1 ? "" : "s"}.
              </p>
            </div>

            <div className="invoice-metric-card invoice-metric-danger rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-rose-700">Past Due</p>
              <p className="mt-2 text-3xl font-black text-rose-700">
                {formatMoney(overdueBalanceTotal)}
              </p>
              <p className="mt-1 text-sm text-rose-700/75">
                Invoices at or past due date.
              </p>
            </div>

            <div className="invoice-metric-card invoice-metric-warning rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-700">Draft Balance</p>
              <p className="mt-2 text-3xl font-black text-amber-800">
                {formatMoney(draftBalanceTotal)}
              </p>
              <p className="mt-1 text-sm text-amber-700/75">
                Work not sent yet.
              </p>
            </div>

            <div className="invoice-metric-card invoice-metric-success rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Batch Payment Cue</p>
              <p className="mt-2 text-3xl font-black text-emerald-800">
                {batchPaymentCustomerCount}
              </p>
              <p className="mt-1 text-sm text-emerald-700/75">
                Customers with multiple open invoices.
              </p>
            </div>
          </div>
        </Card>

        <Card className="invoice-next-moves-card border-sky-500/20 bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                Next Money Moves
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                The fastest route to cleaner books
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Trimax turns invoice status into direct next steps: remind late
                customers, collect deposits, send drafts, or apply one check to
                several invoices.
              </p>
            </div>

            <Link href={`/payments${businessQuery}`}>
              <Button className="w-full sm:w-auto">
                Open Payment Workspace
              </Button>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {nextMoneyMoves.map((move) => (
              <Link
                key={move.label}
                href={move.href}
                data-tone={move.tone}
                className="invoice-next-move-card group rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
                  {move.label}
                </p>
                <p className="mt-3 text-3xl font-black text-white">
                  {move.metric}
                </p>
                <h3 className="mt-3 font-bold text-white">
                  {move.title}
                </h3>
                <p className="mt-2 min-h-[3rem] text-sm leading-6 text-zinc-400">
                  {move.detail}
                </p>
                <span className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-2 text-sm font-black text-white transition group-hover:border-white/25 group-hover:bg-white/10">
                  {move.action}
                </span>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="invoice-intelligence-card border-orange-500/20 bg-zinc-950">
          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr] xl:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-orange-300">
                Invoice Intelligence
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Collection signals and data cleanup
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Trimax is reading the invoice desk for money pressure,
                due-date gaps, customer grouping, and reporting readiness.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {invoiceIntelligenceCards.map((card) => (
                  <Link
                    key={card.label}
                    href={card.href}
                    data-tone={card.tone}
                    className="invoice-intelligence-tile rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-orange-300/60"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                      {card.label}
                    </p>
                    <p className="mt-3 text-2xl font-black text-white">
                      {card.value}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-zinc-400">
                      {card.detail}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                    Reporting Readiness
                  </p>
                  <h3 className="mt-1 text-lg font-black text-white">
                    Clean data, cleaner collections
                  </h3>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${
                    invoiceReadinessIssueCount > 0
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                      : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  }`}
                >
                  {invoiceReadinessIssueCount > 0
                    ? `${invoiceReadinessIssueCount} signal${
                        invoiceReadinessIssueCount === 1 ? "" : "s"
                      }`
                    : "Clean"}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {invoiceCleanupSteps.map((step) => (
                  <Link
                    key={step.label}
                    href={step.href}
                    className={`invoice-intelligence-step rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
                      step.complete
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-amber-400/30 bg-amber-400/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-white">
                          {step.label}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-zinc-400">
                          {step.detail}
                        </p>
                      </div>

                      <span className="text-2xl font-black text-white">
                        {step.value}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="invoice-proof-radar border-emerald-500/20 bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">
                Proof Radar
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Delivery, reminder, and payment evidence
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Reuses Trimax activity logs so invoice proof stays in one
                audit-friendly trail instead of creating duplicate tracking.
              </p>
            </div>

            <Link href={`/activity?business=${businessSlug}&filter=invoice`}>
              <Button variant="secondary" className="w-full sm:w-auto">
                Open Activity Proof
              </Button>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {proofRadarCards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                data-tone={card.tone}
                className="invoice-proof-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-black text-white">
                  {card.value}
                </p>
                <p className="mt-2 text-sm leading-5 text-zinc-400">
                  {card.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="invoice-collection-playbook border-orange-500/20 bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-orange-300">
                Collection Playbook
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Work the invoice desk in the right order
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                A guided sequence for collecting, proving, and cleaning invoice
                work without bouncing between screens blindly.
              </p>
            </div>

            <Link href={`/payments${businessQuery}`}>
              <Button className="w-full sm:w-auto">
                Start Collection Work
              </Button>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {collectionPlaybookSteps.map((step) => (
              <Link
                key={step.step}
                href={step.href}
                data-tone={step.tone}
                className="invoice-playbook-step rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-orange-300/60"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="invoice-playbook-number rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-orange-100">
                    {step.step}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-zinc-300">
                    {step.action}
                  </span>
                </div>

                <p className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-zinc-500">
                  {step.label}
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {step.value}
                </p>

                <p className="mt-2 min-h-[2.5rem] text-sm leading-5 text-zinc-400">
                  {step.detail}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        {priorityInvoiceQueue.length > 0 ? (
          <Card className="invoice-priority-queue border-rose-500/20 bg-zinc-950">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.28em] text-rose-300">
                  Priority Queue
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  Highest-value invoice actions
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  Ranked by balance, lateness, due-soon pressure, deposits, and
                  proof gaps so collections start where they matter most.
                </p>
              </div>

              <Link href={`/invoices${businessQuery}&collection=open`}>
                <Button variant="secondary" className="w-full sm:w-auto">
                  View Open Invoices
                </Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-5">
              {priorityInvoiceQueue.map((invoice, index) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}${businessQuery}`}
                  data-tone={invoice.priorityStage.tone}
                  className="invoice-priority-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-rose-300/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-rose-100">
                      #{index + 1}
                    </span>
                    <span className="invoice-priority-score rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white">
                      {invoice.priorityScore}
                    </span>
                  </div>

                  <p className="mt-4 text-sm font-black text-white">
                    {invoice.display_id ?? "Invoice"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-400">
                    {invoice.customer_name ?? "Unknown Customer"}
                  </p>

                  <p className="mt-3 text-xl font-black text-orange-300">
                    {formatMoney(invoice.amountDue)}
                  </p>

                  <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    {invoice.priorityStage.label}
                  </p>

                  {invoice.proofMissing ? (
                    <span className="mt-3 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-100">
                      Proof gap
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        {customerBalanceRows.length > 0 ? (
          <Card className="invoice-customer-radar border-emerald-500/20 bg-zinc-950">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">
                  Customer Collection Radar
                </p>

                <h2 className="mt-2 text-2xl font-bold text-white">
                  Who to collect from first
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                  Trimax groups open invoices by customer so batch checks,
                  reminders, and payment matching start with the highest-value
                  targets.
                </p>
              </div>

              <a href="#customer-collection-radar">
                <Button variant="secondary" className="w-full sm:w-auto">
                  View Customer Balances
                </Button>
              </a>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {customerRadarCards.map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  data-tone={card.tone}
                  className="invoice-customer-radar-card rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:-translate-y-0.5"
                >
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
                    {card.label}
                  </p>
                  <p className="mt-3 text-3xl font-black text-white">
                    {card.value}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-zinc-400">
                    {card.detail}
                  </p>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="invoice-search-card">
          <form
            action={`/invoices${invoiceResultsAnchor}`}
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input
              type="hidden"
              name="business"
              value={businessSlug}
            />

            {view !== "all" ? (
              <input
                type="hidden"
                name="view"
                value={view}
              />
            ) : null}

            {statusFilter !== "all" ? (
              <input
                type="hidden"
                name="status"
                value={statusFilter}
              />
            ) : null}

            {customerFilter ? (
              <input
                type="hidden"
                name="customer"
                value={customerFilter}
              />
            ) : null}

            {collectionFilter ? (
              <input
                type="hidden"
                name="collection"
                value={collectionFilter}
              />
            ) : null}

            {yearFilter ? (
              <input
                type="hidden"
                name="year"
                value={String(yearFilter)}
              />
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Search Invoices
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search number, project, customer, status, or split source"
                className="invoice-search-input w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <div className="invoice-search-actions flex flex-col gap-3 md:flex-row md:items-end">
              <Button type="submit" className="w-full md:w-auto">
                Search
              </Button>

              {(searchTerm ||
                customerFilter ||
                collectionFilter ||
                yearFilter ||
                statusFilter !== "all" ||
                view !== "all") && (
                <InvoiceFilterLink
                  href={`/invoices${businessQuery}${invoiceResultsAnchor}`}
                  className="w-full md:w-auto"
                >
                  <Button variant="secondary" className="w-full md:w-auto">
                    Clear
                  </Button>
                </InvoiceFilterLink>
              )}
            </div>
          </form>
        </Card>

        {customerFilter || collectionFilter || yearFilter ? (
          <Card className="focused-invoice-card border-sky-200 bg-sky-50">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700">
              Focused Invoice View
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-700">
              Showing{" "}
              {collectionFilter === "open" ? "collectible unpaid " : ""}
              invoices
              {customerFilter ? ` for ${customerFilter}` : ""}
              {yearFilter ? ` from ${yearFilter}` : ""}. Clear the filters to
              return to the full invoice list.
            </p>
          </Card>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
          <section
            aria-label="Invoice type filters"
            className="invoice-filter-group rounded-2xl border border-zinc-800 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">
                Invoice Type
              </p>
              <p className="text-xs text-zinc-500">
                {viewCounts.all} total
              </p>
            </div>

            <div className="invoice-filter-bar workspace-filter-bar flex flex-wrap gap-2 rounded-2xl border border-zinc-800 p-2">
              {viewLinks.map((filter) => {
                const isActive = view === filter.value;

                return (
                  <InvoiceFilterLink
                    key={filter.value}
                    href={filter.href}
                    ariaCurrent={isActive ? "page" : undefined}
                    className={`invoice-filter-pill inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "bg-sky-600 text-white shadow-sm shadow-sky-900/10"
                        : "workspace-filter-link-inactive border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                    }`}
                  >
                    <span
                      className={`filter-tab-icon ${
                        isActive ? "filter-tab-icon-active" : ""
                      }`}
                      aria-hidden="true"
                    >
                      <InvoiceFilterIcon icon={filter.icon} />
                    </span>
                    <span className="filter-tab-label">{filter.label}</span>
                    <span className="filter-tab-count">{filter.count}</span>
                  </InvoiceFilterLink>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Invoice status filters"
            className="invoice-filter-group rounded-2xl border border-zinc-800 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">
                Status
              </p>
              <p className="text-xs text-zinc-500">
                {statusCounts.overdue} overdue
              </p>
            </div>

            <div className="invoice-filter-bar workspace-filter-bar flex flex-wrap gap-2 rounded-2xl border border-zinc-800 p-2">
              {statusLinks.map((filter) => {
                const isActive = statusFilter === filter.value;

                return (
                  <InvoiceFilterLink
                    key={filter.value}
                    href={filter.href}
                    ariaCurrent={isActive ? "page" : undefined}
                    className={`invoice-filter-pill inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "bg-sky-600 text-white shadow-sm shadow-sky-900/10"
                        : "workspace-filter-link-inactive border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                    }`}
                  >
                    <span
                      className={`filter-tab-icon ${
                        isActive ? "filter-tab-icon-active" : ""
                      }`}
                      aria-hidden="true"
                    >
                      <InvoiceFilterIcon icon={filter.icon} />
                    </span>
                    <span className="filter-tab-label">{filter.label}</span>
                    <span className="filter-tab-count">{filter.count}</span>
                  </InvoiceFilterLink>
                );
              })}
            </div>
          </section>
        </div>

        <InvoiceBulkPaymentActions
          businessSlug={businessSlug}
          invoices={openInvoicesWithAmounts.map((invoice) => ({
            id: invoice.id,
            displayId: invoice.display_id ?? "Invoice",
            customerName: invoice.customer_name ?? "Unknown Customer",
            projectTitle: invoice.project_title ?? "Untitled Invoice",
            invoiceAmount: parseMoney(invoice.invoice_amount),
            amountPaid: parseMoney(invoice.amount_paid),
            collectionAmountDue: invoice.amountDue,
            status: invoice.status ?? "Draft",
            dueDate: invoice.due_date,
          }))}
        />

        {draftsToSend.length > 0 ? (
          <Card className="border-green-500/30 bg-green-500/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                  Drafts To Send
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Review recurring invoice drafts
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  These drafts look like recurring work. Review the PDF or BOA
                  export, then send manually from Outlook.
                </p>
              </div>

              <Link href={`/recurring-invoices${businessQuery}`}>
                <Button variant="secondary">Manage Recurring Drafts</Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {draftsToSend.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}${businessQuery}`}
                  className="rounded-2xl border border-green-500/20 bg-zinc-950 p-4 transition hover:border-green-400/70 hover:bg-zinc-900"
                >
                  <p className="text-sm font-semibold text-green-200">
                    {invoice.display_id ?? "Invoice"}
                  </p>
                  <p className="mt-2 font-bold">
                    {invoice.customer_name ?? "Unknown Customer"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {invoice.project_title ?? "Untitled Invoice"}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {formatMoney(
                      Math.max(
                        parseMoney(invoice.invoice_amount) -
                          parseMoney(invoice.amount_paid),
                        0
                      )
                    )}
                  </p>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="invoice-aging-card border-pink-500/20 bg-pink-500/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-pink-300">
                Accounts Aging
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Past-due invoice buckets
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                See unpaid invoices by age, then use batch payments when one
                check covers several units.
              </p>
            </div>

            <Link
              href={`/invoices?business=${businessSlug}&view=aging${invoiceResultsAnchor}`}
            >
              <Button variant="secondary" className="w-full sm:w-auto">
                Open Aging View
              </Button>
            </Link>
          </div>

          <div className="invoice-aging-summary-grid mt-5 grid gap-3 md:grid-cols-3">
            <div className="invoice-aging-summary-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">
                Outstanding
              </p>
              <p className="mt-2 text-3xl font-black text-white">
                {formatMoney(openBalanceTotal)}
              </p>
            </div>

            <div className="invoice-aging-summary-card invoice-aging-danger rounded-2xl border border-pink-500/30 bg-pink-500/10 p-4">
              <p className="text-sm text-pink-100/80">Past Due</p>
              <p className="mt-2 text-3xl font-black text-pink-100">
                {formatMoney(overdueBalanceTotal)}
              </p>
            </div>

            <div className="invoice-aging-summary-card invoice-aging-warning rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-100/80">Still In Draft</p>
              <p className="mt-2 text-3xl font-black text-amber-100">
                {formatMoney(draftBalanceTotal)}
              </p>
            </div>
          </div>

          <div className="invoice-aging-bucket-grid mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {agingBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className="invoice-aging-bucket rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <p className="text-sm text-zinc-400">{bucket.label}</p>

                <p className="mt-2 text-2xl font-black">
                  {formatMoney(bucket.amount)}
                </p>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-pink-400"
                    style={{
                      width: `${Math.max(
                        4,
                        (bucket.amount / agingVisualMax) * 100
                      )}%`,
                    }}
                  />
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  {bucket.count} invoice{bucket.count === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {customerBalanceRows.length > 0 ? (
          <Card
            id="customer-collection-radar"
            className="invoice-customer-balance-panel"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Customer Balances
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Open invoices by customer
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Collectible invoices grouped by customer, useful when one
                  check pays several units or recurring jobs.
                </p>
              </div>

              <Link
                href={`/invoices?business=${businessSlug}&view=aging${invoiceResultsAnchor}`}
              >
                <Button variant="secondary">Review Aging</Button>
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {customerBalanceRows.map((customer) => {
                const customerParams = new URLSearchParams({
                  business: businessSlug,
                  customer: customer.customerName,
                  collection: "open",
                  year: String(workingYear),
                });
                const paymentParams = new URLSearchParams({
                  business: businessSlug,
                  customer: customer.customerName,
                });

                return (
                  <div
                    key={customer.customerName}
                    className="invoice-customer-balance-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">
                          {customer.customerName}
                        </p>

                        <p className="mt-1 text-sm text-zinc-400">
                          {customer.invoiceCount} open invoice
                          {customer.invoiceCount === 1 ? "" : "s"}
                        </p>
                      </div>

                      <p className="text-lg font-black text-orange-300">
                        {formatMoney(customer.amountDue)}
                      </p>
                    </div>

                    <div className="mt-4 border-t border-zinc-800 pt-3 text-sm">
                      {customer.oldestDaysLate !== null ? (
                        <span className="font-semibold text-pink-200">
                          Oldest is {customer.oldestDaysLate} day
                          {customer.oldestDaysLate === 1 ? "" : "s"} late
                        </span>
                      ) : (
                        <span className="text-zinc-400">
                          No past-due invoices
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/payments?${paymentParams.toString()}#batch-payment-tool`}
                        className="rounded-xl bg-green-500 px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        Record Payment
                      </Link>

                      <Link
                        href={`/invoices?${customerParams.toString()}${invoiceResultsAnchor}`}
                        className="rounded-xl bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700"
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

        <div className="invoice-results-anchor">
        {recentlyUpdatedInvoices.length > 0 ? (
          <Card>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Recently Updated
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Latest invoice activity
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {recentlyUpdatedInvoices.map((invoice) => {
                const amountDue = invoiceCollectionAmountDue(invoice);
                const isDepositRequest = hasActiveDepositRequest(invoice);

                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}${businessQuery}`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
                  >
                    <p className="text-sm text-orange-300">
                      {invoice.display_id ?? "Invoice"}
                    </p>

                    <p className="mt-2 line-clamp-2 font-semibold">
                      {invoice.customer_name ?? "Unknown Customer"}
                    </p>

                    <p className="mt-3 border-t border-zinc-800 pt-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                      {isDepositRequest ? "Deposit Due" : "Collection Due"}
                    </p>

                    <p className="mt-1 font-bold">
                      {formatMoney(amountDue)}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-400">
                      <span>{invoice.status ?? "Draft"}</span>
                      {isDepositRequest ? (
                        <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                          Deposit request
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        ) : null}

        <div
          id={
            hasFocusedInvoiceResultView
              ? "invoice-results-list-full"
              : "invoice-results-list"
          }
          className="scroll-mt-6"
        >
          {invoicesWithSplitInfo.length === 0 ? (
            <Card className="app-empty-state border-sky-200 bg-sky-50">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-700">
                  Invoice Desk Ready
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  Create the first invoice
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Start a new invoice directly, manage recurring drafts, or
                  convert an approved estimate when proposal details should
                  carry forward.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href={`/recurring-invoices${businessQuery}`}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    Recurring Drafts
                  </Button>
                </Link>

                <Link href={`/invoices/new${businessQuery}`}>
                  <Button className="w-full sm:w-auto">New Invoice</Button>
                </Link>
              </div>
            </div>
            </Card>
          ) : filteredInvoices.length === 0 ? (
            <Card className="app-empty-state border-dashed border-slate-300 bg-white">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                  Filter Check
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  No invoices match this view
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Clear the filters to return to the full invoice list, or open
                  a new invoice when this is a fresh billing item.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href={`/invoices${businessQuery}${invoiceResultsAnchor}`}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    Show All Invoices
                  </Button>
                </Link>

                <Link href={`/invoices/new${businessQuery}`}>
                  <Button className="w-full sm:w-auto">New Invoice</Button>
                </Link>
              </div>
            </div>
            </Card>
          ) : (
            <div className="invoice-list grid gap-4">
            {filteredInvoices.map((invoice) => {
              const isSplitInvoice = Boolean(
                invoice.split_parent_invoice_id
              );
              const hasSplitChildren =
                invoice.split_children_count > 0;
              const isBillableInvoice = !hasSplitChildren;
              const amountDue = invoiceCollectionAmountDue(invoice);
              const displayAmountDue = isBillableInvoice ? amountDue : 0;
              const daysLate = isBillableInvoice
                ? invoiceDaysPastDue(invoice.due_date)
                : null;
              const isPastDue =
                displayAmountDue > 0 && (daysLate ?? -1) >= 0;
              const isDepositRequest = hasActiveDepositRequest(invoice);
              const reminderHref = `/invoices/${invoice.id}${businessQuery}#late-payment-reminder`;
              const collectionStage = invoiceCollectionStage({
                amountDue: displayAmountDue,
                daysLate,
                invoice,
              });
              const readinessSignals = invoiceReadinessSignals(invoice);
              const proofSignals = invoiceProofById.get(invoice.id) ?? {
                sent: false,
                reminder: false,
                paymentProof: false,
                pdfProof: false,
                lastProofDate: null,
              };
              const proofLabels = [
                proofSignals.sent ? "Email proof" : "",
                proofSignals.reminder ? "Reminder proof" : "",
                proofSignals.pdfProof ? "PDF attached" : "",
                proofSignals.paymentProof ? "Payment proof" : "",
              ].filter(Boolean);
              const proofMissing =
                displayAmountDue > 0 &&
                !proofSignals.sent &&
                !proofSignals.reminder &&
                !proofSignals.paymentProof;
              const priorityScore = invoiceCollectionPriorityScore({
                amountDue: displayAmountDue,
                daysLate,
                invoice,
                proofMissing,
              });

              const paymentParams = new URLSearchParams({
                business: businessSlug,
                customer: invoice.customer_name ?? "",
              });

              return (
                <Card
                  key={invoice.id}
                  className={`invoice-list-card transition hover:border-sky-300 hover:bg-sky-50 ${
                    isSplitInvoice
                      ? "border-green-500/30 bg-green-500/5"
                      : hasSplitChildren
                        ? "border-amber-300 bg-amber-50"
                        : ""
                  }`}
                >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-orange-400">
                            {invoice.display_id ?? "Invoice"}
                          </p>

                          {isSplitInvoice ? (
                            <span className="rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-200">
                              Split {invoice.split_sequence ?? "-"} of{" "}
                              {invoice.split_count ?? "-"}
                            </span>
                          ) : null}

                          {hasSplitChildren ? (
                            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                              {invoice.split_children_count} split invoice
                              {invoice.split_children_count === 1
                                ? ""
                                : "s"}
                            </span>
                          ) : null}

                          {isDepositRequest && isBillableInvoice ? (
                            <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                              Deposit request
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-1 text-2xl font-semibold">
                          {invoice.project_title || "Untitled Invoice"}
                        </h2>

                        <p className="mt-1 text-zinc-400">
                          {invoice.customer_name || "Unknown Customer"}
                        </p>

                        {isSplitInvoice ? (
                          <p className="mt-2 text-sm text-green-200/80">
                            Created from{" "}
                            {invoice.split_parent_display_id ??
                              "original invoice"}
                          </p>
                        ) : null}
                      </div>

                      <div className="sm:text-right">
                        <p className="text-xl font-bold text-orange-400">
                          {isBillableInvoice
                            ? formatMoney(displayAmountDue)
                            : "Split Source"}
                        </p>

                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
                          {isBillableInvoice
                            ? isDepositRequest
                              ? "Deposit Due"
                              : "Collection Due"
                            : "Use split invoices"}
                        </p>

                        <div className="mt-2">
                          <StatusBadge status={invoice.status || "Draft"} />
                        </div>

                        <p className="mt-2 text-sm text-zinc-400">
                          {formatDate(invoice.due_date)}
                        </p>

                        {isPastDue ? (
                          <p className="mt-2 text-sm font-semibold text-pink-200">
                            {daysLate} day{daysLate === 1 ? "" : "s"} past due
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="invoice-card-intelligence mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                            Collection Cue
                          </p>
                          <p className="mt-1 text-base font-black text-white">
                            {collectionStage.label}
                          </p>
                          <p className="mt-1 text-sm leading-5 text-zinc-400">
                            {collectionStage.detail}
                          </p>
                        </div>

                        <span
                          data-tone={collectionStage.tone}
                          className="invoice-stage-pill rounded-full border px-3 py-1 text-xs font-black"
                        >
                          Priority {priorityScore}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(readinessSignals.length > 0
                          ? readinessSignals
                          : ["Clean invoice record"]
                        ).map((signal) => (
                          <span
                            key={signal}
                            className="invoice-signal-chip rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(proofLabels.length > 0
                          ? proofLabels
                          : ["No proof activity yet"]
                        ).map((signal) => (
                          <span
                            key={signal}
                            className={`invoice-proof-chip rounded-full border px-3 py-1 text-xs font-black ${
                              proofLabels.length > 0
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                                : "invoice-proof-chip-missing border-zinc-600 bg-zinc-900/70 text-zinc-400"
                            }`}
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="invoice-list-actions mt-5 flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:flex-wrap">
                      <Link
                        href={`/invoices/${invoice.id}${businessQuery}`}
                        className="rounded-full bg-sky-600 px-4 py-2 text-center text-sm font-black text-white transition hover:bg-sky-700"
                      >
                        Open
                      </Link>

                      <Link
                        href={`/invoices/${invoice.id}/print${businessQuery}`}
                        className="rounded-full border border-zinc-700 px-4 py-2 text-center text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
                      >
                        Print
                      </Link>

                      {displayAmountDue > 0 ? (
                        <Link
                          href={`/payments?${paymentParams.toString()}#batch-payment-tool`}
                          className="payment-action-button rounded-full border px-4 py-2 text-center text-sm font-semibold transition"
                        >
                          Record Payment
                        </Link>
                      ) : null}

                      {isPastDue ? (
                        <Link
                          href={reminderHref}
                          className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-center text-sm font-black text-rose-800 transition hover:border-rose-400 hover:bg-rose-100"
                        >
                          Send Reminder
                        </Link>
                      ) : null}
                    </div>
                </Card>
              );
            })}
            </div>
          )}
        </div>
        </div>
      </div>
    </AppShell>
  );
}
