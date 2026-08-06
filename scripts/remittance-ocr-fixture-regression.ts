import assert from "node:assert/strict";
import sharp from "sharp";
import {
  findRemittanceMatches,
  parseCheckStubText,
  type RemittanceInvoiceRecord,
} from "../src/app/lib/remittanceMatching.ts";

const Tesseract = await import("tesseract.js");

const invoices: RemittanceInvoiceRecord[] = [
  {
    id: "split-source-parent",
    displayId: "INV-0506",
    customerName: "North Creek Apartments",
    projectTitle: "Split source parent",
    invoiceAmount: 2252.95,
    amountPaid: 0,
    status: "sent",
    splitChildrenCount: 2,
  },
  {
    id: "inv-506-child",
    displayId: "INV-0506",
    customerName: "North Creek Apartments",
    projectTitle: "P01 full interior paint",
    invoiceAmount: 1300,
    amountPaid: 0,
    status: "sent",
    splitParentInvoiceId: "split-source-parent",
  },
  {
    id: "inv-507-child",
    displayId: "INV-0507",
    customerName: "North Creek Apartments",
    projectTitle: "D01 cabinet and primer paint",
    invoiceAmount: 952.95,
    amountPaid: 0,
    status: "sent",
    splitParentInvoiceId: "split-source-parent",
  },
];

const fixtureText = [
  "DATE: 07/23/2026  CK#: 2758  TOTAL: $2,252.95",
  "PAYEE: R&L Creations",
  "",
  "Property Account Invoice - Date Description Amount",
  "North Creek Apartments Paint Serv INV0506 - 07/23/2026 P01 full interior paint $1,300.00",
  "North Creek Apartments Paint Serv INV0507 - 07/23/2026 D01 cabinet and primer paint $952.95",
  "PAYMENT TOTAL $2,252.95",
].join("\n");

const escaped = fixtureText
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="2600" height="820">
  <rect width="100%" height="100%" fill="white"/>
  <text x="80" y="90" font-family="Courier New, monospace" font-size="40" fill="black" xml:space="preserve">
    ${escaped
      .split("\n")
      .map((line, index) => `<tspan x="80" dy="${index === 0 ? 0 : 62}">${line}</tspan>`)
      .join("")}
  </text>
</svg>`;

const fixtureImage = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 6 })
  .toBuffer();
const metadata = await sharp(fixtureImage).metadata();

assert.equal(metadata.width, 2600);
assert.equal(metadata.height, 820);
assert(fixtureImage.byteLength > 10_000);

const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
  cachePath: "./tmp/tesseract-cache",
  logger: () => undefined,
});

try {
  await worker.setParameters({
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
  });

  const recognition = await worker.recognize(fixtureImage, {}, { text: true });
  const rawText = recognition.data.text.trim();

  assert(rawText.length > 0, "Sanitized remittance image must produce OCR text.");

  const parsed = parseCheckStubText(rawText);
  const match = findRemittanceMatches(
    invoices,
    parsed.stubText,
    "North Creek Apartments"
  );

  assert.equal(parsed.checkNumber, "2758");
  assert.equal(parsed.checkDate, "2026-07-23");
  assert.equal(parsed.totalAmount, 2252.95);
  assert.deepEqual(
    parsed.lines
      .filter((line) => line.invoiceNumbers.length > 0)
      .map((line) => ({ invoice: line.invoiceNumbers[0], amount: line.amount })),
    [
      { invoice: "INV-0506", amount: 1300 },
      { invoice: "INV-0507", amount: 952.95 },
    ]
  );
  assert.deepEqual(match.matches.map((invoice) => invoice.id), [
    "inv-506-child",
    "inv-507-child",
  ]);
  assert(!match.matches.some((invoice) => invoice.id === "split-source-parent"));
  assert.equal(match.matchedTotal, 2252.95);
  assert.equal(match.confidence, "verified");
} finally {
  await worker.terminate().catch(() => undefined);
}

console.log("Remittance OCR fixture regression checks passed.");
