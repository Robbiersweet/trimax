export const DEFAULT_ESTIMATE_TERMS =
  "This estimate is provided for review and approval. Final pricing may vary if scope, materials, or site conditions change.";

export const DEFAULT_INVOICE_TERMS =
  "Payment is due according to the terms shown on this invoice. Thank you for your business.";

export function resolveInvoiceTerms(terms: string | null | undefined) {
  const trimmed = terms?.trim();

  if (!trimmed || trimmed === DEFAULT_ESTIMATE_TERMS) {
    return DEFAULT_INVOICE_TERMS;
  }

  return trimmed;
}
