import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateDiscountedDocumentTotals } from "../src/app/lib/documentDiscounts.ts";
import {
  reverseCalculateFinalTotal,
  type ReverseTotalLineItem,
} from "../src/app/lib/reverseDocumentTotals.ts";

function cents(value: number) {
  return Math.round(value * 100);
}

const root = process.cwd();

function assertReverseTotal({
  label,
  desiredTotal,
  taxRate,
  lineItems = [
    {
      description: label,
      quantity: "1",
      unitPrice: "1",
    },
  ],
  selectedLineIndex = 0,
}: {
  label: string;
  desiredTotal: number;
  taxRate: number;
  lineItems?: ReverseTotalLineItem[];
  selectedLineIndex?: number;
}) {
  const result = reverseCalculateFinalTotal({
    desiredTotal,
    lineItems,
    selectedLineIndex,
    taxRate,
  });

  assert.equal(result.ok, true, `${label} should reverse calculate`);

  if (!result.ok) {
    return;
  }

  const adjustedItems = lineItems.map((item, index) =>
    index === selectedLineIndex
      ? {
          ...item,
          unitPrice: result.unitPrice,
        }
      : item
  );
  const subtotal = adjustedItems.reduce((sum, item) => {
    return (
      sum +
      (Number(item.quantity) || 0) *
        (Number(item.unitPrice) || 0)
    );
  }, 0);
  const totals = calculateDiscountedDocumentTotals({
    lineSubtotal: subtotal,
    taxRate,
    discount: {
      enabled: false,
      type: "fixed",
      value: 0,
      label: "",
    },
    roundLineSubtotalToCents: false,
  });

  assert.equal(
    cents(totals.total),
    cents(desiredTotal),
    `${label} should land on the requested final total`
  );

  return {
    result,
    adjustedItems,
    totals,
  };
}

const taxableTargets = [100, 99.99, 712.84, 1300];

for (const target of taxableTargets) {
  assertReverseTotal({
    label: `Taxable ${target}`,
    desiredTotal: target,
    taxRate: 9.9,
  });
}

assertReverseTotal({
  label: "No tax",
  desiredTotal: 712.84,
  taxRate: 0,
});

const reopenedEstimateBlankPrice = assertReverseTotal({
  label: "Reopened estimate blank selected unit price",
  desiredTotal: 712.85,
  taxRate: 9.9,
  lineItems: [
    {
      description: "Fireplace Resurfacing",
      quantity: "1",
      unitPrice: "",
    },
  ],
  selectedLineIndex: 0,
});

assert.equal(
  cents(reopenedEstimateBlankPrice?.totals.total ?? 0),
  71285,
  "existing estimate edit should reverse calculate from a blank selected price"
);

const savedLineAfterReopen = {
  description: "Fireplace Resurfacing",
  quantity: "1",
  unitPrice: reopenedEstimateBlankPrice?.result.unitPrice ?? "",
};
const reopenedAgain = assertReverseTotal({
  label: "Reopened estimate persisted calculated line",
  desiredTotal: 712.85,
  taxRate: 9.9,
  lineItems: [savedLineAfterReopen],
  selectedLineIndex: 0,
});

assert.equal(
  cents(reopenedAgain?.totals.total ?? 0),
  71285,
  "saved calculated line should reopen at the same final total"
);

const reopenedInvoiceBlankPrice = assertReverseTotal({
  label: "Reopened invoice blank selected unit price",
  desiredTotal: 712.85,
  taxRate: 9.9,
  lineItems: [
    {
      description: "Fireplace Resurfacing",
      quantity: "1",
      unitPrice: "",
    },
  ],
  selectedLineIndex: 0,
});

assert.equal(
  cents(reopenedInvoiceBlankPrice?.totals.total ?? 0),
  71285,
  "existing invoice edit should reverse calculate from a blank selected price"
);

const multiLine = assertReverseTotal({
  label: "Selected invoice line only",
  desiredTotal: 712.84,
  taxRate: 9.9,
  lineItems: [
    {
      description: "Keep existing line",
      quantity: "1",
      unitPrice: "100",
    },
    {
      description: "Adjust this line",
      quantity: "1",
      unitPrice: "1",
    },
  ],
  selectedLineIndex: 1,
});

assert.equal(
  multiLine?.adjustedItems[0].unitPrice,
  "100",
  "multi-line reverse calculation must not redistribute unrelated lines"
);

const discounted = reverseCalculateFinalTotal({
  desiredTotal: 712.84,
  lineItems: [
    {
      description: "Discount-aware edit line",
      quantity: "1",
      unitPrice: "1",
    },
  ],
  selectedLineIndex: 0,
  taxRate: 9.9,
  discount: {
    enabled: true,
    type: "fixed",
    value: 25,
    label: "Courtesy",
  },
});

assert.equal(
  discounted.ok,
  true,
  "discount-aware edit documents should reverse calculate"
);

if (discounted.ok) {
  const totals = calculateDiscountedDocumentTotals({
    lineSubtotal: Number(discounted.unitPrice),
    taxRate: 9.9,
    discount: {
      enabled: true,
      type: "fixed",
      value: 25,
      label: "Courtesy",
    },
    roundLineSubtotalToCents: false,
  });

  assert.equal(
    cents(totals.total),
    71284,
    "discount-aware total should land exactly on $712.84"
  );
}

const invalid = reverseCalculateFinalTotal({
  desiredTotal: 100,
  lineItems: [
    {
      description: "Invalid quantity",
      quantity: "0",
      unitPrice: "10",
    },
  ],
  selectedLineIndex: 0,
  taxRate: 9.9,
});

assert.equal(invalid.ok, false, "zero quantity should be rejected");

const estimateEdit = readFileSync(
  resolve(root, "src/app/estimates/[id]/edit/page.tsx"),
  "utf8"
);
const invoiceEdit = readFileSync(
  resolve(root, "src/app/invoices/[id]/edit/page.tsx"),
  "utf8"
);

assert(
  estimateEdit.includes('updateLineItem(') &&
    estimateEdit.includes('"unitPrice"') &&
    !estimateEdit.includes('.from("service_items").update') &&
    !estimateEdit.includes(".from('service_items').update"),
  "estimate reverse calculation must only update the document line, not Saved Service defaults"
);

assert(
  invoiceEdit.includes('updateLineItem(') &&
    invoiceEdit.includes('"unitPrice"') &&
    !invoiceEdit.includes('.from("service_items").update') &&
    !invoiceEdit.includes(".from('service_items').update"),
  "invoice reverse calculation must only update the document line, not Saved Service defaults"
);

console.log("reverse total regression passed");
