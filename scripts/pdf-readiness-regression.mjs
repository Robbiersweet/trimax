import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pdfHelper = read("src/app/lib/printPagePdf.ts");
const invoicePrint = read("src/app/invoices/[id]/print/page.tsx");
const estimatePrint = read("src/app/estimates/[id]/print/page.tsx");
const invoiceSend = read("src/app/api/invoices/[id]/send-email/route.ts");
const sendPanel = read("src/app/components/InvoiceEmailSendPanel.tsx");
const toast = read("src/app/components/Toast.tsx");

assert(
  pdfHelper.includes('const PDF_READY_SELECTOR = \'[data-pdf-ready="true"]\''),
  "PDF helper must wait for the canonical data-pdf-ready marker."
);
assert(
  !pdfHelper.includes('waitForSelector(\n      ".standard-invoice-print, .standard-estimate-print"'),
  "PDF helper must not depend on legacy invoice/estimate CSS container selectors."
);
assert(
  (invoicePrint.match(/data-pdf-ready="true"/g) ?? []).length >= 2,
  "Invoice print page must expose the PDF-ready marker on standard and Just Kleen special layouts."
);
assert(
  estimatePrint.includes('data-pdf-ready="true"'),
  "Estimate print page must expose the PDF-ready marker."
);
assert(
  invoiceSend.indexOf("createPrintPagePdfAttachment") <
    invoiceSend.indexOf("sendWithResend"),
  "Invoice send route must create PDF attachments before email delivery."
);
assert(
  invoiceSend.indexOf("return sendFailureResponse({\n          traceId,\n          steps,\n          stage: \"pdf_generation\"") <
    invoiceSend.indexOf("const html = `"),
  "Invoice send route must return on PDF failure before building and sending the email."
);
assert(
  invoiceSend.includes("status: \"sent\"") &&
    invoiceSend.indexOf("status: \"sent\"") > invoiceSend.indexOf("sendWithResend"),
  "Invoice status must only be marked sent after email delivery succeeds."
);
assert(
  sendPanel.includes("Invoice PDF could not be created, so no email was sent."),
  "Mobile send error must show the friendly PDF failure message first."
);
assert(
  toast.includes("Technical Details") && toast.includes("<details"),
  "Toast must keep technical details in a collapsible section."
);

console.log("PDF readiness regression checks passed.");
