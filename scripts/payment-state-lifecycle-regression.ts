import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findDuplicateRemittance,
  findRemittanceImageHints,
  type DuplicateRemittanceActivity,
} from "../src/app/lib/duplicateRemittance.ts";

const root = process.cwd();
const paymentScreen = readFileSync(
  resolve(root, "src/app/components/BatchInvoicePayments.tsx"),
  "utf8"
);

function activity({
  id,
  invoiceId,
  invoiceNumber,
  amount,
  checkNumber,
  fingerprint,
  invoiceCount,
}: {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  checkNumber: string;
  fingerprint: string;
  invoiceCount: number;
}): DuplicateRemittanceActivity {
  return {
    id,
    action: "invoice.batch_payment_applied",
    entityId: invoiceId,
    entityLabel: invoiceNumber,
    createdAt: "2026-09-12T12:00:00.000Z",
    details: {
      invoiceId,
      invoiceNumber,
      checkAmount: amount,
      paymentReference: checkNumber,
      checkDate: "2026-09-12",
      receivedDate: "2026-09-12",
      payor: "North Creek Apartments",
      batchInvoiceCount: invoiceCount,
      remittanceDocumentFingerprint: fingerprint,
    },
  };
}

const remittanceAFingerprint = "a".repeat(256);
const remittanceBFingerprint = "b".repeat(256);
const remittanceAActivities = [
  activity({
    id: "a-0506",
    invoiceId: "invoice-0506",
    invoiceNumber: "INV-0506",
    amount: 2252.95,
    checkNumber: "3101",
    fingerprint: remittanceAFingerprint,
    invoiceCount: 2,
  }),
  activity({
    id: "a-0507",
    invoiceId: "invoice-0507",
    invoiceNumber: "INV-0507",
    amount: 2252.95,
    checkNumber: "3101",
    fingerprint: remittanceAFingerprint,
    invoiceCount: 2,
  }),
];

const unrelatedBWithFreshPreOcrEvidence = findDuplicateRemittance(
  {
    amount: null,
    checkNumber: "",
    invoiceIds: [],
    invoiceNumbers: [],
    fingerprint: remittanceBFingerprint,
  },
  remittanceAActivities,
  "owner"
);

assert.equal(
  unrelatedBWithFreshPreOcrEvidence.status,
  "none",
  "A new unrelated scan must not inherit prior two-invoice evidence before OCR resolves B."
);

const stalePriorEvidenceWouldMisidentifyA = findDuplicateRemittance(
  {
    amount: 2252.95,
    checkNumber: "3101",
    checkDate: "2026-09-12",
    receivedDate: "2026-09-12",
    payor: "North Creek Apartments",
    invoiceIds: ["invoice-0506", "invoice-0507"],
    invoiceNumbers: ["INV-0506", "INV-0507"],
    fingerprint: remittanceBFingerprint,
  },
  remittanceAActivities,
  "owner"
);

assert.equal(
  stalePriorEvidenceWouldMisidentifyA.status,
  "active",
  "The regression fixture proves prior-remittance amount/invoice evidence would reproduce the observed duplicate modal."
);

assert(findRemittanceImageHints(remittanceAFingerprint,remittanceAActivities).length > 0, "The same image must remain discoverable for audit without authorizing a duplicate decision.");

const sameRemittanceScannedAgain = findDuplicateRemittance(
  {
    amount: null,
    checkNumber: "",
    invoiceIds: [],
    invoiceNumbers: [],
    fingerprint: remittanceAFingerprint,
  },
  remittanceAActivities,
  "owner"
);

assert.equal(
  sameRemittanceScannedAgain.status,
  "none",
  "An image fingerprint alone discovers candidates; it cannot establish a duplicate payment."
);

assert(
  paymentScreen.includes("type DuplicatePreflightEvidence") &&
    paymentScreen.includes("type DuplicatePreflightOutcome") &&
    paymentScreen.includes("evidence: DuplicatePreflightEvidence") &&
    paymentScreen.includes("formData.append(\"invoiceIds\", evidence.invoiceIds.join(\",\"))") &&
    paymentScreen.includes("formData.append(\"amount\", String(evidence.amount ?? \"\"))"),
  "Duplicate preflight request construction must use explicit current-document evidence, not ambient selected invoice state."
);
assert(
  paymentScreen.includes("invoiceIds: []") &&
    paymentScreen.includes("invoiceNumbers: []") &&
    paymentScreen.includes("amount: null") &&
    paymentScreen.includes("duplicatePreflight.fingerprint"),
  "Pre-OCR preflight for a new document must send no prior invoice or amount evidence and pass the current fingerprint into OCR parsing."
);
assert(
  paymentScreen.includes("function clearCurrentRemittanceReviewState()") &&
    paymentScreen.includes("setDuplicateRemittanceModal(null)") &&
    paymentScreen.includes("setDuplicateOverrideClearedKey(\"\")") &&
    paymentScreen.includes("setReversedDuplicateReviewedKey(\"\")") &&
    paymentScreen.includes("setRemittanceDocumentFingerprint(\"\")"),
  "Current-remittance duplicate modal, override, and fingerprint state must be clearable as transient state."
);
assert(
  paymentScreen.includes("function openCameraCapture") &&
    paymentScreen.includes("if (intent === \"primary\")") &&
    paymentScreen.includes("clearCurrentRemittanceReviewState();") &&
    paymentScreen.includes("setSelectedIds([])") &&
    paymentScreen.includes("setCapturedCheckAmount(\"\")"),
  "Starting a new primary camera capture must clear prior remittance review state before new OCR work begins."
);
assert(
  paymentScreen.includes("setPaymentEntryMode(\"complete\")") &&
    paymentScreen.includes("Payment applied.") &&
    paymentScreen.includes("setReviewMatchedInvoices([])") &&
    paymentScreen.includes("setPaymentReference(\"\")"),
  "Successful apply must clear transient review evidence while preserving the completed summary/history."
);
assert(
  paymentScreen.includes("Duplicate preflight returned invoice IDs:") &&
    paymentScreen.includes("Duplicate preflight invoice IDs:"),
  "Diagnostics must expose enough evidence to prove future duplicate-preflight isolation."
);

console.log("Payment state lifecycle regression checks passed.");
