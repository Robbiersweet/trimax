import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const invoicePage = readFileSync(
  resolve(root, "src/app/invoices/[id]/page.tsx"),
  "utf8"
);
const internalNotes = readFileSync(
  resolve(root, "src/app/components/InternalNotes.tsx"),
  "utf8"
);
const persistentDetails = readFileSync(
  resolve(root, "src/app/components/PersistentDetails.tsx"),
  "utf8"
);
const sendPanel = readFileSync(
  resolve(root, "src/app/components/InvoiceEmailSendPanel.tsx"),
  "utf8"
);

assert(
  persistentDetails.includes("window.localStorage.setItem") &&
    persistentDetails.includes("window.localStorage.getItem"),
  "Collapsed invoice sections must use the existing remembered details pattern."
);

[
  "trimax-invoice-payment",
  "trimax-invoice-email",
  "trimax-invoice-deposit",
  "trimax-invoice-proof",
  "trimax-invoice-terms",
  "trimax-invoice-actions",
].forEach((storageKey) => {
  assert(
    invoicePage.includes(storageKey),
    `${storageKey} section must be collapsed with remembered state.`
  );
});

assert(
  internalNotes.includes("PersistentDetails") &&
    internalNotes.includes("trimax-${entityType}-notes-${entityId}") &&
    internalNotes.includes("Add Note") &&
    internalNotes.includes(".from(\"internal_notes\")"),
  "Team Notes must collapse without removing note storage or submission."
);

assert(
  invoicePage.includes("Split Source") &&
    invoicePage.includes("Creates {splitRelatedInvoices.length}") &&
    invoicePage.includes("Open individual invoice") &&
    invoicePage.includes("Open Original"),
  "Split Source and child invoice relationships must remain compact, visible, and openable from authoritative data."
);

assert(
  invoicePage.includes("<InvoiceEmailSendPanel") &&
    invoicePage.includes("title=\"Email & Preview\"") &&
    invoicePage.includes("Review Split Group") &&
    sendPanel.includes("Send Split Group") &&
    invoicePage.includes("sendSplitGroup"),
  "Email details must collapse while preserving review-first split workflow and the existing final send panel."
);

assert(
  invoicePage.includes("<PaymentProgressCard") &&
    invoicePage.includes("title=\"Payment\"") &&
    invoicePage.includes("paymentSummary"),
  "Payment Progress must collapse without changing displayed values."
);

assert(
  invoicePage.includes("<EvidenceTrail") &&
    invoicePage.includes("title=\"Proof\"") &&
    invoicePage.includes("proofSummaryText"),
  "Proof Vault must collapse without changing timeline events."
);

assert(
  invoicePage.includes("<RequestDepositButton") &&
    invoicePage.includes("title=\"Deposit\"") &&
    invoicePage.includes("depositSummary"),
  "Deposit Status must collapse without changing deposit action behavior."
);

assert(
  invoicePage.includes("<DeleteInvoiceButton") &&
    invoicePage.includes("title=\"More Actions\"") &&
    invoicePage.includes("<UpdateInvoiceStatusButton"),
  "More Actions must preserve existing invoice action buttons."
);

assert(
  invoicePage.includes("invoice-intelligence-card") &&
    invoicePage.includes("Next Action") &&
    invoicePage.includes("Review PDF") &&
    !invoicePage.includes("invoice-intelligence-step"),
  "Invoice Intelligence must render as a compact action bar instead of large repeated status cards."
);

assert(
  invoicePage.includes("Automatic Split") &&
    invoicePage.includes("Complete / ${splitRelatedInvoices.length} invoices created") &&
    invoicePage.includes("Ready / target ${money(splitWarningAmount)}"),
  "Automatic Split must show a compact ready/complete status."
);

assert(
  invoicePage.includes('title="Terms"') &&
    invoicePage.includes("Payment due according to invoice terms") &&
    invoicePage.includes("invoiceTerms"),
  "Terms must be collapsed by default while preserving the invoice terms text."
);

assert(
  invoicePage.includes("<h2 className=\"text-2xl font-bold text-white\">Line Items</h2>") &&
    !invoicePage.includes("title=\"Line Items\""),
  "Line Items must remain expanded by default."
);

const splitSendActionLabelCount = (
  invoicePage.match(/label: "Review Split Group"/g) ?? []
).length;

assert.equal(
  splitSendActionLabelCount,
  1,
  "Invoice detail must define exactly one visually dominant Review Split Group primary action."
);

assert(
  !invoicePage.includes("<Button>Send Split Group</Button>"),
  "Split relationship sections must not duplicate the primary Send Split Group button."
);

const protectedFiles = [
  "src/app/lib/splitInvoices.ts",
  "src/app/lib/invoiceCorrections.ts",
  "src/app/lib/invoiceEligibility.ts",
  "src/app/api/invoices/[id]/send-email/route.ts",
  "src/app/api/payments/apply-batch/route.ts",
];

protectedFiles.forEach((filePath) => {
  const source = readFileSync(resolve(root, filePath), "utf8");

  assert(source.length > 0, `${filePath} must remain present and readable.`);
});

console.log("Invoice detail declutter regression checks passed.");
