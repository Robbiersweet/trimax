import {
  calculateDiscountedDocumentTotals,
  type DiscountDraft,
} from "./documentDiscounts.ts";

export type ReverseTotalLineItem = {
  description: string;
  quantity: string | number;
  unitPrice: string | number;
};

export type ReverseTotalResult =
  | {
      ok: true;
      selectedLineIndex: number;
      unitPrice: string;
      lineTotal: number;
      subtotal: number;
      taxAmount: number;
      discountAmount: number;
      total: number;
    }
  | {
      ok: false;
      message: string;
    };

const defaultDiscount: DiscountDraft = {
  enabled: false,
  type: "fixed",
  value: 0,
  label: "",
};

function toCents(value: number) {
  return Math.round((Number(value) || 0) * 100);
}

function lineTotalUnits(item: ReverseTotalLineItem) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;

  return Math.round(quantity * unitPrice * 10_000);
}

function formatUnitPrice(value: number) {
  const fixed = value.toFixed(4);

  return fixed.replace(/\.?0+$/, "");
}

function calculateTotalCents({
  subtotalUnits,
  taxRate,
  discount,
}: {
  subtotalUnits: number;
  taxRate: number;
  discount: DiscountDraft;
}) {
  const totals = calculateDiscountedDocumentTotals({
    lineSubtotal: subtotalUnits / 10_000,
    taxRate,
    discount,
    roundLineSubtotalToCents: false,
  });

  return {
    totals,
    totalCents: toCents(totals.total),
  };
}

export function reverseCalculateFinalTotal({
  desiredTotal,
  lineItems,
  selectedLineIndex,
  taxRate,
  discount = defaultDiscount,
}: {
  desiredTotal: string | number;
  lineItems: ReverseTotalLineItem[];
  selectedLineIndex: number;
  taxRate: number;
  discount?: DiscountDraft;
}): ReverseTotalResult {
  const targetCents = toCents(Number(desiredTotal));

  if (targetCents <= 0) {
    return {
      ok: false,
      message: "Enter a final total greater than $0.00.",
    };
  }

  if (!lineItems.length) {
    return {
      ok: false,
      message: "Add a line item before reverse calculating.",
    };
  }

  const selectedItem = lineItems[selectedLineIndex];

  if (!selectedItem) {
    return {
      ok: false,
      message: "Choose the line item Trimax should adjust.",
    };
  }

  const selectedQuantity = Number(selectedItem.quantity) || 0;

  if (selectedQuantity <= 0) {
    return {
      ok: false,
      message: "The adjustable line needs a quantity greater than zero.",
    };
  }

  const otherSubtotalUnits = lineItems.reduce((total, item, index) => {
    return index === selectedLineIndex ? total : total + lineTotalUnits(item);
  }, 0);
  const normalizedTaxRate = Math.max(0, Number(taxRate) || 0);
  const normalizedDiscount: DiscountDraft = {
    ...discount,
    value: discount.value ?? 0,
  };

  let high = Math.max(targetCents * 100, otherSubtotalUnits, 10_000);
  let highTotal = calculateTotalCents({
    subtotalUnits: otherSubtotalUnits + high,
    taxRate: normalizedTaxRate,
    discount: normalizedDiscount,
  }).totalCents;

  while (highTotal < targetCents && high < 1_000_000_000) {
    high *= 2;
    highTotal = calculateTotalCents({
      subtotalUnits: otherSubtotalUnits + high,
      taxRate: normalizedTaxRate,
      discount: normalizedDiscount,
    }).totalCents;
  }

  if (highTotal < targetCents) {
    return {
      ok: false,
      message: "That total is outside the supported price range.",
    };
  }

  let low = 0;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const midTotal = calculateTotalCents({
      subtotalUnits: otherSubtotalUnits + mid,
      taxRate: normalizedTaxRate,
      discount: normalizedDiscount,
    }).totalCents;

    if (midTotal < targetCents) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const candidateWindow = Array.from(
    { length: 20_001 },
    (_, index) => Math.max(0, low - 10_000 + index)
  );
  const matchingLineTotalUnits = candidateWindow.find((candidateUnits) => {
    return (
      calculateTotalCents({
        subtotalUnits: otherSubtotalUnits + candidateUnits,
        taxRate: normalizedTaxRate,
        discount: normalizedDiscount,
      }).totalCents === targetCents
    );
  });

  if (matchingLineTotalUnits === undefined) {
    return {
      ok: false,
      message:
        "Trimax could not land exactly on that final total with the selected line.",
    };
  }

  const { totals } = calculateTotalCents({
    subtotalUnits: otherSubtotalUnits + matchingLineTotalUnits,
    taxRate: normalizedTaxRate,
    discount: normalizedDiscount,
  });

  return {
    ok: true,
    selectedLineIndex,
    unitPrice: formatUnitPrice(
      matchingLineTotalUnits / 10_000 / selectedQuantity
    ),
    lineTotal: matchingLineTotalUnits / 10_000,
    subtotal: totals.lineSubtotal,
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    total: totals.total,
  };
}
