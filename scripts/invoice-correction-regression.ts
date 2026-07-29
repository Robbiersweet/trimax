import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCorrectionAuditDetails,
  buildCorrectionEmailMessage,
  buildCorrectionEmailSubject,
  buildOriginalCorrectionNote,
  buildReplacementCorrectionNote,
  cleanGeneratedCorrectionNotes,
  displayDocumentList,
  extractCorrectionOriginalDisplayId,
  extractReplacementDisplayIds,
} from "../src/app/lib/invoiceCorrections.ts";

const root = process.cwd();

const reason = "renovation scope required corrected pricing";
const originalNote = buildOriginalCorrectionNote({
  existingNotes:
    "Prior Reno - Greystar\nCorrection: superseded by INV-0517. Reason: stale note",
  replacementDisplayIds: ["INV-0521", "INV-0522"],
  reason,
});

assert.equal(
  originalNote,
  "Prior Reno - Greystar\nCorrection: superseded by INV-0521 and INV-0522. Reason: renovation scope required corrected pricing"
);
assert.deepEqual(extractReplacementDisplayIds(originalNote), [
  "INV-0521",
  "INV-0522",
]);

const childNote = buildReplacementCorrectionNote({
  existingNotes:
    "Review scope and pricing before sending.\nPrior Reno - Greystar\nCreated from INV-0517 as Split 1 of 2.",
  originalDisplayId: "INV-0516",
  replacementDisplayIds: ["INV-0521", "INV-0522"],
});

assert.equal(
  childNote,
  "Correction of INV-0516. Part of replacement split group INV-0521 and INV-0522.\nPrior Reno - Greystar"
);
assert.equal(extractCorrectionOriginalDisplayId(childNote), "INV-0516");
assert.equal(
  cleanGeneratedCorrectionNotes(childNote),
  "Prior Reno - Greystar"
);

const auditDetails = buildCorrectionAuditDetails({
  original: {
    id: "original-id",
    displayId: "INV-0516",
    amount: "$1099.00",
    status: "sent",
    sentAt: "2026-07-21T12:00:00.000Z",
  },
  replacementGroup: [
    {
      id: "split-1",
      displayId: "INV-0521",
      amount: "$1300.00",
      status: "Draft",
    },
    {
      id: "split-2",
      displayId: "INV-0522",
      amount: "$458.40",
      status: "Draft",
    },
  ],
  reason,
  correctedByUserId: "owner-user",
  correctedByEmail: "owner@example.com",
  correctedAt: "2026-07-29T12:00:00.000Z",
  intermediateSplitSourceId: "source-id",
  intermediateSplitSourceDisplayId: "INV-0517",
});

assert.equal(auditDetails.originalDisplayId, "INV-0516");
assert.equal(auditDetails.originalAmount, 1099);
assert.deepEqual(auditDetails.replacementDisplayIds, [
  "INV-0521",
  "INV-0522",
]);
assert.equal(auditDetails.replacementCombinedTotal, 1758.4);
assert.equal(auditDetails.nonCollectible, true);
assert.equal(auditDetails.intermediateSplitSourceDisplayId, "INV-0517");

assert.equal(
  displayDocumentList(["INV-0521", "INV-0522"]),
  "INV-0521 and INV-0522"
);
assert.equal(
  buildCorrectionEmailSubject({
    projectTitle: "Unit P01 renovation",
    fallbackLabel: "P01",
  }),
  "Corrected invoices for Unit P01 renovation"
);
assert.equal(
  buildCorrectionEmailMessage({
    documentNumbers: ["INV-0521", "INV-0522"],
    projectTitle: "Unit P01 full primer and paint",
    originalDisplayId: "INV-0516",
    combinedTotal: "$1,758.40",
  }),
  "Attached are corrected invoices INV-0521 and INV-0522 for Unit P01 full primer and paint. These replace the previously issued invoice INV-0516. Both official invoice PDFs are attached. Combined total: $1,758.40."
);

const eligibilitySource = readFileSync(
  resolve(root, "src/app/lib/invoiceEligibility.ts"),
  "utf8"
);

assert(
  eligibilitySource.includes("isNonCollectibleInvoiceStatus(invoice.status)") &&
    eligibilitySource.includes("return 0;"),
  "Superseded originals must remain non-collectible."
);
assert(
  eligibilitySource.includes("isSplitSourceInvoice(invoice)") &&
    eligibilitySource.includes('"Split source - send split invoices"'),
  "Intermediate split sources must not be sendable."
);
assert(
  eligibilitySource.includes('"Superseded - Non-collectible"'),
  "Superseded invoices must carry a clear non-collectible label."
);

console.log("Invoice correction regression checks passed.");
