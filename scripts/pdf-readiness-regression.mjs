import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import strictAssert from "node:assert/strict";

// Execute the real renderer with an in-memory browser to verify credential
// boundaries, including redirected requests. Never use a real session here.
const load = createRequire(import.meta.url);
const typescript = load("typescript");
const handlers = {};
let closed = 0;
const mockPage = {
  on: (event, handler) => { handlers[event] = handler; },
  setRequestInterception: async (enabled) => strictAssert.equal(enabled, true),
  goto: async () => ({ ok: () => true, status: () => 200 }),
  url: () => "https://preview.example/invoices/test/print",
  evaluate: async (fn) => fn.toString().includes("document.body.innerText") ? "Synthetic invoice" : true,
  waitForSelector: async () => {},
  emulateMediaType: async () => {},
  pdf: async () => Buffer.from("%PDF-synthetic"),
};
const mockBrowser = { newPage: async () => mockPage, close: async () => { closed++; } };
const rendererModule = { exports: {} };
const rendererSource = readFileSync(resolve("src/app/lib/printPagePdf.ts"), "utf8");
const rendererCode = typescript.transpileModule(rendererSource, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function("require", "module", "exports", rendererCode)((name) => {
  if (name === "puppeteer-core") return { launch: async () => mockBrowser };
  if (name === "@sparticuz/chromium") return { executablePath: async () => "synthetic", args: [] };
  throw new Error(`Unexpected renderer dependency: ${name}`);
}, rendererModule, rendererModule.exports);
await rendererModule.exports.createPrintPagePdfAttachment({
  url: "https://preview.example/invoices/test/print", filename: "test",
  accessToken: "synthetic-token", requestSession: { origin: "https://preview.example", cookie: "synthetic-session=value" },
});
function headersFor(url) {
  let forwarded;
  handlers.request({ url: () => url, headers: () => ({ authorization: "old", cookie: "old", "x-trimax-cron-secret": "old", accept: "text/html" }), continue: (options) => { forwarded = options.headers; return Promise.resolve(); } });
  return forwarded;
}
strictAssert.deepEqual(headersFor("https://preview.example/invoices/test/print"), {
  accept: "text/html", authorization: "Bearer synthetic-token", cookie: "synthetic-session=value",
});
for (const destination of ["https://vercel.com/login", "https://preview.example.evil.test/", "http://preview.example/", "https://preview.example:444/", "data:text/plain,test"]) {
  strictAssert.deepEqual(headersFor(destination), { accept: "text/html" });
}
await strictAssert.rejects(rendererModule.exports.createPrintPagePdfAttachment({
  url: "https://other.example/print", filename: "test",
  requestSession: { origin: "https://preview.example", cookie: "synthetic-session=value" },
}), /origin does not match/);
strictAssert.equal(closed, 2);

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
  pdfHelper.includes("PRINT_READY_SELECTOR") &&
    pdfHelper.includes(".standard-invoice-print") &&
    pdfHelper.includes(".standard-estimate-print"),
  "PDF helper must temporarily accept legacy print containers during marker migration."
);
assert(
  pdfHelper.includes("Trimax PDF render compatibility selector used"),
  "PDF helper must log when it falls back to legacy print readiness selectors."
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

const printCss = readFileSync(resolve("src/app/print.css"), "utf8");
const numericPrintRule = printCss.match(/\.standard-print-table th:not\(:first-child\),\s*\.standard-print-table td:not\(:first-child\)\s*\{([^}]+)\}/)?.[1] ?? "";
assert(/white-space:\s*nowrap\s*!important/.test(numericPrintRule), "Printed currency tokens must not break before their final decimal digit.");
assert(/overflow-wrap:\s*normal\s*!important/.test(numericPrintRule), "Generic break-anywhere styling must not split printed currency tokens.");
console.log("PDF readiness regression checks passed.");
