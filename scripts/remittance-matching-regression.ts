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
    id: "inv-split-source-506",
    displayId: "INV-0506",
    customerName: "North Creek Apartments",
    projectTitle: "Split source parent that must not receive payment",
    invoiceAmount: 2252.95,
    amountPaid: 0,
    status: "sent",
    splitChildrenCount: 2,
  },
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
  {
    id: "inv-506-child",
    displayId: "INV-0506",
    customerName: "North Creek Apartments",
    projectTitle: "North Creek Apartments - split child one",
    invoiceAmount: 1300,
    amountPaid: 0,
    status: "sent",
    splitParentInvoiceId: "inv-split-source-506",
  },
  {
    id: "inv-507-child",
    displayId: "INV-0507",
    customerName: "North Creek Apartments",
    projectTitle: "North Creek Apartments - split child two",
    invoiceAmount: 952.95,
    amountPaid: 0,
    status: "sent",
    splitParentInvoiceId: "inv-split-source-506",
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
assert.deepEqual(
  parsedProduction2734.lines
    .filter((line) => line.invoiceNumbers.length > 0)
    .map((line) => line.amount),
  [1099, 1099],
  "The 2734 parser must treat $2,198.00 as the document total, not a third invoice amount."
);
assert.equal(normalizeInvoiceNumber("INV0502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INV-0502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("1NV0502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INVO502"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INVOS02"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INV0S02"), "INV-0502");
assert.equal(normalizeInvoiceNumber("INV050Z"), "INV-0502");

const productionStub2734WithSummaryRow = [
  "DATE: 07/10/2026 CK#: 2734",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments Paint Serv INV0502 - 06/08/2026 V01 full interior paint $1,099.00",
  "North Creek Apartments Paint Serv INV0503 - 06/10/2026 K08 full interior paint $1,099.00",
  "----------------------------",
  "GRAND TOTAL $2,198.00",
].join("\n");
const parsedProduction2734WithSummaryRow = parseCheckStubText(
  productionStub2734WithSummaryRow
);
const matchProduction2734WithSummaryRow = findRemittanceMatches(
  invoices,
  parsedProduction2734WithSummaryRow.stubText,
  "North Creek Apartments"
);

assert.equal(parsedProduction2734WithSummaryRow.totalAmount, 2198);
assert.deepEqual(
  parsedProduction2734WithSummaryRow.lines.map((line) => line.amount),
  [1099, 1099],
  "A summary total row must never be appended to the invoice line list."
);
assert.deepEqual(matchProduction2734WithSummaryRow.referencedInvoiceNumbers, [
  "INV-0502",
  "INV-0503",
]);
assert.equal(matchProduction2734WithSummaryRow.matchedTotal, 2198);
assert.equal(matchProduction2734WithSummaryRow.lineTotal, 2198);
assert.equal(matchProduction2734WithSummaryRow.totalAmount, 2198);
assert.equal(matchProduction2734WithSummaryRow.confidence, "verified");

const productionStub2734WithGluedSummary = [
  "DATE: 07/10/2026 CK#: 2734",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments Paint Serv INV0502 - 06/08/2026 V01 full interior paint $1,099.00",
  "North Creek Apartments Paint Serv INV0503 - 06/10/2026 K08 full interior paint $1,099.00 TOTAL $2,198.00",
].join("\n");
const parsedProduction2734WithGluedSummary = parseCheckStubText(
  productionStub2734WithGluedSummary
);

assert.equal(parsedProduction2734WithGluedSummary.totalAmount, 2198);
assert.deepEqual(
  parsedProduction2734WithGluedSummary.lines.map((line) => line.amount),
  [1099, 1099],
  "A total glued to an invoice row must not replace the invoice's line amount."
);
assert.notEqual(
  parsedProduction2734WithGluedSummary.lines.reduce(
    (total, line) => total + line.amount,
    0
  ),
  4396,
  "The 2734 remittance must never reconcile by double-counting the grand total."
);

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

const splitCheck2758 = [
  "CHECK DATE: 07/23/2026 CK#: 2758",
  "PAY TO THE ORDER OF R&L Creations",
  "OHO-01-27-0528 BANK: memo routing operating account",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments Paint Serv INV0506 - 07/23/2026 split child one $1,300.00",
  "North Creek Apartments Paint Serv INV0507 - 07/23/2026 split child two $952.95",
  "PAYMENT TOTAL $2,252.95",
].join("\n");
const parsed2758 = parseCheckStubText(splitCheck2758);
const match2758 = findRemittanceMatches(invoices, parsed2758.stubText, "North Creek Apartments");

assert.equal(parsed2758.checkNumber, "2758");
assert.equal(parsed2758.checkDate, "2026-07-23");
assert.equal(parsed2758.totalAmount, 2252.95);
assert.equal(parsed2758.payee, "R&L Creations");
assert.notEqual(parsed2758.payor, "OHO-01-27-0528");
assert.deepEqual(
  parsed2758.lines
    .filter((line) => line.invoiceNumbers.length > 0)
    .map((line) => ({ invoice: line.invoiceNumbers[0], amount: line.amount })),
  [
    { invoice: "INV-0506", amount: 1300 },
    { invoice: "INV-0507", amount: 952.95 },
  ],
  "The 2758 split remittance must parse both child rows and keep the grand total separate."
);
assert.deepEqual(match2758.referencedInvoiceNumbers, [
  "INV-0506",
  "INV-0507",
]);
assert.deepEqual(
  match2758.matches.map((invoice) => invoice.id),
  ["inv-506-child", "inv-507-child"],
  "Split child invoices must match, and the non-collectible split source parent must be excluded."
);
assert.equal(match2758.matchedTotal, 2252.95);
assert.equal(match2758.confidence, "verified");
assert(
  !match2758.matches.some((invoice) => invoice.id === "inv-split-source-506"),
  "The split-source parent must never receive the remittance payment."
);

const splitCheck2758WithoutReadableTotal = [
  "CHECK DATE: 07/23/2026 CK#: 2758",
  "PAY TO THE ORDER OF R&L Creations",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments Paint Serv INV0506 - 07/23/2026 split child one $1,300.00",
  "North Creek Apartments Paint Serv INV0507 - 07/23/2026 split child two $952.95",
].join("\n");
const parsed2758WithoutReadableTotal = parseCheckStubText(
  splitCheck2758WithoutReadableTotal
);

assert.equal(
  parsed2758WithoutReadableTotal.totalAmount,
  2252.95,
  "When the printed total is not readable, the parser should use the sum of all remittance invoice rows instead of the first/largest line."
);
assert.notEqual(
  parsed2758WithoutReadableTotal.totalAmount,
  1300,
  "The first split child amount must not become the check total."
);

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
assert(
  route.includes("MAX_IMAGE_DATA_URL_LENGTH = 20_000_000") &&
    route.includes("buildRegionSources") &&
    route.includes("remittance-right") &&
    route.includes("amounts-right-edge") &&
    route.includes("redactedTextSummary") &&
    route.includes("diagnostics"),
  "OCR route must preserve mobile image quality, use document regions, and return safe diagnostics."
);
assert(
  !route.includes("2721") && !route.includes("2198") && !route.includes("1099"),
  "OCR candidate scoring must not be biased toward an old production fixture."
);

const applyBatchRoute = readFileSync(
  resolve(root, "src/app/api/payments/apply-batch/route.ts"),
  "utf8"
);
assert(
  applyBatchRoute.includes("checkAmount <= 0") &&
    applyBatchRoute.includes("Enter a payment amount greater than $0 before applying payment."),
  "Server-side payment validation must reject zero-dollar OCR/application attempts."
);
assert(
  applyBatchRoute.includes("selectedTotal - remittanceTotal") &&
    applyBatchRoute.includes("The remittance total does not match the selected collectible invoices."),
  "Server-side payment validation must reject remittance selections that do not reconcile."
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
  paymentScreen.includes('data-remittance-fullscreen-capture="true"') &&
    paymentScreen.includes('import { createPortal } from "react-dom"') &&
    paymentScreen.includes("createPortal(") &&
    paymentScreen.includes("document.body") &&
    paymentScreen.includes('className="fixed inset-0 z-[2147483000]') &&
    paymentScreen.includes("h-[100dvh]") &&
    paymentScreen.includes("Align the remittance inside the frame") &&
    paymentScreen.includes("captureFromTrimaxCamera") &&
    paymentScreen.includes("Use Device Camera"),
  "Payments screen must open a full-viewport Trimax document frame before mobile camera OCR."
);
assert(
  paymentScreen.includes("type RemittanceDocumentType") &&
    paymentScreen.includes('"remittance_stub"') &&
    paymentScreen.includes('"full_check_stub"') &&
    paymentScreen.includes('"check_only"') &&
    paymentScreen.includes('useState<RemittanceDocumentType>("remittance_stub")') &&
    paymentScreen.includes('documentType === "remittance_stub" ? "vertical" : "horizontal"'),
  "Payments capture must expose Remittance Stub, Full Check + Stub, and Check Only modes with Remittance Stub as the default."
);
assert(
  paymentScreen.includes("Add Check Photo") &&
    paymentScreen.includes('"check_details"') &&
    paymentScreen.includes("loadCheckDetailsFromExtraction") &&
    paymentScreen.includes("Check photo used only for missing check details."),
  "Payments capture must support an optional second check photo without discarding successful remittance fields."
);
assert(
  paymentScreen.includes("trimax-remittance-capture-active") &&
    paymentScreen.includes("document.body.style.overflow = \"hidden\"") &&
    paymentScreen.includes("document.body.style.touchAction = \"none\"") &&
    paymentScreen.includes("Escape"),
  "Full-screen capture must lock page scrolling and support Escape/cancel cleanup."
);
assert(
  paymentScreen.includes('data-remittance-document-frame="true"') &&
    paymentScreen.includes('data-guide-mode={cameraGuideMode}') &&
    paymentScreen.includes('useState<') &&
    paymentScreen.includes('"horizontal" | "vertical"') &&
    paymentScreen.includes("Rotate Guide") &&
    paymentScreen.includes("env(safe-area-inset-top)") &&
    paymentScreen.includes("env(safe-area-inset-bottom)") &&
    paymentScreen.includes("landscape:h-") &&
    paymentScreen.includes("landscape:w-"),
  "Camera capture must respect iPhone safe areas and adapt the frame in portrait and landscape."
);
assert(
  paymentScreen.includes("guidanceForDocumentType(captureDocumentType)") &&
    paymentScreen.indexOf("guidanceForDocumentType(captureDocumentType)") >
      paymentScreen.indexOf('data-remittance-document-frame="true"'),
  "Camera instructions must sit outside the document frame instead of covering remittance text."
);
assert(
  paymentScreen.includes("const analyzeLiveCameraFrame = useCallback") &&
    paymentScreen.includes("paperCoverage < minimumCoverage") &&
    paymentScreen.includes('message: "Move closer"') &&
    paymentScreen.includes("stableReadyCount >= 2") &&
    !paymentScreen.includes("disabled={!cameraReady || !cameraQualityReady}") &&
    paymentScreen.includes("Check Capture") &&
    paymentScreen.includes("setCheckOcrMessage(nextMessage)") &&
    paymentScreen.includes("Capturing...") &&
    paymentScreen.includes("{cameraQualityReady ? \"Ready\" : cameraStatusMessage}"),
  "Camera tap must always respond while Ready still requires document scale, live quality, and stable frames."
);
assert(
  paymentScreen.includes("Choose Existing Photo") &&
    paymentScreen.includes('captureCheckImage(event.target.files?.[0], "existing")') &&
    paymentScreen.includes("Choose Existing"),
  "Existing-photo workflow must remain available and use the same quality/crop path."
);
assert(
  paymentScreen.includes("qualityMessageFromMetrics") &&
    paymentScreen.includes("Move closer - document is too small.") &&
    paymentScreen.includes("Retake photo - image is blurry.") &&
    paymentScreen.includes("More light needed.") &&
    paymentScreen.includes("Use stronger lighting or a darker background."),
  "Payments screen must reject small, blurry, or low-light remittance images before OCR."
);
assert(
  paymentScreen.includes("Capture stub separately") &&
    paymentScreen.includes('captureDocumentType === "full_check_stub"') &&
    paymentScreen.includes("effectiveGuideShortEdge < 980") &&
    paymentScreen.includes("guidanceForDocumentType(captureDocumentType)"),
  "Full Check + Stub capture must warn when invoice text resolution is too distant and suggest a stub close-up."
);
assert(
  paymentScreen.includes("shouldAutoRead") &&
    paymentScreen.includes("Document detected. Reading remittance...") &&
    paymentScreen.includes("Use image as-is or adjust crop before reading.") &&
    paymentScreen.includes("readPreparedRemittanceFromFile(") &&
    paymentScreen.includes("documentType") &&
    paymentScreen.includes("intent"),
  "Payments screen must auto-read only high-confidence captures and keep crop review available."
);
assert(
  paymentScreen.includes("0.98") &&
    paymentScreen.includes("const maxEdge = 4600") &&
    paymentScreen.includes("OCR image target: at least 3200px readable edge") &&
    paymentScreen.includes("cropBoxForRotation") &&
    paymentScreen.includes("Document total not found. Enter the check amount") &&
    paymentScreen.includes("ocrFailureMessage") &&
    paymentScreen.includes("setPaymentReference(extractedCheckNumber)"),
  "Payments screen must preserve OCR-quality image detail, transform rotated crop coordinates, keep good fields, and guide partial manual fallback."
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
assert(
  route.includes("OCR timed out during ${source.name}") &&
    route.includes("stageTimings") &&
    route.includes("ocrReceivedThumbnail: false") &&
    route.includes("redactedTextSummary"),
  "OCR route must report timeout stage, avoid thumbnail OCR, and keep diagnostics redacted."
);
assert(
  route.includes("type RemittanceDocumentType") &&
    route.includes("normalizeDocumentType") &&
    route.includes("documentType: RemittanceDocumentType") &&
    route.includes("stub-invoice-rows") &&
    route.includes("check-face-no-micr") &&
    route.includes("withoutMicrBandText"),
  "OCR route must use document-type-aware regions, canonical orientation, and MICR-excluded parsing."
);

console.log("Remittance matching regression checks passed.");
