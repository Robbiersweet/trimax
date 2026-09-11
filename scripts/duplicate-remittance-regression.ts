import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  duplicateCheckNumbersCompatible,
  findDuplicateRemittance,
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
    paymentScreen.includes("duplicateOverrideClearedKey") &&
    paymentScreen.includes("duplicateEvidenceKey") &&
    paymentScreen.includes("duplicateOverrideConfirmed") &&
    paymentScreen.includes("workspaceRole"),
  "Payments UI must block active duplicates and require explicit owner/admin review for possible duplicates."
);
assert(
  applyBatchRoute.includes("findDuplicateRemittance") &&
    applyBatchRoute.includes("status === \"active\"") &&
    applyBatchRoute.includes("status === \"possible\"") &&
    applyBatchRoute.includes("Only an owner or admin can continue") &&
    applyBatchRoute.includes("payment.duplicate_override") &&
    applyBatchRoute.indexOf("findDuplicateRemittance") <
      applyBatchRoute.indexOf("const appliedInvoices = []"),
  "Server-side duplicate detection must run before payment mutations and audit owner/admin overrides."
);

console.log("Duplicate remittance regression checks passed.");
