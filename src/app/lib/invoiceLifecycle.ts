export type InvoiceLifecycleRecord = {
  status?: string | null;
  amount_paid?: string | number | null;
  invoice_amount?: string | number | null;
  created_at?: string | null;
  display_id?: string | null;
  id?: string | null;
  split_parent_invoice_id?: string | null;
};

export function invoiceStatusKey(value: string | null | undefined) {
  return (value || "Draft")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

export function moneyNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]+/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

export function isNonCollectibleInvoiceStatus(
  value: string | null | undefined
) {
  const status = invoiceStatusKey(value);

  return [
    "void",
    "voided",
    "cancelled",
    "canceled",
    "superseded",
    "corrected",
    "archived",
  ].includes(status);
}

export function isCollectibleInvoiceStatus(value: string | null | undefined) {
  const status = invoiceStatusKey(value);

  return (
    status !== "paid" &&
    status !== "draft" &&
    !isNonCollectibleInvoiceStatus(status)
  );
}

export function invoiceAmountDue(invoice: InvoiceLifecycleRecord) {
  if (isNonCollectibleInvoiceStatus(invoice.status)) {
    return 0;
  }

  return Math.max(
    moneyNumber(invoice.invoice_amount) - moneyNumber(invoice.amount_paid),
    0
  );
}

export function isInvoicePaid(invoice: InvoiceLifecycleRecord | null | undefined) {
  if (!invoice || isNonCollectibleInvoiceStatus(invoice.status)) {
    return false;
  }

  const invoiceAmount = moneyNumber(invoice.invoice_amount);
  const amountPaid = moneyNumber(invoice.amount_paid);

  return (
    invoiceStatusKey(invoice.status) === "paid" ||
    (invoiceAmount > 0 && amountPaid >= invoiceAmount)
  );
}

export function invoiceWasSent(
  invoice: InvoiceLifecycleRecord | null | undefined,
  invoiceIdsWithSendProof: Set<string> = new Set()
) {
  if (!invoice?.id || isNonCollectibleInvoiceStatus(invoice.status)) {
    return false;
  }

  return (
    invoiceIdsWithSendProof.has(invoice.id) ||
    ["sent", "paid"].includes(invoiceStatusKey(invoice.status))
  );
}

function recordTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function displayNumber(value: string | null | undefined) {
  const match = String(value ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function chooseAuthoritativeInvoice<T extends InvoiceLifecycleRecord>(
  invoices: T[]
) {
  const activeInvoices = invoices.filter(
    (invoice) => !isNonCollectibleInvoiceStatus(invoice.status)
  );
  const candidates = activeInvoices.length > 0 ? activeInvoices : invoices;

  return [...candidates].sort(
    (first, second) =>
      recordTime(second.created_at) - recordTime(first.created_at) ||
      displayNumber(second.display_id) - displayNumber(first.display_id)
  )[0] ?? null;
}

export function resolveFinancialStatus({
  invoice,
  splitChildren = [],
  invoiceIdsWithSendProof = new Set<string>(),
  hasEstimate = false,
  estimateStatus = null,
  fallbackStatus = null,
}: {
  invoice?: InvoiceLifecycleRecord | null;
  splitChildren?: InvoiceLifecycleRecord[];
  invoiceIdsWithSendProof?: Set<string>;
  hasEstimate?: boolean;
  estimateStatus?: string | null;
  fallbackStatus?: string | null;
}) {
  if (invoice && !isNonCollectibleInvoiceStatus(invoice.status)) {
    const activeSplitChildren = splitChildren.filter(
      (child) => !isNonCollectibleInvoiceStatus(child.status)
    );
    const hasSplitChildren = activeSplitChildren.length > 0;
    const invoicePackageIsPaid =
      isInvoicePaid(invoice) ||
      (hasSplitChildren && activeSplitChildren.every((child) => isInvoicePaid(child)));
    const invoicePackageWasSent =
      invoiceWasSent(invoice, invoiceIdsWithSendProof) ||
      (hasSplitChildren &&
        activeSplitChildren.every((child) =>
          invoiceWasSent(child, invoiceIdsWithSendProof)
        ));

    if (invoicePackageIsPaid) {
      return "Paid";
    }

    if (invoicePackageWasSent) {
      return "Invoice Sent";
    }

    return "Invoice Created";
  }

  const estimate = invoiceStatusKey(estimateStatus);

  if (estimate === "sent") {
    return "Estimate Sent";
  }

  if (hasEstimate) {
    return "Estimate Created";
  }

  return fallbackStatus || "Pending Estimate";
}
