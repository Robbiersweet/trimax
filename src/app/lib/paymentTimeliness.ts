export type PaymentTimelinessInvoiceLineItem = {
  description?: string | null;
  quantity?: string | number | null;
  unit_price?: string | number | null;
  line_total?: string | number | null;
};

export type PaymentTimelinessInvoiceBase = {
  id?: string | null;
  status?: string | null;
  invoice_amount?: string | number | null;
  amount_paid?: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  due_date?: string | null;
  split_parent_invoice_id?: string | null;
  split_children_count?: number | null;
};

export type PaymentTimelinessInvoice = PaymentTimelinessInvoiceBase & {
  business_id?: string | null;
  client_id?: string | null;
  customer_name?: string | null;
  display_id?: string | null;
};

export type PaymentTimelinessSnapshot = {
  invoiceId: string;
  businessId: string | null;
  clientId: string | null;
  customerName: string;
  invoiceNumber: string;
  dueDateAtCompletion: string;
  fullyPaidDate: string;
  daysLate: number;
  paidLate: boolean;
  finalPaymentReference: string;
  recordedAt: string;
};

export type PaymentTimelinessLog = PaymentTimelinessSnapshot & {
  logId: string;
  createdAt: string | null;
};

export type PaymentTimelinessStats = {
  completedInvoices: number;
  onTimePayments: number;
  latePayments: number;
  onTimePercent: number;
  averageDaysLate: number;
  worstLatePayment: PaymentTimelinessLog | null;
  latestLatePayment: PaymentTimelinessLog | null;
};

export type PaymentTimelinessActivityLog = {
  id: string;
  entity_id?: string | null;
  entity_label?: string | null;
  details: Record<string, unknown> | null;
  created_at?: string | null;
};

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

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function moneyNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]+/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function statusKey(value: string | null | undefined) {
  return (value || "Draft")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function isNonCollectibleStatus(value: string | null | undefined) {
  return [
    "void",
    "voided",
    "cancelled",
    "canceled",
    "superseded",
    "corrected",
    "archived",
  ].includes(statusKey(value));
}

function hasMeaningfulLineItems(lineItems: PaymentTimelinessInvoiceLineItem[]) {
  return lineItems.some((item) => {
    const description = cleanString(item.description);
    const savedLineTotal = moneyNumber(item.line_total);
    const calculatedLineTotal =
      moneyNumber(item.quantity) * moneyNumber(item.unit_price);

    return Boolean(description) && Math.max(savedLineTotal, calculatedLineTotal) > 0;
  });
}

function hasActiveDepositRequest(invoice: PaymentTimelinessInvoiceBase) {
  return (
    statusKey(invoice.deposit_status) === "requested" &&
    moneyNumber(invoice.deposit_requested_amount) > 0
  );
}

function collectionAmountDue(invoice: PaymentTimelinessInvoiceBase) {
  if (isNonCollectibleStatus(invoice.status)) {
    return 0;
  }

  const invoiceAmount = moneyNumber(invoice.invoice_amount);
  const amountPaid = moneyNumber(invoice.amount_paid);
  const fullAmountDue = Math.max(invoiceAmount - amountPaid, 0);

  return hasActiveDepositRequest(invoice)
    ? Math.max(moneyNumber(invoice.deposit_requested_amount) - amountPaid, 0)
    : fullAmountDue;
}

function isEligiblePaymentTarget({
  invoice,
  lineItems,
}: {
  invoice: PaymentTimelinessInvoiceBase;
  lineItems: PaymentTimelinessInvoiceLineItem[];
}) {
  const status = statusKey(invoice.status);
  const incompleteDraft =
    status === "draft" &&
    (moneyNumber(invoice.invoice_amount) <= 0 ||
      !hasMeaningfulLineItems(lineItems));

  return (
    status !== "paid" &&
    status !== "draft" &&
    !isNonCollectibleStatus(invoice.status) &&
    collectionAmountDue(invoice) > 0 &&
    Number(invoice.split_children_count ?? 0) <= 0 &&
    !incompleteDraft
  );
}

function businessDateKey(date: Date = new Date(), timeZone = "America/Los_Angeles") {
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

function invoiceDateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const key = String(value).slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function paymentDateKey(value: string | null | undefined) {
  const key = invoiceDateKey(value);

  return key || businessDateKey();
}

export function createPaymentTimelinessSnapshot({
  invoice,
  lineItems = [],
  fullyPaidDate,
  finalPaymentReference = "",
  recordedAt = new Date().toISOString(),
}: {
  invoice: PaymentTimelinessInvoice;
  lineItems?: PaymentTimelinessInvoiceLineItem[];
  fullyPaidDate: string;
  finalPaymentReference?: string;
  recordedAt?: string;
}) {
  const dueDateAtCompletion = invoiceDateKey(invoice.due_date);
  const paidDate = paymentDateKey(fullyPaidDate);

  if (
    !invoice.id ||
    !dueDateAtCompletion ||
    !isEligiblePaymentTarget({ invoice, lineItems }) ||
    moneyNumber(invoice.invoice_amount) <= 0
  ) {
    return null;
  }

  const daysLate = daysBetweenDateKeys(paidDate, dueDateAtCompletion);

  if (daysLate === null) {
    return null;
  }

  return {
    invoiceId: invoice.id,
    businessId: invoice.business_id ?? null,
    clientId: invoice.client_id ?? null,
    customerName: cleanString(invoice.customer_name) || "Unknown Customer",
    invoiceNumber: cleanString(invoice.display_id) || "Invoice",
    dueDateAtCompletion,
    fullyPaidDate: paidDate,
    daysLate: Math.max(daysLate, 0),
    paidLate: daysLate > 0,
    finalPaymentReference: cleanString(finalPaymentReference),
    recordedAt,
  } satisfies PaymentTimelinessSnapshot;
}

export function timelinessLogFromActivity(
  log: PaymentTimelinessActivityLog
): PaymentTimelinessLog | null {
  const details = log.details ?? {};
  const invoiceId = cleanString(details.invoiceId) || cleanString(log.entity_id);
  const dueDateAtCompletion = invoiceDateKey(
    cleanString(details.dueDateAtCompletion)
  );
  const fullyPaidDate = invoiceDateKey(cleanString(details.fullyPaidDate));
  const rawDaysLate = Number(details.daysLate ?? 0);

  if (
    !invoiceId ||
    !dueDateAtCompletion ||
    !fullyPaidDate ||
    !Number.isFinite(rawDaysLate) ||
    details.paymentCompletedInvoice !== true
  ) {
    return null;
  }

  return {
    logId: log.id,
    invoiceId,
    businessId: cleanString(details.businessId) || null,
    clientId: cleanString(details.clientId) || null,
    customerName: cleanString(details.customerName) || "Unknown Customer",
    invoiceNumber:
      cleanString(details.invoiceNumber) ||
      cleanString(log.entity_label) ||
      "Invoice",
    dueDateAtCompletion,
    fullyPaidDate,
    daysLate: Math.max(Math.round(rawDaysLate), 0),
    paidLate: details.paidLate === true,
    finalPaymentReference: cleanString(details.finalPaymentReference),
    recordedAt: cleanString(details.recordedAt) || log.created_at || "",
    createdAt: log.created_at ?? null,
  };
}

export function summarizePaymentTimeliness(logs: PaymentTimelinessLog[]) {
  const completedInvoices = logs.length;
  const lateLogs = logs.filter((log) => log.paidLate);
  const onTimePayments = completedInvoices - lateLogs.length;
  const averageDaysLate =
    lateLogs.length === 0
      ? 0
      : lateLogs.reduce((total, log) => total + log.daysLate, 0) /
        lateLogs.length;
  const worstLatePayment =
    [...lateLogs].sort(
      (first, second) =>
        second.daysLate - first.daysLate ||
        second.fullyPaidDate.localeCompare(first.fullyPaidDate)
    )[0] ?? null;
  const latestLatePayment =
    [...lateLogs].sort((first, second) =>
      second.fullyPaidDate.localeCompare(first.fullyPaidDate)
    )[0] ?? null;

  return {
    completedInvoices,
    onTimePayments,
    latePayments: lateLogs.length,
    onTimePercent:
      completedInvoices === 0
        ? 0
        : Math.round((onTimePayments / completedInvoices) * 100),
    averageDaysLate: Number(averageDaysLate.toFixed(1)),
    worstLatePayment,
    latestLatePayment,
  } satisfies PaymentTimelinessStats;
}
