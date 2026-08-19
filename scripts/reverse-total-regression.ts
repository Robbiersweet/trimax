import assert from "node:assert/strict";
import { calculateDiscountedDocumentTotals } from "../src/app/lib/documentDiscounts.ts";
import {
  reverseCalculateFinalTotal,
  type ReverseTotalLineItem,
} from "../src/app/lib/reverseDocumentTotals.ts";

function cents(value: number) {
  return Math.round(value * 100);
}

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

console.log("reverse total regression passed");
