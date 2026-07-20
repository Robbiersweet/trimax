import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  findRemittanceMatches,
  parseCheckStubText,
} from "../src/app/lib/remittanceMatching.ts";

const root = process.cwd();

const invoices = [
  {
    id: "inv-500",
    displayId: "INV-0500",
    customerName: "North Creek Apartments",
    projectTitle: "Same dollar invoice that must not be substituted",
    invoiceAmount: 1099,
    amountPaid: 0,
    status: "sent",
  },
  {
    id: "inv-501",
    displayId: "INV-0501",
    customerName: "North Creek Apartments",
    projectTitle: "Production remittance acceptance case",
    invoiceAmount: 1099,
    amountPaid: 0,
    status: "sent",
  },
  {
    id: "inv-504",
    displayId: "INV-0504",
    customerName: "North Creek Apartments",
    projectTitle: "Unit G03 painting",
    invoiceAmount: 1099,
    amountPaid: 0,
    status: "sent",
  },
  {
    id: "inv-510",
    displayId: "INV-0510",
    customerName: "North Creek Apartments",
    projectTitle: "Unit G04 painting",
    invoiceAmount: 1099,
    amountPaid: 0,
    status: "sent",
  },
  {
    id: "inv-511",
    displayId: "INV-0511",
    customerName: "North Creek Apartments",
    projectTitle: "Unit G05 painting",
    invoiceAmount: 1099,
    amountPaid: 0,
    status: "sent",
  },
];

const check2743 = [
  "PAYOR: North Creek Apartments",
  "DATE: 06/03/2026 CHECK #: 2743 TOTAL: $1,099.00",
  "INV-0504 G03 Paint service $1,099.00",
].join("\n");
const parsed2743 = parseCheckStubText(check2743);
const match2743 = findRemittanceMatches(
  invoices,
  parsed2743.stubText,
  parsed2743.payor
);

assert.equal(parsed2743.checkNumber, "2743");
assert.equal(parsed2743.totalAmount, 1099);
assert.deepEqual(match2743.referencedInvoiceNumbers, ["INV-0504"]);
assert.deepEqual(
  match2743.matches.map((invoice) => invoice.id),
  ["inv-504"],
  "INV-0504 must not be replaced by same-dollar INV-0500."
);
assert.equal(match2743.confidence, "verified");

const check2734 = [
  "PAYOR: North Creek Apartments",
  "DATE: 06/10/2026 CHECK #: 2734 TOTAL: $2,198.00",
  "Invoice 510 G04 Paint service $1,099.00",
  "INV0511 G05 Paint service $1,099.00",
].join("\n");
const parsed2734 = parseCheckStubText(check2734);
const match2734 = findRemittanceMatches(
  invoices,
  parsed2734.stubText,
  parsed2734.payor
);

assert.equal(parsed2734.checkNumber, "2734");
assert.deepEqual(match2734.referencedInvoiceNumbers, [
  "INV-0510",
  "INV-0511",
]);
assert.equal(match2734.totalAmount, 2198);
assert.equal(match2734.confidence, "verified");

const productionStub2721 = [
  "North Creek Apartments",
  "Date 07/07/2026",
  "Check #2721",
  "Total $2,198.00",
  "INV0500 $1,099.00",
  "INV0501 $1,099.00",
].join("\n");
const parsed2721 = parseCheckStubText(productionStub2721);
const match2721 = findRemittanceMatches(
  invoices,
  parsed2721.stubText,
  parsed2721.payor
);

assert.equal(parsed2721.checkNumber, "2721");
assert.equal(parsed2721.totalAmount, 2198);
assert.equal(parsed2721.payor, "North Creek Apartments");
assert.equal(parsed2721.checkDate, "2026-07-07");
assert.deepEqual(match2721.referencedInvoiceNumbers, [
  "INV-0500",
  "INV-0501",
]);
assert.deepEqual(
  match2721.matches.map((invoice) => invoice.id),
  ["inv-500", "inv-501"],
  "Remittance-only production stub must match INV0500 and INV0501."
);
assert.equal(match2721.confidence, "verified");

assert.notEqual(
  parsed2743.checkNumber,
  parsed2734.checkNumber,
  "Similar check numbers must be parsed from the current stub text."
);

const missingInvoiceNumber = [
  "PAYOR: North Creek Apartments",
  "DATE: 06/12/2026 CHECK #: 2735 TOTAL: $1,099.00",
  "G03 Paint service $1,099.00",
].join("\n");
const missingMatch = findRemittanceMatches(invoices, missingInvoiceNumber);

assert.equal(missingMatch.confidence, "review");
assert.equal(missingMatch.matches.length, 0);
assert(
  missingMatch.issues.includes(
    "No exact invoice numbers were read from the remittance stub."
  )
);

const sameDollarNoInvoice = [
  "PAYOR: North Creek Apartments",
  "DATE: 06/12/2026 CHECK #: 2736 TOTAL: $1,099.00",
  "G03 Paint service $1,099.00",
].join("\n");
const sameDollarMatch = findRemittanceMatches(invoices, sameDollarNoInvoice);

assert.equal(sameDollarMatch.confidence, "review");
assert.equal(
  sameDollarMatch.matches.length,
  0,
  "Same-dollar invoices must not be selected without an exact invoice number."
);

const route = readFileSync(
  resolve(root, "src/app/api/payments/extract-check-stub/route.ts"),
  "utf8"
);
assert(!route.includes("OPENAI_API_KEY"), "OCR route must not require OpenAI.");
assert(!route.includes("api.openai.com"), "OCR route must not call OpenAI.");
assert(route.includes("tesseract.js"), "OCR route must keep a Tesseract fallback.");

const paymentScreen = readFileSync(
  resolve(root, "src/app/components/BatchInvoicePayments.tsx"),
  "utf8"
);
assert(
  paymentScreen.includes("function resetCheckCaptureState()") &&
    paymentScreen.includes("setRemittanceStubText(\"\")") &&
    paymentScreen.includes("setSelectedIds([])") &&
    paymentScreen.includes("resetCheckCaptureState();"),
  "Clearing or replacing a photo must clear OCR text and invoice selection state."
);
assert(
  paymentScreen.includes("function loadExtractedRemittance"),
  "Payments screen must hand extracted remittance data into the review form."
);
assert(
  paymentScreen.includes("parsedTotalFromResponse") &&
    paymentScreen.includes("setCheckAmount(paymentAmountText)") &&
    paymentScreen.includes("setCapturedCheckAmount(paymentAmountText)"),
  "Payments screen must load the extracted $2,198.00 total into the visible review amount."
);
assert(
  paymentScreen.includes('paymentEntryMode === "complete"') &&
    paymentScreen.includes("Payment Applied") &&
    paymentScreen.includes("Process Another Payment"),
  "Payments screen must show a focused complete state after applying payment."
);
assert(
  paymentScreen.includes("showManualInvoiceBrowser") &&
    paymentScreen.includes('paymentEntryMode === "manual"') &&
    paymentScreen.includes("{showManualInvoiceBrowser ?"),
  "Payments screen must hide the full invoice browser during remittance review."
);
assert(
  !paymentScreen.includes("Use Suggested Matches"),
  "Payments screen must not require a second suggested-match handoff."
);
assert(
  paymentScreen.includes("Confirm and Apply Payment"),
  "Payments screen must keep owner confirmation before applying payment."
);
assert(
  paymentScreen.includes("Matched invoices"),
  "Payments screen must show extracted invoice matches during review."
);

console.log("Remittance matching regression checks passed.");
