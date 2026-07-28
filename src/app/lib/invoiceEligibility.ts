import {
  invoiceWasSent,
  invoiceStatusKey,
  isCollectibleInvoiceStatus,
  isNonCollectibleInvoiceStatus,
  moneyNumber,
} from "./invoiceLifecycle";

export type InvoiceEligibilityRecord = {
  id?: string | null;
  status?: string | null;
  invoice_amount?: string | number | null;
  amount_paid?: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  notes?: string | null;
  issue_date?: string | null;
  created_at?: string | null;
  import_source?: string | null;
  source?: string | null;
  external_id?: string | null;
  imported_at?: string | null;
  import_reviewed?: boolean | null;
  split_parent_invoice_id?: string | null;
  split_children_count?: number | null;
  due_date?: string | null;
  updated_at?: string | null;
  display_id?: string | null;
};

export type InvoiceEligibilityLineItem = {
  description?: string | null;
  quantity?: string | number | null;
  unit_price?: string | number | null;
  line_total?: string | number | null;
};

export function hasActiveDepositRequest(invoice: InvoiceEligibilityRecord) {
  return (
    invoiceStatusKey(invoice.deposit_status) === "requested" &&
    moneyNumber(invoice.deposit_requested_amount) > 0
  );
}

export function invoiceCollectionAmountDue(invoice: InvoiceEligibilityRecord) {
  if (isNonCollectibleInvoiceStatus(invoice.status)) {
    return 0;
  }

  const invoiceAmount = moneyNumber(invoice.invoice_amount);
  const amountPaid = moneyNumber(invoice.amount_paid);
  const fullAmountDue = Math.max(invoiceAmount - amountPaid, 0);

  return hasActiveDepositRequest(invoice)
    ? Math.max(moneyNumber(invoice.deposit_requested_amount) - amountPaid, 0)
    : fullAmountDue;
}

export function hasMeaningfulInvoiceLineItems(
  lineItems: InvoiceEligibilityLineItem[] = []
) {
  return lineItems.some((item) => {
    const description = String(item.description ?? "").trim();
    const savedLineTotal = moneyNumber(item.line_total);
    const calculatedLineTotal =
      moneyNumber(item.quantity) * moneyNumber(item.unit_price);

    return Boolean(description) && Math.max(savedLineTotal, calculatedLineTotal) > 0;
  });
}

export function isSplitSourceInvoice(invoice: InvoiceEligibilityRecord) {
  return Number(invoice.split_children_count ?? 0) > 0;
}

export function isIncompleteDraftInvoice({
  invoice,
  lineItems = [],
}: {
  invoice: InvoiceEligibilityRecord;
  lineItems?: InvoiceEligibilityLineItem[];
}) {
  return (
    invoiceStatusKey(invoice.status) === "draft" &&
    (moneyNumber(invoice.invoice_amount) <= 0 ||
      !hasMeaningfulInvoiceLineItems(lineItems))
  );
}

function dateTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function businessDateKey(
  date: Date = new Date(),
  timeZone = "America/Los_Angeles"
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function invoiceDateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const key = String(value).slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function daysBetweenDateKeys(first: string, second: string) {
  const firstDate = new Date(`${first}T00:00:00`);
  const secondDate = new Date(`${second}T00:00:00`);

  if (
    Number.isNaN(firstDate.getTime()) ||
    Number.isNaN(secondDate.getTime())
  ) {
    return null;
  }

  return Math.round((firstDate.getTime() - secondDate.getTime()) / 86_400_000);
}

export function invoiceDaysPastDue({
  dueDate,
  todayKey = businessDateKey(),
}: {
  dueDate: string | null | undefined;
  todayKey?: string;
}) {
  const dueDateKey = invoiceDateKey(dueDate);

  if (!dueDateKey || !todayKey) {
    return null;
  }

  return daysBetweenDateKeys(todayKey, dueDateKey);
}

export function isOfficiallyIssuedInvoice({
  invoice,
  invoiceIdsWithSendProof = new Set<string>(),
}: {
  invoice: InvoiceEligibilityRecord;
  invoiceIdsWithSendProof?: Set<string>;
}) {
  return invoiceWasSent(invoice, invoiceIdsWithSendProof);
}

export function isHistoricalImportedDraft(invoice: InvoiceEligibilityRecord) {
  if (invoiceStatusKey(invoice.status) !== "draft") {
    return false;
  }

  if (invoice.import_reviewed) {
    return false;
  }

  const provenanceText = [
    invoice.notes,
    invoice.import_source,
    invoice.source,
    invoice.external_id,
    invoice.imported_at,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const hasAuthoritativeImportSignal =
    /\b(freshbooks|imported|import|legacy|migration|migrated|csv)\b/.test(
      provenanceText
    );

  if (hasAuthoritativeImportSignal) {
    return true;
  }

  const issueTime = dateTime(invoice.issue_date);
  const createdTime = dateTime(invoice.created_at);
  const daysBetween =
    issueTime > 0 && createdTime > 0
      ? (createdTime - issueTime) / 86_400_000
      : 0;

  return daysBetween >= 30;
}

export function requiresImportReview(invoice: InvoiceEligibilityRecord) {
  return isHistoricalImportedDraft(invoice);
}

export function nonCollectibleInvoiceLabel(status: string | null | undefined) {
  const normalizedStatus = invoiceStatusKey(status);

  if (["void", "voided"].includes(normalizedStatus)) {
    return "Void - Non-collectible";
  }

  if (normalizedStatus === "superseded") {
    return "Superseded - Non-collectible";
  }

  if (isNonCollectibleInvoiceStatus(status)) {
    return "Non-collectible";
  }

  return null;
}

export function isPaymentEligibleInvoice({
  invoice,
  lineItems = [],
}: {
  invoice: InvoiceEligibilityRecord;
  lineItems?: InvoiceEligibilityLineItem[];
}) {
  return (
    isCollectibleInvoiceStatus(invoice.status) &&
    invoiceCollectionAmountDue(invoice) > 0 &&
    !isSplitSourceInvoice(invoice) &&
    !isIncompleteDraftInvoice({ invoice, lineItems })
  );
}

export function isOverdueCollectibleInvoice({
  invoice,
  lineItems = [],
  invoiceIdsWithSendProof = new Set<string>(),
  todayKey = businessDateKey(),
}: {
  invoice: InvoiceEligibilityRecord;
  lineItems?: InvoiceEligibilityLineItem[];
  invoiceIdsWithSendProof?: Set<string>;
  todayKey?: string;
}) {
  const dueDateKey = invoiceDateKey(invoice.due_date);

  return (
    Boolean(dueDateKey) &&
    dueDateKey! < todayKey &&
    isPaymentEligibleInvoice({ invoice, lineItems }) &&
    isOfficiallyIssuedInvoice({ invoice, invoiceIdsWithSendProof })
  );
}

export function invoiceDueBucket({
  invoice,
  lineItems = [],
  invoiceIdsWithSendProof = new Set<string>(),
  todayKey = businessDateKey(),
  dueSoonDays = 7,
}: {
  invoice: InvoiceEligibilityRecord;
  lineItems?: InvoiceEligibilityLineItem[];
  invoiceIdsWithSendProof?: Set<string>;
  todayKey?: string;
  dueSoonDays?: number;
}) {
  const dueDateKey = invoiceDateKey(invoice.due_date);

  if (
    !dueDateKey ||
    !isPaymentEligibleInvoice({ invoice, lineItems }) ||
    !isOfficiallyIssuedInvoice({ invoice, invoiceIdsWithSendProof })
  ) {
    return "not_collectible" as const;
  }

  if (dueDateKey < todayKey) {
    return "overdue" as const;
  }

  if (dueDateKey === todayKey) {
    return "due_today" as const;
  }

  const daysUntilDue = daysBetweenDateKeys(dueDateKey, todayKey);

  if (daysUntilDue !== null && daysUntilDue <= dueSoonDays) {
    return "due_soon" as const;
  }

  return "upcoming" as const;
}

export function invoicePaymentIneligibleReason({
  invoice,
  lineItems = [],
}: {
  invoice: InvoiceEligibilityRecord;
  lineItems?: InvoiceEligibilityLineItem[];
}) {
  const nonCollectibleLabel = nonCollectibleInvoiceLabel(invoice.status);

  if (nonCollectibleLabel) {
    return nonCollectibleLabel;
  }

  if (isSplitSourceInvoice(invoice)) {
    return "Split source - use split invoices";
  }

  if (isIncompleteDraftInvoice({ invoice, lineItems })) {
    return "Draft incomplete - add line items and pricing";
  }

  if (!isCollectibleInvoiceStatus(invoice.status)) {
    return "Not collectible";
  }

  if (invoiceCollectionAmountDue(invoice) <= 0) {
    return "No balance due";
  }

  return null;
}

export function isSendEligibleInvoice({
  invoice,
  lineItems = [],
  recipientEmail,
}: {
  invoice: InvoiceEligibilityRecord;
  lineItems?: InvoiceEligibilityLineItem[];
  recipientEmail?: string | null;
}) {
  return !invoiceSendIneligibleReason({
    invoice,
    lineItems,
    recipientEmail,
  });
}

export const isSendReadyInvoice = isSendEligibleInvoice;

export function invoiceSendIneligibleReason({
  invoice,
  lineItems = [],
  recipientEmail,
}: {
  invoice: InvoiceEligibilityRecord;
  lineItems?: InvoiceEligibilityLineItem[];
  recipientEmail?: string | null;
}) {
  const status = invoiceStatusKey(invoice.status);
  const nonCollectibleLabel = nonCollectibleInvoiceLabel(invoice.status);

  if (nonCollectibleLabel) {
    return nonCollectibleLabel;
  }

  if (isSplitSourceInvoice(invoice)) {
    return "Split source - send split invoices";
  }

  if (requiresImportReview(invoice)) {
    return "Imported draft - review before sending";
  }

  if (status !== "draft") {
    return status === "sent" ? "Already sent" : "Not a sendable draft";
  }

  if (isIncompleteDraftInvoice({ invoice, lineItems })) {
    return "Draft incomplete - add line items and pricing";
  }

  if (!recipientEmail?.trim().includes("@")) {
    return "Missing saved recipient email";
  }

  return null;
}
