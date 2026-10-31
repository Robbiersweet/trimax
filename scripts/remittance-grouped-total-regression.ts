import assert from "node:assert/strict";
import { selectRemittanceHeaderEvidence, type StructuredRemittanceRowEvidence } from "../src/app/lib/remittanceMatching.ts";

const pass = (text: string, variant: string, confidence = 80) => ({ text, variant, confidence, region: "payment-header", pageMode: "single-line" });
// Minimized optical observations: preserve complete observed digits, never infer them.
const observations = [pass("TOTAL: $5,  49¢", "scaled", 61), pass("TOTAL: $5, 49%", "binary", 41), pass("TOTAL:$5, 495. 00+ x=", "wide-binary")];
const before = JSON.stringify(observations);
const rows: StructuredRemittanceRowEvidence[] = [0, 1].map(index => ({ rowId: String(index), text: "Observed row $1,099.00", source: { region: "document", variant: "binary", pageMode: "sparse" }, rawInvoiceLikeTokens: [], normalizedInvoiceCandidates: [], unitLikeTokens: [], amountCandidates: [{ raw: "1,099.00", value: 1099, selected: true }], dateTokens: [] }));
const selected = selectRemittanceHeaderEvidence(observations, rows);
assert.equal(selected.evidence?.amount, 5495);
assert.equal(selected.evidence?.payable, true);
assert.equal(selected.totalCandidates.some(c => c.amount === 5495 && c.raw === "5, 495. 00"), true);
assert.equal(JSON.stringify(observations), before);
for (const value of ["5,495.00", "5, 495. 00", "5,\t495.00", "5 495.00"]) {
  assert.equal(selectRemittanceHeaderEvidence([pass(`TOTAL: $${value}`, value)]).evidence?.amount, 5495);
}
assert.notEqual(selectRemittanceHeaderEvidence([pass("TOTAL: 54,58\n33", "fragment")]).evidence?.amount, 54.58);
assert.notEqual(selectRemittanceHeaderEvidence([pass("TOTAL: $5, 49", "missing-digit")]).evidence?.amount, 5495);
assert.equal(selectRemittanceHeaderEvidence([pass("TOTAL: $25.00", "small")]).evidence?.amount, 25);
assert.equal(selectRemittanceHeaderEvidence([pass("TOTAL: $5, 495.00", "a"), pass("TOTAL: $5, 496.00", "b")]).evidence?.payable, false);
console.log("Grouped total spacing: complete observed amounts, fragment rejection, conflict hold and input immutability passed.");
