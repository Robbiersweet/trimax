import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatStoredInvoiceAmount } from "../src/app/lib/invoiceMoney.ts";
import { calculateDiscountedDocumentTotals } from "../src/app/lib/documentDiscounts.ts";

// Retained North Creek check 2836: INV-0526 is $295 plus 9.9% tax.
// Both its customer invoice and remittance print $324.21. The old persistence
// formatter alone changed that to $324.20; OCR never supplied that lower value.
const rawTotal = 295 + 295 * (9.9 / 100);
assert.equal(rawTotal.toFixed(2), "324.20", "Reproduce the original persistence defect.");
assert.equal(formatStoredInvoiceAmount(rawTotal), "$324.21");
const editTotal = calculateDiscountedDocumentTotals({
  lineSubtotal: 295, taxRate: 9.9,
  discount: { enabled: false, type: "fixed", value: "", label: "" },
  roundLineSubtotalToCents: false,
});
assert.equal(formatStoredInvoiceAmount(editTotal.total), "$324.21");
const cents = (s: string) => Math.round(Number(s.replace("$", "")) * 100);
assert.equal([formatStoredInvoiceAmount(rawTotal), "$712.84", "$1099.00", "$1099.00", "$1099.00"].reduce((sum, s) => sum + cents(s), 0), 433405);
for (const [input, expected] of [[1.005, "$1.01"], [2.675, "$2.68"], [324.204, "$324.20"], [324.206, "$324.21"], [1428.7, "$1428.70"], [4286.1, "$4286.10"], [0, "$0.00"], [1099, "$1099.00"]] as const) {
  assert.equal(formatStoredInvoiceAmount(input), expected);
}
assert.throws(() => formatStoredInvoiceAmount(NaN));
assert.throws(() => formatStoredInvoiceAmount(Infinity));
for (const path of ["src/app/invoices/new/page.tsx", "src/app/invoices/[id]/edit/page.tsx", "src/app/components/ConvertEstimateToInvoiceButton.tsx"]) {
  const source = readFileSync(path, "utf8");
  assert(source.includes("return formatStoredInvoiceAmount(amount);"), `${path} must persist customer-facing decimal rounding.`);
}
const edit = readFileSync("src/app/invoices/[id]/edit/page.tsx", "utf8");
assert(edit.includes("previousAmount: previousInvoiceAmount"));
assert(edit.includes("setPreviousInvoiceAmount(invoice.invoice_amount)"));
console.log("Invoice cent persistence regression passed; retained five-row total is 433405 cents.");
