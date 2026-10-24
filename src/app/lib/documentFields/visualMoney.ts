/** Exact visual formatting only; no business values or floating-point rounding. */
export function normalizeVisualMoney(raw: string): number | null {
  // Separate complete amounts must never become a single amount after whitespace removal.
  if (/\d[.,]\d{2}\s+\$?\d/.test(raw.normalize('NFKC'))) return null;
  const text = raw.normalize('NFKC').replace(/\s+/g, '');
  // Only separator formatting changes. The observed digit sequence is immutable.
  if (!/^\$?(?:\d+|\d{1,3}(?:[,.]\d{3})+)[.,]\d{2}$/.test(text)) return null;
  const cents = Number(text.replace(/[$,.]/g, ''));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
