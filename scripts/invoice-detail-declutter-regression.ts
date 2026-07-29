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
  invoicePage.includes("SplitInvoiceRelationshipDisplay") &&
    invoicePage.includes("childInvoices={splitRelatedInvoices}") &&
    invoicePage.includes("sourceInvoice={splitParentInvoice}"),
  "Split Source and Source relationships must remain visible from authoritative data."
);

assert(
  invoicePage.includes("<InvoiceEmailSendPanel") &&
    invoicePage.includes("title=\"Email & Preview\"") &&
    invoicePage.includes("Send Split Group") &&
    invoicePage.includes("sendSplitGroup"),
  "Email details must collapse while preserving the existing send panel and split workflow warning."
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
