import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  findRemittanceMatches,
  normalizeInvoiceNumber,
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
    id: "inv-502",
    displayId: "INV-0502",
    customerName: "North Creek Apartments",
    projectTitle: "North Creek Apartments - Unit V01 full interior paint",
    invoiceAmount: 1099,
    amountPaid: 0,
    status: "sent",
  },
  {
    id: "inv-503",
    displayId: "INV-0503",
    customerName: "North Creek Apartments",
    projectTitle: "North Creek Apartments - Unit K08 full interior paint",
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

const productionStub2734 = [
  "DATE: 07/10/2026 CK#: 2734 TOTAL: $2,198.00",
  "PAYEE: R&L Creations",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments Paint Serv 1NV0502 - 06/08/2026 V01 full interior paint 1,099.00",
  "North Creek Apartment Paint Serv INV0503 - 06/10/2026 K08 full interior paint 1,099.00",
].join("\n");
const parsedProduction2734 = parseCheckStubText(productionStub2734);
const matchProduction2734 = findRemittanceMatches(
  invoices,
  parsedProduction2734.stubText,
  "North Creek Apartments"
);

assert.equal(parsedProduction2734.checkNumber, "2734");
assert.equal(parsedProduction2734.totalAmount, 2198);
assert.equal(parsedProduction2734.checkDate, "2026-07-10");
assert.deepEqual(matchProduction2734.referencedInvoiceNumbers, [
  "INV-0502",
  "INV-0503",
]);
assert.deepEqual(
  matchProduction2734.matches.map((invoice) => invoice.id),
  ["inv-502", "inv-503"],
  "The two-line 2734 remittance must not stop after matching only INV-0503."
);
assert.equal(matchProduction2734.matchedTotal, 2198);
assert.equal(matchProduction2734.confidence, "verified");
assert.equal(normalizeInvoiceNumber("INV0502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INV-0502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("1NV0502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INVO502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INVOS02"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INV0S02"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INV050Z"), "INV-0502");

const partialProductionStub2734 = [
  "DATE: 07/10/2026 CK#: 2734 TOTAL: $2,198.00",
  "North Creek Apartments Paint Serv INV0503 - 06/10/2026 K08 full interior paint 1,099.00",
].join("\n");
const partialMatchProduction2734 = findRemittanceMatches(
  invoices,
  partialProductionStub2734,
  "North Creek Apartments"
);

assert.equal(partialMatchProduction2734.confidence, "review");
assert.equal(
  partialMatchProduction2734.matches.length,
  0,
  "A one-invoice partial match must not be accepted against a $2,198.00 remittance."
);
assert(
  partialMatchProduction2734.issues.includes(
    "Referenced invoice balances and remittance line amounts do not reconcile to the check total."
  )
);

const contextRecoveredStub2734 = [
  "DATE: 07/10/2026 CK#: 2734 TOTAL: $2,198.00",
  "North Creek Apartments Paint Serv V01 full interior paint 1,099.00",
  "North Creek Apartments Paint Serv INV0503 - 06/10/2026 K08 full interior paint 1,099.00",
].join("\n");
const contextRecoveredMatch2734 = findRemittanceMatches(
  invoices,
  contextRecoveredStub2734,
  "North Creek Apartments"
);

assert.equal(contextRecoveredMatch2734.confidence, "verified");
assert.deepEqual(contextRecoveredMatch2734.referencedInvoiceNumbers, [
  "INV-0503",
  "INV-0502",
]);

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
assert.equal(normalizeInvoiceNumber("INV0500"), "INV-0500");
assert.equal(normalizeInvoiceNumber("INV-0500"), "INV-0500");
assert.equal(normalizeInvoiceNumber("0500"), "INV-0500");
assert.equal(normalizeInvoiceNumber("500"), "INV-0500");

const productionStub2721WithHeaders = [
  "CK# 2721 Date 07/07/2026 Total $2,198.00",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments 52723 INV0500 07/07/2026 Unit H04 $1,099.00",
  "North Creek Apartments 52723 INV0501 07/07/2026 Unit E07 $1,099.00",
].join("\n");
const parsed2721WithHeaders = parseCheckStubText(productionStub2721WithHeaders);
const match2721WithHeaders = findRemittanceMatches(
  invoices,
  parsed2721WithHeaders.stubText,
  parsed2721WithHeaders.payor
);

assert.equal(parsed2721WithHeaders.checkNumber, "2721");
assert.equal(parsed2721WithHeaders.totalAmount, 2198);
assert.equal(parsed2721WithHeaders.payor, "North Creek Apartments");
assert.equal(parsed2721WithHeaders.checkDate, "2026-07-07");
assert.deepEqual(match2721WithHeaders.referencedInvoiceNumbers, [
  "INV-0500",
  "INV-0501",
]);
assert.deepEqual(
  match2721WithHeaders.matches.map((invoice) => invoice.id),
  ["inv-500", "inv-501"],
  "Column headers must not block INV0500 and INV0501 matching."
);

const productionStub2721OcrLike = [
  "CK# 2721 07/07/2026",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments 52723 INVO500 07/07/2026 turn $1,099.00",
  "North Creek Apartments 52723 1NV0501 07/07/2026 turn $1,099.00",
  "Total $2,198.00",
].join("\n");
const parsed2721OcrLike = parseCheckStubText(productionStub2721OcrLike);
const match2721OcrLike = findRemittanceMatches(
  invoices,
  parsed2721OcrLike.stubText,
  parsed2721OcrLike.payor
);

assert.equal(parsed2721OcrLike.checkNumber, "2721");
assert.equal(parsed2721OcrLike.payor, "North Creek Apartments");
assert.equal(parsed2721OcrLike.totalAmount, 2198);
assert.equal(parsed2721OcrLike.checkDate, "2026-07-07");
assert.deepEqual(match2721OcrLike.referencedInvoiceNumbers, [
  "INV-0500",
  "INV-0501",
]);
assert(
  !match2721OcrLike.referencedInvoiceNumbers.includes("INV-52723"),
  "Account number 52723 must not be interpreted as an invoice number."
);
assert.deepEqual(
  match2721OcrLike.lineItems
    .filter((line) => line.invoiceNumbers.length > 0)
    .map((line) => line.amount),
  [1099, 1099],
  "OCR-like remittance rows must preserve the two $1,099.00 line amounts."
);
assert.equal(match2721OcrLike.confidence, "verified");

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
assert(
  route.includes("const ROTATIONS = [0, 90, 180, 270] as const") &&
    route.includes("scoreOcrText") &&
    route.includes("recognizeBestText") &&
    route.includes("shouldAcceptFirstPass") &&
    route.includes("referencedLineTotal"),
  "OCR route must score 0/90/180/270 rotations and reject partial first-pass remittance reads."
);

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
    paymentScreen.includes("extractedPaymentAmount") &&
    paymentScreen.includes("setCheckAmount(paymentAmountText)") &&
    paymentScreen.includes("setCapturedCheckAmount(paymentAmountText)"),
  "Payments screen must load the extracted $2,198.00 total into the visible review amount."
);
assert(
  paymentScreen.includes("function invoiceLookupKeys") &&
    paymentScreen.includes("extractInvoiceNumbers(candidate)") &&
    paymentScreen.includes("candidate.matchAll"),
  "Payments screen must normalize real invoice records before matching OCR invoice numbers."
);
assert(
  paymentScreen.includes('paymentEntryMode === "complete"') &&
    paymentScreen.includes("Payment Applied") &&
    paymentScreen.includes("Record Another Payment"),
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
  paymentScreen.includes("Matched Invoices"),
  "Payments screen must show extracted invoice matches during review."
);
assert(
  paymentScreen.includes("readPreparedRemittanceFromFile(file, suggestion.cropBox, 0)") &&
    paymentScreen.includes("Preparing remittance..."),
  "Payments screen must auto-read after photo selection instead of forcing crop first."
);
assert(
  paymentScreen.includes("beginCropDrag") &&
    paymentScreen.includes('"top-left"') &&
    paymentScreen.includes("cursor-nwse-resize") &&
    !paymentScreen.includes('type="range"'),
  "Manual crop must use draggable handles instead of edge sliders."
);
assert(
  paymentScreen.includes("function reconcileReviewMatches") &&
    paymentScreen.includes("invoiceTotalMatchesCheck") &&
    paymentScreen.includes("Remittance total does not match selected invoices.") &&
    paymentScreen.includes("Select Missing Invoice Manually"),
  "Payments screen must reconcile OCR line amounts against real invoice balances and reject partial matches."
);

console.log("Remittance matching regression checks passed.");
