/** Vendor-neutral vocabulary. Only label text is corrected, never field values. */
export type SemanticType = 'property_name' | 'customer_name' | 'payor_name' | 'payee_name' | 'account_number' | 'check_number' | 'check_date' | 'date' | 'invoice_number' | 'unit' | 'row_amount' | 'subtotal' | 'document_total' | 'description' | 'balance' | 'remittance';
const vocabulary: Record<string, SemanticType> = {
  PROPERTY: 'property_name', CUSTOMER: 'customer_name', CLIENT: 'customer_name', PAYOR: 'payor_name', PAYER: 'payor_name', REMITTER: 'payor_name', ORGANIZATION: 'payor_name',
  PAYEE: 'payee_name', 'REMIT TO': 'payee_name', 'PAY TO': 'payee_name', ACCOUNT: 'account_number', 'ACCOUNT NUMBER': 'account_number',
  INVOICE: 'invoice_number', 'INVOICE NUMBER': 'invoice_number', UNIT: 'unit', DATE: 'date', 'CHECK DATE': 'check_date',
  CHECK: 'check_number', 'CHECK NO': 'check_number', 'CHECK NUMBER': 'check_number', CK: 'check_number', CHK: 'check_number',
  AMOUNT: 'row_amount', TOTAL: 'document_total', 'GRAND TOTAL': 'document_total', 'CHECK AMOUNT': 'document_total', 'PAYMENT AMOUNT': 'document_total',
  SUBTOTAL: 'subtotal', 'SUB TOTAL': 'subtotal', BALANCE: 'balance', DESCRIPTION: 'description', REMITTANCE: 'remittance',
};
export function normalizeLabel(raw: string) {
  return raw.normalize('NFKC').toUpperCase().replace(/[#:：.]/g, ' ').replace(/\s+/g, ' ').trim();
}
function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) { const next = [i + 1]; for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + Number(a[i] !== b[j]))); previous = next; }
  return previous[b.length];
}
export function recognizeLabel(raw: string) {
  const normalized = normalizeLabel(raw);
  if (vocabulary[normalized]) return { type: vocabulary[normalized], normalized, correction: 'formatting-only' as const };
  // Protected terms cannot be confused with payer identity or final totals.
  if (/SUB|BALANCE|PAYEE|TOTALS|REMIT TO/.test(normalized) || normalized.length < 5 || /\d/.test(normalized)) return null;
  const options = Object.keys(vocabulary).filter(label => label.length >= 5 && distance(normalized, label) === 1);
  return options.length === 1 ? { type: vocabulary[options[0]], normalized: options[0], correction: 'single-label-edit' as const } : null;
}
export function normalizeOrganization(raw: string) {
  // No aliases, missing-letter completion, legal-suffix removal or database input.
  const display = raw.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  return { display, key: display.toLocaleLowerCase('en-US').replace(/[.,]/g, '').replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim() };
}
