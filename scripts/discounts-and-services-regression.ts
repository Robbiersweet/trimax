import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateDiscountedDocumentTotals,
  discountDisplayLabel,
  parseDiscountFromLineItem,
} from "../src/app/lib/documentDiscounts.ts";
import { uniqueSavedServices } from "../src/app/lib/savedServicePresentation.ts";

const root = process.cwd();
const estimateEdit = readFileSync(
  resolve(root, "src/app/estimates/[id]/edit/page.tsx"),
  "utf8"
);
const invoiceEdit = readFileSync(
  resolve(root, "src/app/invoices/[id]/edit/page.tsx"),
  "utf8"
);
const estimatePrint = readFileSync(
  resolve(root, "src/app/estimates/[id]/print/page.tsx"),
  "utf8"
);
const invoicePrint = readFileSync(
  resolve(root, "src/app/invoices/[id]/print/page.tsx"),
  "utf8"
);
const converter = readFileSync(
  resolve(root, "src/app/components/ConvertEstimateToInvoiceButton.tsx"),
  "utf8"
);
const splitInvoices = readFileSync(
  resolve(root, "src/app/lib/splitInvoices.ts"),
  "utf8"
);
const captureServices = readFileSync(
  resolve(root, "src/app/lib/captureServicesFromLineItems.ts"),
  "utf8"
);

assert.deepEqual(
  calculateDiscountedDocumentTotals({
    lineSubtotal: 1000,
    taxRate: 10,
    discount: {
      enabled: true,
      type: "fixed",
      value: 100,
      label: "Courtesy",
    },
  }),
  {
    lineSubtotal: 1000,
    discountAmount: 100,
    taxableSubtotal: 900,
    taxAmount: 90,
    total: 990,
  },
  "Fixed discounts must apply before tax."
);

assert.deepEqual(
  calculateDiscountedDocumentTotals({
    lineSubtotal: 1000,
    taxRate: 10,
    discount: {
      enabled: true,
      type: "percentage",
      value: 10,
      label: "Volume",
    },
  }),
  {
    lineSubtotal: 1000,
    discountAmount: 100,
    taxableSubtotal: 900,
    taxAmount: 90,
    total: 990,
  },
  "Percentage discounts must apply before tax."
);

assert.equal(
  calculateDiscountedDocumentTotals({
    lineSubtotal: 50,
    taxRate: 10,
    discount: {
      enabled: true,
      type: "fixed",
      value: 500,
      label: "Credit",
    },
  }).total,
  0,
  "Discounts must not accidentally create negative totals."
);

assert.equal(
  discountDisplayLabel({
    enabled: true,
    type: "percentage",
    value: 10,
    label: "Courtesy discount",
  }),
  "Discount - Courtesy discount (10%)",
  "Discount line labels must be customer-readable."
);

assert.deepEqual(
  parseDiscountFromLineItem({
    description: "Discount - Courtesy discount (10%)",
    lineTotal: -150,
    unitPrice: -150,
  }),
  {
    enabled: true,
    type: "percentage",
    value: "10",
    label: "Courtesy discount",
  },
  "Saved discount lines must reopen in the discount editor."
);

assert(
  estimateEdit.includes("Discount") &&
    estimateEdit.includes("Applied before tax") &&
    estimateEdit.includes("discountDisplayLabel") &&
    estimateEdit.includes("calculateDiscountedDocumentTotals") &&
    estimateEdit.includes("documentTotals.taxableSubtotal"),
  "Estimate editor must expose and save a first-class discount control."
);

assert(
  invoiceEdit.includes("Discount") &&
    invoiceEdit.includes("Applied before tax") &&
    invoiceEdit.includes("discountDisplayLabel") &&
    invoiceEdit.includes("Sent invoices cannot be edited directly") &&
    invoiceEdit.includes("documentTotals.taxableSubtotal"),
  "Draft invoice editor must expose discounts and block direct sent-invoice edits."
);

assert(
  converter.includes("estimateLineItems.map") &&
    converter.includes("invoiceLineItems") &&
    converter.includes("line_total: toNumber(item.line_total)") &&
    converter.includes("subtotalAmount: fallbackSubtotal"),
  "Estimate discount line items must carry into converted invoices and split calculations."
);

assert(
  estimatePrint.includes("lineItems") &&
    estimatePrint.includes("line_total") &&
    invoicePrint.includes("lineItems") &&
    invoicePrint.includes("line_total"),
  "Customer PDFs must continue rendering saved line items, including controlled discount rows."
);

assert(
  splitInvoices.includes("subtotalAmount") &&
    splitInvoices.includes("buildSplitInvoicePlan"),
  "Split invoices must continue using the final discounted subtotal passed by the editor/converter."
);

assert(
  captureServices.includes("Automatic line-item capture is disabled") &&
    !captureServices.includes(".from(\"service_items\")") &&
    !captureServices.includes(".insert("),
  "Queue/editor auto-populated line items must not create permanent Saved Services."
);

const uniqueServices = uniqueSavedServices([
  {
    id: "one",
    business_id: "b",
    name: "Renovation and Cabinet Paint",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 1099,
    category: "Auto Captured",
  },
  {
    id: "two",
    business_id: "b",
    name: " renovation & cabinet paint ",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 1099,
    category: "Auto Captured",
  },
  {
    id: "three",
    business_id: "b",
    name: "Full Repaint with Color Change",
    description: "Full Repaint with Color Change",
    default_quantity: 1,
    default_unit_price: 1399,
    category: "Painting",
  },
]);

assert.equal(uniqueServices.length, 2, "Exact duplicate services must collapse in picker presentation.");
assert(
  estimateEdit.includes("Find Saved Service") &&
    invoiceEdit.includes("Find Saved Service") &&
    estimateEdit.includes("visibleServiceItems.map") &&
    invoiceEdit.includes("visibleServiceItems.map"),
  "Estimate and invoice editors must present searchable, deduped saved services."
);

assert(
  estimateEdit.includes("Line Items") &&
    invoiceEdit.includes("Line Items"),
  "Line Items must remain expanded in document editors."
);

console.log("Discount and saved-service regression checks passed.");
