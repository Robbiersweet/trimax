import { moneyCents, centsToMoney } from './money.ts';

export type SavedRemittanceActivity = {
  id: string; businessId: string; action: string; entityId?: string | null;
  entityLabel?: string | null; createdAt?: string | null; details?: Record<string, unknown> | null;
};
export type SavedRemittanceHistoricalIdentity = {
  checkNumber: string; checkDate: string; payor: string; amount: number; invoiceIds: string[];
};
export type SavedRemittancePayment = {
  checkNumber: string; checkDate: string; payor: string; amount: number;
  receivedDate: string; appliedAt: string; activityLogIds: string[]; sourceAttemptIds: string[];
  allocations: { invoiceId: string; invoiceNumber: string; amount: number }[];
};
export type SavedRemittancePaymentResult = {
  status: 'none' | 'applied' | 'reversed' | 'ambiguous';
  match: 'source_attempt' | 'strict_historical' | null;
  payment: SavedRemittancePayment | null; reasons: string[];
};
const clean = (v: unknown) => String(v ?? '').trim();
const date = (v: unknown) => /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(clean(v)) ? clean(v).slice(0, 10) : '';
const check = (v: unknown) => clean(v).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const payor = (v: unknown) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const keys = (v: string[]) => [...new Set(v.map(clean).filter(Boolean))].sort();
const cents = (v: unknown) => {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  try { const n = moneyCents(v); return n > 0 ? n : null; } catch { return null; }
};
const reversed = (d: Record<string, unknown>) => clean(d.paymentOutcome).toLowerCase() === 'reversed' ||
  Boolean(clean(d.reversedAt) || clean(d.reversalDate)) || d.paymentReversed === true;

/** Read-only historical resolution. Callers supply only verified retained-image ancestry;
 * a fresh photograph is never ancestry. Current invoice balances have no role here. */
export function resolveSavedRemittancePayment(input: {
  businessId: string; attemptIds: string[]; activities: SavedRemittanceActivity[];
  trustedOriginal?: SavedRemittanceHistoricalIdentity | null;
}): SavedRemittancePaymentResult {
  const none: SavedRemittancePaymentResult = { status: 'none', match: null, payment: null, reasons: [] };
  if (!clean(input.businessId)) return none;
  const ids = new Set(keys(input.attemptIds));
  const rows = input.activities.filter(a => a.businessId === input.businessId &&
    (!clean(a.details?.businessId) || a.details?.businessId === input.businessId) &&
    a.action === 'invoice.batch_payment_applied');
  const groups = new Map<string, SavedRemittanceActivity[]>();
  for (const row of rows) {
    const d = row.details ?? {};
    const attachment = clean(d.paymentAttachmentId), source = clean(d.sourceOcrAttemptId);
    // The legacy key cannot distinguish repeat identical batches; completeness checks
    // below deliberately reject such a collision instead of choosing the first batch.
    const key = attachment ? `attachment:${attachment}` : source ? `source:${source}` :
      JSON.stringify([check(d.paymentReference), cents(d.checkAmount), date(d.checkDate),
        payor(d.payor), date(d.receivedDate ?? d.paymentDate)]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const candidates: { rows: SavedRemittanceActivity[]; match: 'source_attempt' | 'strict_historical'; incomplete?: boolean }[] = [];
  const original = input.trustedOriginal;
  for (const group of groups.values()) {
    if (group.some(a => ids.has(clean(a.details?.sourceOcrAttemptId)))) {
      candidates.push({ rows: group, match: 'source_attempt' }); continue;
    }
    if (!original || !check(original.checkNumber) || !date(original.checkDate) || !payor(original.payor) ||
      !cents(original.amount) || !original.invoiceIds.length) continue;
    // Fallback is only for historical audit records predating source attribution.
    if (group.some(a => clean(a.details?.sourceOcrAttemptId))) continue;
    const invoiceIds = keys(group.map(a => clean(a.details?.invoiceId || a.entityId)));
    const originalIds = keys(original.invoiceIds);
    // Corroborated history involving any of the original invoices must not be
    // silently treated as unpaid merely because an allocation audit is missing.
    // A partial or conflicting set can block reopening, but can never prove paid.
    if (!invoiceIds.some(id => originalIds.includes(id))) continue;
    if (group.every(a => { const d = a.details ?? {}; return check(d.paymentReference) === check(original.checkNumber) &&
      date(d.checkDate) === date(original.checkDate) && payor(d.payor) === payor(original.payor) &&
      cents(d.checkAmount) === cents(original.amount); })) candidates.push({ rows: group, match: 'strict_historical',
        incomplete: JSON.stringify(invoiceIds) !== JSON.stringify(originalIds) });
  }
  if (!candidates.length) return none;
  if (candidates.length !== 1) return { ...none, status: 'ambiguous', reasons: ['Multiple historical payment batches match this saved remittance.'] };
  const candidate = candidates[0], group = candidate.rows, first = group[0].details ?? {};
  const amount = cents(first.checkAmount), expected = Number(first.batchInvoiceCount);
  const allocations = group.map(a => ({ invoiceId: clean(a.details?.invoiceId || a.entityId),
    invoiceNumber: clean(a.details?.invoiceNumber || a.entityLabel), amount: cents(a.details?.amountApplied) }));
  const consistent = group.every(a => { const d = a.details ?? {}; return Boolean(
    clean(a.id) && cents(d.checkAmount) === amount && Number(d.batchInvoiceCount) === expected &&
    check(d.paymentReference) === check(first.paymentReference) && date(d.checkDate) === date(first.checkDate) &&
    payor(d.payor) === payor(first.payor) && date(d.receivedDate ?? d.paymentDate) === date(first.receivedDate ?? first.paymentDate)); });
  const reversalCount = group.filter(a => reversed(a.details ?? {})).length;
  const valid = !candidate.incomplete && consistent && amount !== null && check(first.paymentReference) && date(first.checkDate) && payor(first.payor) &&
    group.every(a => ['paid', 'partial', 'reversed'].includes(clean(a.details?.paymentOutcome).toLowerCase())) &&
    keys(group.map(a => clean(a.details?.sourceOcrAttemptId))).length <= 1 &&
    Number.isSafeInteger(expected) && expected > 0 && expected === group.length &&
    keys(group.map(a => a.id)).length === group.length &&
    allocations.every(a => a.invoiceId && a.amount !== null) &&
    keys(allocations.map(a => a.invoiceId)).length === group.length &&
    Number.isSafeInteger(allocations.reduce((sum, a) => sum + (a.amount ?? 0), 0)) &&
    allocations.reduce((sum, a) => sum + (a.amount ?? 0), 0) === amount &&
    (reversalCount === 0 || reversalCount === group.length);
  if (!valid) return { ...none, status: 'ambiguous', match: candidate.match,
    reasons: ['Historical payment allocations are incomplete, conflicting, or partially reversed.'] };
  return { status: reversalCount ? 'reversed' : 'applied', match: candidate.match, reasons: [], payment: {
    checkNumber: check(first.paymentReference), checkDate: date(first.checkDate), payor: clean(first.payor),
    amount: centsToMoney(amount!), receivedDate: date(first.receivedDate ?? first.paymentDate),
    appliedAt: group.map(a => clean(a.createdAt)).sort()[0], activityLogIds: group.map(a => a.id),
    sourceAttemptIds: keys(group.map(a => clean(a.details?.sourceOcrAttemptId))),
    allocations: allocations.map(a => ({ ...a, amount: centsToMoney(a.amount!) })),
  } };
}
