import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPaymentTimelinessSnapshot,
  summarizePaymentTimeliness,
  timelinessLogFromActivity,
} from "../src/app/lib/paymentTimeliness.ts";

const root = process.cwd();

const baseInvoice = {
  id: "invoice-1",
  business_id: "business-1",
  client_id: "client-1",
  customer_name: "North Creek Apartments",
  display_id: "INV-0600",
  invoice_amount: 1000,
  amount_paid: 0,
  due_date: "2026-07-01",
  status: "Sent",
};

const beforeDue = createPaymentTimelinessSnapshot({
  invoice: baseInvoice,
  fullyPaidDate: "2026-06-30",
  finalPaymentReference: "3001",
  recordedAt: "2026-06-30T12:00:00.000Z",
});
assert(beforeDue);
assert.equal(beforeDue.paidLate, false);
assert.equal(beforeDue.daysLate, 0);

const onDue = createPaymentTimelinessSnapshot({
  invoice: baseInvoice,
  fullyPaidDate: "2026-07-01",
});
assert(onDue);
assert.equal(onDue.paidLate, false);
assert.equal(onDue.daysLate, 0);

const afterDue = createPaymentTimelinessSnapshot({
  invoice: baseInvoice,
  fullyPaidDate: "2026-07-08",
  finalPaymentReference: "3002",
});
assert(afterDue);
assert.equal(afterDue.paidLate, true);
assert.equal(afterDue.daysLate, 7);

const partialPaymentLog = timelinessLogFromActivity({
  id: "log-partial",
  entity_id: "invoice-1",
  entity_label: "INV-0600",
  created_at: "2026-07-08T12:00:00.000Z",
  details: {
    paymentCompletedInvoice: false,
    paymentOutcome: "partial",
    paymentDate: "2026-07-08",
    dueDateAtPayment: "2026-07-01",
  },
});
assert.equal(
  partialPaymentLog,
  null,
  "Partial payment must not establish final payment-timeliness history."
);

const finalPaymentLog = timelinessLogFromActivity({
  id: "log-final",
  entity_id: "invoice-1",
  entity_label: "INV-0600",
  created_at: "2026-07-08T12:00:00.000Z",
  details: {
    ...afterDue,
    paymentCompletedInvoice: true,
  },
});
assert(finalPaymentLog);
assert.equal(finalPaymentLog.fullyPaidDate, "2026-07-08");
assert.equal(finalPaymentLog.dueDateAtCompletion, "2026-07-01");
assert.equal(finalPaymentLog.daysLate, 7);

const checkDateEarlierThanReceivedDate = timelinessLogFromActivity({
  id: "log-received-date",
  entity_id: "invoice-1",
  entity_label: "INV-0600",
  created_at: "2026-08-24T12:00:00.000Z",
  details: {
    ...afterDue,
    checkDate: "2026-06-26",
    receivedDate: "2026-07-08",
    fullyPaidDate: "2026-07-08",
    paymentDate: "2026-07-08",
    paymentCompletedInvoice: true,
  },
});
assert(checkDateEarlierThanReceivedDate);
assert.equal(
  checkDateEarlierThanReceivedDate.fullyPaidDate,
  "2026-07-08",
  "Late-payment tracking must use Received Date, not the check/remittance date."
);
assert.equal(checkDateEarlierThanReceivedDate.daysLate, 7);

const lateAppliedDateDoesNotChangeReceivedDate = timelinessLogFromActivity({
  id: "log-applied-later",
  entity_id: "invoice-1",
  entity_label: "INV-0600",
  created_at: "2026-08-24T12:00:00.000Z",
  details: {
    ...afterDue,
    checkDate: "2026-06-26",
    receivedDate: "2026-07-01",
    fullyPaidDate: "2026-07-01",
    daysLate: 0,
    paidLate: false,
    paymentCompletedInvoice: true,
  },
});
assert(lateAppliedDateDoesNotChangeReceivedDate);
assert.equal(lateAppliedDateDoesNotChangeReceivedDate.fullyPaidDate, "2026-07-01");
assert.equal(lateAppliedDateDoesNotChangeReceivedDate.daysLate, 0);

const legacyPaymentLog = timelinessLogFromActivity({
  id: "log-legacy",
  entity_id: "invoice-1",
  entity_label: "INV-0600",
  created_at: "2026-07-08T12:00:00.000Z",
  details: {
    ...afterDue,
    paymentCompletedInvoice: true,
  },
});
assert(legacyPaymentLog);
assert.equal(
  legacyPaymentLog.fullyPaidDate,
  "2026-07-08",
  "Legacy payment activity must remain readable through fullyPaidDate."
);

const editedDueDateWouldNotRewriteSnapshot = timelinessLogFromActivity({
  id: "log-final",
  entity_id: "invoice-1",
  entity_label: "INV-0600",
  created_at: "2026-07-08T12:00:00.000Z",
  details: {
    ...afterDue,
    dueDateAtCompletion: "2026-07-01",
    paymentCompletedInvoice: true,
  },
});
assert.equal(
  editedDueDateWouldNotRewriteSnapshot?.dueDateAtCompletion,
  "2026-07-01",
  "Historical reports must use the snapshot due date, not the current invoice due date."
);

const voidInvoice = createPaymentTimelinessSnapshot({
  invoice: {
    ...baseInvoice,
    id: "void",
    status: "void",
  },
  fullyPaidDate: "2026-07-08",
});
assert.equal(voidInvoice, null);

const supersededInvoice = createPaymentTimelinessSnapshot({
  invoice: {
    ...baseInvoice,
    id: "superseded",
    status: "superseded",
  },
  fullyPaidDate: "2026-07-08",
});
assert.equal(supersededInvoice, null);

const splitSourceParent = createPaymentTimelinessSnapshot({
  invoice: {
    ...baseInvoice,
    id: "split-parent",
    split_children_count: 2,
  },
  fullyPaidDate: "2026-07-08",
});
assert.equal(splitSourceParent, null);

const splitChild = createPaymentTimelinessSnapshot({
  invoice: {
    ...baseInvoice,
    id: "split-child",
    split_parent_invoice_id: "split-parent",
  },
  fullyPaidDate: "2026-07-08",
});
assert(splitChild);
assert.equal(splitChild.paidLate, true);

const stats = summarizePaymentTimeliness([
  finalPaymentLog,
  {
    ...finalPaymentLog,
    logId: "log-on-time",
    invoiceId: "invoice-2",
    invoiceNumber: "INV-0601",
    fullyPaidDate: "2026-07-01",
    daysLate: 0,
    paidLate: false,
  },
]);
assert.equal(stats.completedInvoices, 2);
assert.equal(stats.onTimePayments, 1);
assert.equal(stats.latePayments, 1);
assert.equal(stats.onTimePercent, 50);
assert.equal(stats.averageDaysLate, 7);
assert.equal(stats.worstLatePayment?.invoiceId, "invoice-1");

const applyBatchRoute = readFileSync(
  resolve(root, "src/app/api/payments/apply-batch/route.ts"),
  "utf8"
);
assert(
  applyBatchRoute.includes("createPaymentTimelinessSnapshot") &&
    applyBatchRoute.includes("paymentCompletedInvoice") &&
    applyBatchRoute.includes("dueDateAtCompletion") &&
    applyBatchRoute.includes("fullyPaidDate") &&
    applyBatchRoute.includes("daysLate") &&
    applyBatchRoute.includes("paidLate"),
  "Server-side payment application must record immutable payment-timeliness snapshots."
);
assert(
  applyBatchRoute.includes("receivedDate = paymentDateKey") &&
    applyBatchRoute.includes("body.receivedDate ?? body.paymentDate") &&
    applyBatchRoute.includes("checkDate = optionalDateKey(body.checkDate)") &&
    applyBatchRoute.includes("paymentDate: receivedDate") &&
    applyBatchRoute.includes("receivedDate") &&
    applyBatchRoute.includes("checkDate") &&
    applyBatchRoute.includes("payor = cleanString(body.payor") &&
    applyBatchRoute.includes("payor,"),
  "Payment application must store Check Date separately and use Received Date for legacy paymentDate/timeliness."
);
assert(
  applyBatchRoute.includes("isFullyPaid") &&
    applyBatchRoute.includes("paymentOutcome: isFullyPaid ? \"paid\" : \"partial\""),
  "Only the final payment should establish the completed payment history result."
);

const batchInvoicePayments = readFileSync(
  resolve(root, "src/app/components/BatchInvoicePayments.tsx"),
  "utf8"
);
assert(
  batchInvoicePayments.includes("const [checkDate, setCheckDate] = useState(\"\")") &&
    batchInvoicePayments.includes("const [receivedDate, setReceivedDate] = useState(todayInputValue())") &&
    batchInvoicePayments.includes("label=\"Check Date\"") &&
    batchInvoicePayments.includes("label=\"Received Date\"") &&
    batchInvoicePayments.includes("setCheckDate(extractedDate)") &&
    !batchInvoicePayments.includes("setPaymentDate(extractedDate)") &&
    batchInvoicePayments.includes("paymentDate: receivedDate") &&
    batchInvoicePayments.includes("receivedDate,") &&
    batchInvoicePayments.includes("checkDate,") &&
    batchInvoicePayments.includes("submittedPaymentReference") &&
    batchInvoicePayments.includes("submittedPayor") &&
    batchInvoicePayments.includes("payor: submittedPayor") &&
    batchInvoicePayments.includes("result.payor || submittedPayor") &&
    batchInvoicePayments.includes("router.refresh();"),
  "Payment review must route OCR dates to Check Date while Received Date defaults to today and is submitted separately."
);

const paymentsPage = readFileSync(resolve(root, "src/app/payments/page.tsx"), "utf8");
assert(
  paymentsPage.includes("Payment History") &&
    paymentsPage.includes("paymentHistory") &&
    paymentsPage.includes("paymentFrom") &&
    paymentsPage.includes("paymentTo") &&
    paymentsPage.includes("paymentClient") &&
    paymentsPage.includes("Paid on time") &&
    paymentsPage.includes("days late"),
  "Payments page must expose filtered historical late-payment reporting."
);
assert(
  paymentsPage.includes("Check Date") &&
    paymentsPage.includes("Received Date") &&
    paymentsPage.includes("Payor") &&
    paymentsPage.includes("detailText(details.receivedDate)") &&
    paymentsPage.includes("detailText(details.paymentDate)") &&
    paymentsPage.includes("Received {formatDate(log.fullyPaidDate)}"),
  "Payments page must display Check Date separately and label the timeliness date as Received Date."
);

const clientDetailPage = readFileSync(
  resolve(root, "src/app/clients/[id]/page.tsx"),
  "utf8"
);
assert(
  clientDetailPage.includes("trimax.client.payment-history") &&
    clientDetailPage.includes("Open history") &&
    clientDetailPage.includes("paymentClient"),
  "Client detail must provide a compact path into read-only payment history."
);

console.log("Payment timeliness regression checks passed.");
