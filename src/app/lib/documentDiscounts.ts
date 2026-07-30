export type DiscountType = "fixed" | "percentage";

export type DiscountDraft = {
  enabled: boolean;
  type: DiscountType;
  value: string | number;
  label?: string | null;
};

export type DiscountTotals = {
  lineSubtotal: number;
  discountAmount: number;
  taxableSubtotal: number;
  taxAmount: number;
  total: number;
};

export const discountLinePrefix = "Discount";

function toCents(value: number) {
  return Math.round((Number(value) || 0) * 100);
}

function centsToNumber(cents: number) {
  return cents / 100;
}

export function numberValue(value: string | number | null | undefined) {
  return Number(value) || 0;
}

export function isDiscountLine(description: string | null | undefined) {
  return /^discount\b/i.test((description ?? "").trim());
}

export function calculateDiscountAmount({
  subtotal,
  discount,
}: {
  subtotal: number;
  discount: DiscountDraft;
}) {
  const subtotalCents = Math.max(0, toCents(subtotal));

  if (!discount.enabled || subtotalCents <= 0) {
    return 0;
  }

  const rawValue = Math.max(0, numberValue(discount.value));
  const discountCents =
    discount.type === "percentage"
      ? Math.round(subtotalCents * (Math.min(rawValue, 100) / 100))
      : toCents(rawValue);

  return centsToNumber(Math.min(subtotalCents, Math.max(0, discountCents)));
}

export function calculateDiscountedDocumentTotals({
  lineSubtotal,
  taxRate,
  discount,
}: {
  lineSubtotal: number;
  taxRate: number;
  discount: DiscountDraft;
}): DiscountTotals {
  const subtotalCents = Math.max(0, toCents(lineSubtotal));
  const discountCents = toCents(
    calculateDiscountAmount({
      subtotal: centsToNumber(subtotalCents),
      discount,
    })
  );
  const taxableSubtotalCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxableSubtotalCents * ((Number(taxRate) || 0) / 100));

  return {
    lineSubtotal: centsToNumber(subtotalCents),
    discountAmount: centsToNumber(discountCents),
    taxableSubtotal: centsToNumber(taxableSubtotalCents),
    taxAmount: centsToNumber(taxCents),
    total: centsToNumber(taxableSubtotalCents + taxCents),
  };
}

export function discountDisplayLabel(discount: DiscountDraft) {
  const label = discount.label?.trim() || "Discount";
  const rawValue = Math.max(0, numberValue(discount.value));

  if (discount.type === "percentage") {
    return `${discountLinePrefix} - ${label} (${rawValue}%)`;
  }

  return `${discountLinePrefix} - ${label}`;
}

export function parseDiscountFromLineItem({
  description,
  lineTotal,
  unitPrice,
}: {
  description: string | null | undefined;
  lineTotal: string | number | null | undefined;
  unitPrice: string | number | null | undefined;
}): DiscountDraft | null {
  const text = (description ?? "").trim();

  if (!isDiscountLine(text)) {
    return null;
  }

  const percentMatch = text.match(/\((\d+(?:\.\d+)?)%\)/);
  const amount = Math.abs(numberValue(lineTotal) || numberValue(unitPrice));
  const label = text
    .replace(/^discount\s*[-:]?\s*/i, "")
    .replace(/\(\d+(?:\.\d+)?%\)/, "")
    .trim();

  return {
    enabled: true,
    type: percentMatch ? "percentage" : "fixed",
    value: percentMatch ? percentMatch[1] : String(amount),
    label: label || "Discount",
  };
}
