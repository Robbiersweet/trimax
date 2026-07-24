import {
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
  split_parent_invoice_id?: string | null;
  split_children_count?: number | null;
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

