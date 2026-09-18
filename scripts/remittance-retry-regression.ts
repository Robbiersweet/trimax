import assert from "node:assert/strict";
import { findRemittanceMatches, selectRemittanceHeaderEvidence, type StructuredRemittanceRowEvidence } from "../src/app/lib/remittanceMatching.ts";

// Synthetic reconstruction of the reported physical evidence, not a captured OCR payload.
const numbers = ["0513", "0514", "0515", "0518", "0519"];
const units = ["U05", "H10", "Q08", "U03", "A10"];
const invoices = numbers.map((number, index) => ({ id: number, displayId: `INV-${number}`, customerName: "North Creek Apartments", projectTitle: `${units[index]} Paint`, invoiceAmount: 1099, amountPaid: 0, status: "sent" }));
const rows: StructuredRemittanceRowEvidence[] = numbers.map((number, index) => ({
  rowId: `row-${index}`, text: `${units[index]} Paint $${index === 4 ? "1,035.00" : "1,099.00"}`,
  source: { region: "document", variant: "grayscale", pageMode: "sparse" },
  rawInvoiceLikeTokens: [], normalizedInvoiceCandidates: index === 0 ? [] : [`INV-${number}`],
  invoiceEvidenceByPass: index === 0 ? [{ raw: "INV-O5I3", normalized: ["INV-0513"], region: "document", variant: "sharpened", pageMode: "sparse", confidence: 60 }] : [],
  unitLikeTokens: [units[index]], amountCandidates: [{ raw: index === 4 ? "1,035.00" : "1,099.00", value: index === 4 ? 1035 : 1099, selected: true }], dateTokens: [],
}));
const pass = (text: string, variant: string) => ({ text, variant, region: "document", pageMode: "sparse", confidence: 80 });
const incomplete = [pass("DATE 08/19/2026 CHECK 279 TOTAL 2, 49", "initial")];
const retry = [pass("DATE 08/19/2026 CHECK 279 TOTAL 2, 49", "threshold"), pass("CHECK 2797\nPAYMENT TOTAL $5,495.00", "sharpened"), pass("CHECK 2797\nTOTAL $5,495.00", "normalized")];
const before = JSON.stringify({ incomplete, retry, rows });
const first = selectRemittanceHeaderEvidence(incomplete, rows.slice(1));
assert.equal(first.evidence?.amount, 2.49);
const header = selectRemittanceHeaderEvidence(retry, rows);
assert.equal(header.checkNumber, "2797");
assert.equal(header.evidence?.amount, 5495);
assert.equal(header.evidence?.payable, true);
assert.equal(header.totalCandidates[0].agreement, 2);
const text = `PAYOR: North Creek Apartments\nCHECK ${header.checkNumber}\nTOTAL $${header.evidence?.amount.toFixed(2)}`;
const result = findRemittanceMatches(invoices, text, "North Creek Apartments", rows);
assert.equal(result.confidence, "verified");
assert.deepEqual(result.matches.map((invoice) => invoice.id), numbers);
assert.equal(result.matchedTotal, 5495);
assert.equal(result.lineTotal, 5431, "Conflicting OCR amount remains evidence; it is not rewritten.");
assert.equal(result.matchTrace[0].invoiceId, "0513");
assert.equal(findRemittanceMatches(invoices, text, "North Creek Apartments", rows.slice(1)).confidence, "review");
assert.equal(findRemittanceMatches(invoices, "TOTAL $5496.00", "North Creek Apartments", rows).confidence, "review");
assert.equal(findRemittanceMatches(invoices, text, "North Creek Apartments", [...rows, rows[0]]).confidence, "review");
const missingToken = structuredClone(rows);
missingToken[0].invoiceEvidenceByPass = [];
assert.equal(findRemittanceMatches(invoices, text, "North Creek Apartments", missingToken).matches.length, 0);
assert.equal(findRemittanceMatches([...invoices, { ...invoices[0], id: "other", displayId: "INV-0900" }], text, "North Creek Apartments", missingToken).confidence, "review");
const unresolved = [...rows, { ...rows[0], rowId: "extra", text: "Unknown work", unitLikeTokens: [], invoiceEvidenceByPass: [], amountCandidates: [] }];
assert.equal(findRemittanceMatches(invoices, text, "North Creek Apartments", unresolved).confidence, "review");
assert.equal(JSON.stringify({ incomplete, retry, rows }), before, "Selection must not mutate or carry evidence between attempts.");
assert.deepEqual(selectRemittanceHeaderEvidence(retry, rows), header);
assert.equal(selectRemittanceHeaderEvidence([pass("CHECK 2797 TOTAL $5,495.00", "new")], rows).checkNumber, "2797");
assert.equal(selectRemittanceHeaderEvidence([pass("CHECK 3124 TOTAL $220.00", "next-document")]).checkNumber, "3124");
console.log("Retry OCR fixture: five unique invoices, check 2797, total 5495, exact reconciliation and conflict guards passed.");

assert.equal(selectRemittanceHeaderEvidence([pass("CHECK 279 7 TOTAL $5,495.00", "split-token")]).checkNumber, "2797");
assert.equal(selectRemittanceHeaderEvidence([pass("CHECK 2797 TOTAL $5,495.00", "a"), pass("CHECK 2797 TOTAL $5,496.00", "b")]).evidence?.payable, false);

const footerText = "CHECK 2797 TOTAL 2, 49\n" + "Invoice rows and description\n".repeat(8) + "$5,495.00";
assert.equal(selectRemittanceHeaderEvidence([pass(footerText, "footer-a"), pass(footerText, "footer-b")], rows).evidence?.amount, 5495);
assert.equal(selectRemittanceHeaderEvidence([pass("CHECK 1234 TOTAL $25.00", "small-valid")]).evidence?.amount, 25);

assert.equal(findRemittanceMatches(invoices, "TOTAL $2.49", "North Creek Apartments", rows, header.evidence ?? undefined).confidence, "verified", "The selected cross-pass total survives body-text handoff.");
assert.equal(findRemittanceMatches(invoices, text, "North Creek Apartments", rows, { amount: 5495, source: "explicit-document-total", payable: false }).confidence, "review");
