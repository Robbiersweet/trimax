import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  duplicateCheckNumbersCompatible,
  findDuplicateRemittance,
  findRemittanceImageHints,
  normalizeDuplicateCheckNumber,
  type DuplicateRemittanceActivity,
} from "../src/app/lib/duplicateRemittance.ts";
import { extractCheckNumber } from "../src/app/lib/remittanceMatching.ts";

const root = process.cwd();

function paymentActivity({
  id,
  invoiceId,
  invoiceNumber,
  checkNumber = "2804",
  amount = 4505.9,
  payor = "North Creek Apartments",
  checkDate = "2026-08-15",
  receivedDate = "2026-08-16",
  fingerprint = "",
  reversed = false,
}: {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  checkNumber?: string;
  amount?: number;
  payor?: string;
  checkDate?: string;
  receivedDate?: string;
  fingerprint?: string;
  reversed?: boolean;
}): DuplicateRemittanceActivity {
  return {
    id,
    action: "invoice.batch_payment_applied",
    entityId: invoiceId,
    entityLabel: invoiceNumber,
    createdAt: "2026-08-16T12:00:00.000Z",
    details: {
      invoiceId,
      invoiceNumber,
      paymentReference: checkNumber,
      checkAmount: amount,
      payor,
      checkDate,
      receivedDate,
      remittanceDocumentFingerprint: fingerprint || null,
      batchInvoiceCount: 5,
      ...(reversed
        ? {
            paymentReversed: true,
            reversalDate: "2026-08-17",
            reversalReason: "Bank return corrected.",
          }
        : {}),
    },
  };
}

const northCreekInvoices = ["0520", "0521", "0522", "0524", "0525"].map(
  (suffix) => `inv-${suffix}`
);
const northCreekNumbers = ["0520", "0521", "0522", "0524", "0525"].map(
  (suffix) => `INV-${suffix}`
);
const activePaymentActivities = northCreekInvoices.map((invoiceId, index) =>
  paymentActivity({
    id: `log-${invoiceId}`,
    invoiceId,
    invoiceNumber: northCreekNumbers[index],
  })
);

const exactDuplicate = findDuplicateRemittance(
  {
    checkNumber: "2804",
    amount: 4505.9,
    checkDate: "2026-08-15",
    receivedDate: "2026-08-16",
    payor: "North Creek",
    invoiceIds: northCreekInvoices,
    invoiceNumbers: northCreekNumbers,
  },
  activePaymentActivities,
  "owner"
);

assert.equal(exactDuplicate.status, "active");
assert.equal(exactDuplicate.confidence, "exact");
assert.equal(exactDuplicate.payment?.invoiceCount, 5);
assert.equal(exactDuplicate.canOverride, false);

const droppedLeadingDigitDuplicate = findDuplicateRemittance(
  {
    checkNumber: "804",
    amount: 4505.9,
    checkDate: "2026-08-15",
    receivedDate: "2026-08-16",
    payor: "North Creek Apartments",
    invoiceIds: northCreekInvoices,
    invoiceNumbers: northCreekNumbers,
  },
  activePaymentActivities,
  "owner"
);

assert.equal(droppedLeadingDigitDuplicate.status, "active");
assert(
  droppedLeadingDigitDuplicate.reasons.includes("compatible check number"),
  "Dropped-leading-digit check OCR must contribute without being the only proof."
);

const paidInvoiceIdentityDuplicate = findDuplicateRemittance(
  {
    checkNumber: "2804",
    amount: 4505.93,
    checkDate: "2026-08-15",
    receivedDate: "2026-08-16",
    payor: "North Creek Apartments",
    invoiceIds: northCreekInvoices,
    invoiceNumbers: northCreekNumbers,
  },
  activePaymentActivities,
  "owner"
);

assert.equal(
  paidInvoiceIdentityDuplicate.status,
  "active",
  "Paid/non-collectible OCR invoice identities must still identify an already-applied remittance before payment eligibility rejects them."
);
assert(
  paidInvoiceIdentityDuplicate.reasons.includes("near amount"),
  "A small OCR amount error must be duplicate evidence without rewriting the parsed amount."
);

const imperfectCheckNearAmountDuplicate = findDuplicateRemittance(
  {
    checkNumber: "804",
    amount: 4505.93,
    payor: "North Creek",
    invoiceIds: northCreekInvoices,
    invoiceNumbers: northCreekNumbers,
  },
  activePaymentActivities,
  "owner"
);

assert.equal(
  imperfectCheckNearAmountDuplicate.status,
  "active",
  "Compatible invoice history plus small check/amount OCR defects must still block an active duplicate."
);

const unrelatedInvoiceSet = findDuplicateRemittance(
  {
    checkNumber: "2804",
    amount: 4505.9,
    payor: "North Creek Apartments",
    invoiceIds: ["inv-9999"],
    invoiceNumbers: ["INV-9999"],
  },
  activePaymentActivities,
  "owner"
);

assert.equal(
  unrelatedInvoiceSet.status,
  "none",
  "Same amount with an unrelated invoice set must not become an exact duplicate."
);

const reusedCheckDifferentPayor = findDuplicateRemittance(
  {
    checkNumber: "2804",
    amount: 4505.9,
    payor: "Other Property",
    invoiceIds: ["inv-9999"],
    invoiceNumbers: ["INV-9999"],
  },
  activePaymentActivities,
  "owner"
);

assert.equal(
  reusedCheckDifferentPayor.status,
  "none",
  "A reused check number in unrelated payer context must not blindly auto-block."
);

const reversedDuplicate = findDuplicateRemittance(
  {
    checkNumber: "2804",
    amount: 4505.9,
    payor: "North Creek Apartments",
    invoiceIds: northCreekInvoices,
    invoiceNumbers: northCreekNumbers,
  },
  northCreekInvoices.map((invoiceId, index) =>
    paymentActivity({
      id: `reversed-${invoiceId}`,
      invoiceId,
      invoiceNumber: northCreekNumbers[index],
      reversed: true,
    })
  ),
  "manager"
);

assert.equal(reversedDuplicate.status, "reversed");
assert.equal(reversedDuplicate.canOverride, true);
assert.equal(reversedDuplicate.payment?.reversalDate, "2026-08-17");

const possibleDuplicate = findDuplicateRemittance(
  {
    checkNumber: "804",
    amount: 4505.9,
    payor: "North Creek Apartments",
    invoiceIds: ["inv-0520", "inv-0521"],
    invoiceNumbers: ["INV-0520", "INV-0521"],
  },
  activePaymentActivities,
  "owner"
);

assert.equal(possibleDuplicate.status, "possible");
assert.equal(possibleDuplicate.ownerOverrideRequired, true);
assert.equal(possibleDuplicate.canOverride, true);

const managerPossibleDuplicate = findDuplicateRemittance(
  {
    checkNumber: "804",
    amount: 4505.9,
    payor: "North Creek Apartments",
    invoiceIds: ["inv-0520", "inv-0521"],
    invoiceNumbers: ["INV-0520", "INV-0521"],
  },
  activePaymentActivities,
  "manager"
);

assert.equal(managerPossibleDuplicate.status, "possible");
assert.equal(managerPossibleDuplicate.canOverride, false);

const strongFingerprint =
  "f".repeat(256);
const nearFingerprint =
  "f".repeat(250) + "0".repeat(6);
const looseFingerprint =
  "f".repeat(236) + "0".repeat(20);
const unrelatedFingerprint =
  "0".repeat(256);
const fingerprintActivities = northCreekInvoices.map((invoiceId, index) =>
  paymentActivity({
    id: `fingerprint-${invoiceId}`,
    invoiceId,
    invoiceNumber: northCreekNumbers[index],
    fingerprint: strongFingerprint,
  })
);

const partialOcrDuplicate = findDuplicateRemittance(
  {
    fingerprint: strongFingerprint,
  },
  fingerprintActivities,
  "manager"
);

assert.equal(
  partialOcrDuplicate.status,
  "none",
  "An average-image hash alone cannot establish document identity, even at distance zero."
);
assert.equal(findRemittanceImageHints(strongFingerprint, fingerprintActivities).length, 1);

const partialOcrPossible = findDuplicateRemittance(
  {
    fingerprint: looseFingerprint,
  },
  fingerprintActivities,
  "owner"
);

assert.equal(
  partialOcrPossible.status,
  "none",
  "Template similarity without document evidence must continue OCR."
);
assert.equal(partialOcrPossible.canOverride, false);

const imageWithContextDuplicate = findDuplicateRemittance(
  {
    amount: 4505.9,
    payor: "North Creek",
    fingerprint: nearFingerprint,
  },
  fingerprintActivities,
  "owner"
);

assert.equal(
  imageWithContextDuplicate.status,
  "possible",
  "Image similarity and amount overlap warrant review after OCR, not an exact identity claim."
);

const unrelatedLayout = findDuplicateRemittance(
  {
    amount: 4505.9,
    payor: "Other Property",
    fingerprint: unrelatedFingerprint,
  },
  fingerprintActivities,
  "owner"
);

assert.equal(
  unrelatedLayout.status,
  "none",
  "An unrelated remittance with similar workflow context must not be blocked without fingerprint similarity."
);

assert.equal(
  activePaymentActivities.length,
  5,
  "Duplicate detection helper must not mutate payment activity input."
);

assert.equal(normalizeDuplicateCheckNumber("Check #002804"), "2804");
assert.equal(duplicateCheckNumbersCompatible("804", "2804"), true);
assert.equal(duplicateCheckNumbersCompatible("904", "2804"), false);
assert.equal(
  extractCheckNumber("CHECK #: 804\nCHECK NUMBER 2804\nTOTAL: $4,505.90"),
  "2804",
  "Full check token must win when OCR/header evidence includes both 804 and 2804."
);
assert.equal(
  extractCheckNumber("CHECK #: 804\nTOTAL: $4,505.90"),
  "804",
  "The parser must keep 804 when no fuller check-number evidence exists."
);
assert.equal(
  extractCheckNumber("CHECK #: 804\nCHECK NUMBER 2904\nTOTAL: $4,505.90"),
  "804",
  "Conflicting incompatible check-number candidates must not invent a different number."
);

const paymentScreen = readFileSync(
  resolve(root, "src/app/components/BatchInvoicePayments.tsx"),
  "utf8"
);
const applyBatchRoute = readFileSync(
  resolve(root, "src/app/api/payments/apply-batch/route.ts"),
  "utf8"
);
const duplicatePreflightRoute = readFileSync(
  resolve(root, "src/app/api/payments/duplicate-remittance-preflight/route.ts"),
  "utf8"
);
const nextConfig = readFileSync(resolve(root, "next.config.ts"), "utf8");

assert(
  paymentScreen.includes("Remittance Already Applied") &&
    paymentScreen.includes("This check stub has already been applied.") &&
    paymentScreen.includes("No duplicate payment will be created.") &&
    paymentScreen.includes("Previously Applied — Payment Reversed") &&
    paymentScreen.includes("Possible Duplicate Remittance") &&
    paymentScreen.includes("Continue After Review") &&
    paymentScreen.includes("Owner or admin review is required to continue."),
  "Duplicate modal must be polished, explicit, and cover active, reversed, and possible states."
);
assert(
    paymentScreen.includes("duplicateRemittanceCheck.status === \"active\"") &&
    paymentScreen.includes("runDuplicateRemittancePreflight") &&
    paymentScreen.includes("/api/payments/duplicate-remittance-preflight") &&
    paymentScreen.includes("Duplicate remittance preflight:") &&
    paymentScreen.includes("setDuplicateRemittanceModal") &&
    paymentScreen.includes("duplicateOverrideClearedKey") &&
    paymentScreen.includes("duplicateEvidenceKey") &&
    paymentScreen.includes("duplicateOverrideConfirmed") &&
    paymentScreen.includes("remittanceDocumentFingerprint") &&
    paymentScreen.includes("duplicateEvidenceInvoiceIds") &&
    paymentScreen.includes("match.matchTrace") &&
    paymentScreen.includes("workspaceRole"),
  "Payments UI must run duplicate detection before OCR and after OCR identity extraction, block active duplicates, and require explicit owner/admin review for possible duplicates."
);
assert(
  applyBatchRoute.includes("findDuplicateRemittance") &&
    applyBatchRoute.includes("remittanceDocumentFingerprint") &&
    applyBatchRoute.includes("createRemittanceDocumentFingerprint") &&
    applyBatchRoute.includes("isPaymentEligibleInvoice") &&
    applyBatchRoute.includes("is not collectible and cannot receive a payment") &&
    applyBatchRoute.includes("status === \"active\"") &&
    applyBatchRoute.includes("status === \"possible\"") &&
    applyBatchRoute.includes("Only an owner or admin can continue") &&
    applyBatchRoute.includes("payment.duplicate_override") &&
    applyBatchRoute.indexOf("findDuplicateRemittance") <
      applyBatchRoute.indexOf("const appliedInvoices = []"),
  "Server-side duplicate detection must run before payment mutations and audit owner/admin overrides."
);
assert(
  applyBatchRoute.includes("rollbackAppliedMutations") &&
    applyBatchRoute.includes("insertedActivityLogIds") &&
    applyBatchRoute.includes("payment_audit_insert_failed") &&
    applyBatchRoute.includes("duplicate_override_audit_failed") &&
    applyBatchRoute.indexOf("findDuplicateRemittance") <
      applyBatchRoute.indexOf("invoiceRollbackSnapshots"),
  "Duplicate protection must remain inside the atomic apply-batch envelope without breaking valid new payments."
);
assert(
  duplicatePreflightRoute.includes("createRemittanceDocumentFingerprint") &&
    duplicatePreflightRoute.includes("fingerprintStoredPaymentImage") &&
    duplicatePreflightRoute.includes("trimax-payment-images") &&
    duplicatePreflightRoute.includes("findDuplicateRemittance") &&
    duplicatePreflightRoute.includes("request.formData()") &&
    duplicatePreflightRoute.includes("remittanceImage") &&
    duplicatePreflightRoute.includes("priorImagesCompared") &&
    duplicatePreflightRoute.includes("DuplicateRemittanceActivity") &&
    duplicatePreflightRoute.includes("return NextResponse.json({") &&
    !duplicatePreflightRoute.includes(".insert(") &&
    !duplicatePreflightRoute.includes(".update("),
  "Early duplicate preflight must compare current image evidence to persisted remittance evidence without mutating payments or invoices."
);
assert(
  nextConfig.includes("\"/api/payments/apply-batch\"") &&
    nextConfig.includes("\"/api/payments/duplicate-remittance-preflight\"") &&
    nextConfig.includes("./node_modules/sharp/**/*") &&
    nextConfig.includes("./node_modules/@img/sharp-linux-x64/**/*") &&
    nextConfig.includes("./node_modules/@img/sharp-libvips-linux-x64/**/*"),
  "Duplicate-remittance payment routes must include Sharp native binaries because fingerprinting imports Sharp at route load."
);

console.log("Duplicate remittance regression checks passed.");

// Reported incident: 77 bits differ out of 1024; old policy interrupted OCR.
const incidentHash = "0".repeat(19) + "7" + "f".repeat(236);
const priorTwo = ["0506", "0507"].map((number) => paymentActivity({ id: "prior-" + number, invoiceId: "inv-" + number, invoiceNumber: "INV-" + number, amount: 2252.95, checkNumber: "", fingerprint: strongFingerprint }));
const before = JSON.stringify(priorTwo);
const hints = findRemittanceImageHints(incidentHash, priorTwo);
assert.equal(hints[0].distance, 77);
assert.equal(findDuplicateRemittance({ fingerprint: incidentHash }, priorTwo).status, "none");
assert.equal(findDuplicateRemittance({ fingerprint: incidentHash, payor: "North Creek Apartments" }, priorTwo).status, "none");
for (const fingerprint of [incidentHash, strongFingerprint]) {
  const five = ["0513", "0514", "0515", "0518", "0519"];
  assert.equal(findDuplicateRemittance({ fingerprint, amount: 5495, checkNumber: "2797", payor: "North Creek Apartments", invoiceIds: five.map(n => "inv-" + n), invoiceNumbers: five.map(n => "INV-" + n) }, priorTwo).status, "none");
}
assert.equal(findDuplicateRemittance({ fingerprint: incidentHash, amount: 2252.95, payor: "North Creek Apartments", invoiceIds: ["inv-0506", "inv-0507"] }, priorTwo).status, "active");
assert.equal(JSON.stringify(priorTwo), before);
assert.equal(findRemittanceImageHints("f", priorTwo).length, 0);

assert.equal(findDuplicateRemittance({ checkNumber: "2804", amount: 4505.9, invoiceIds: northCreekInvoices, invoiceNumbers: northCreekNumbers, payor: "North Creek Apartments", receivedDate: "2026-09-16" }, activePaymentActivities).status, "active", "Rescanning later does not change document identity.");
