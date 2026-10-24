import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSavedRemittancePayment, type SavedRemittanceActivity, type SavedRemittanceHistoricalIdentity } from './savedRemittancePayment';
import type { RemittanceAttempt } from './remittanceAttempt';

/** Read only. An invoice's present balance is never historical payment evidence. */
export async function loadSavedRemittancePayment(client: Pick<SupabaseClient, 'from'>, businessId: string, attemptId: string) {
  const { data: attempt, error } = await client.from('ocr_attempts')
    .select('id,business_id,summary').eq('business_id', businessId).eq('id', attemptId).maybeSingle();
  if (error || !attempt) throw Error('Saved remittance is unavailable in this workspace.');
  const { data: job, error: jobError } = await client.from('ocr_legacy_jobs')
    .select('attempt_id,source_reference,source_hash').eq('business_id', businessId).eq('attempt_id', attemptId).maybeSingle();
  if (jobError) throw Error('Saved remittance source could not be verified.');
  const ids = new Set<string>([attemptId]);
  // original_id/parent_id can include a NEW photo. Only the durable job's exact
  // canonical object plus hash establishes shared retained-image ancestry.
  const canonicalReference = job?.source_reference ?? attempt.summary?.canonicalReference ?? attemptId;
  const sourceImageHash = job?.source_hash ?? attempt.summary?.sourceImageHash ?? null;
  if (job?.source_reference && job?.source_hash) {
    const { data: family, error: familyError } = await client.from('ocr_legacy_jobs')
      .select('attempt_id').eq('business_id', businessId).eq('source_reference', job.source_reference)
      .eq('source_hash', job.source_hash).limit(101);
    if (familyError || (family?.length ?? 0) > 100) throw Error('Retained remittance history needs investigation.');
    for (const row of family ?? []) ids.add(row.attempt_id);
    const { data: source, error: sourceError } = await client.from('ocr_attempts').select('id,summary')
      .eq('business_id', businessId).eq('id', job.source_reference).maybeSingle();
    if (sourceError) throw Error('Retained remittance source could not be verified.');
    if (source) {
      if (source.summary?.sourceImageHash !== job.source_hash || source.summary?.canonicalReference !== source.id)
        throw Error('Retained remittance canonical source is inconsistent.');
      ids.add(source.id);
    }
  }
  const activities: SavedRemittanceActivity[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error: auditError } = await client.from('activity_logs')
      .select('id,business_id,action,entity_id,entity_label,created_at,details')
      .eq('business_id', businessId).eq('action', 'invoice.batch_payment_applied')
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
    if (auditError || !data) throw Error('Payment history could not be verified. Your saved scan is retained.');
    for (const row of data) activities.push({ id: row.id, businessId: row.business_id, action: row.action,
      entityId: row.entity_id, entityLabel: row.entity_label, createdAt: row.created_at, details: row.details });
    if (data.length < 500) break;
    if (offset >= 9500) throw Error('Payment history is too large for a complete lookup. Contact the workspace owner.');
  }
  // Pre-attribution audits require a COMPLETE, reconciled original review. OCR
  // placeholders, current balances and fuzzy document fingerprints are excluded.
  let trustedOriginal: SavedRemittanceHistoricalIdentity | null = null;
  if (!activities.some(row => ids.has(String(row.details?.sourceOcrAttemptId ?? '')))) {
    const { data: diagnostics, error: diagnosticError } = await client.from('ocr_attempt_diagnostics')
      .select('payload').eq('attempt_id', attemptId).maybeSingle();
    if (diagnosticError) throw Error('Original saved review could not be verified.');
    const review = diagnostics?.payload?.attempt as RemittanceAttempt | undefined;
    const header = review?.evidence?.headerEvidence, proof = review?.reconciliationResult;
    if (review?.evidence?.attemptId === attemptId && proof?.eligible && header?.documentTotal?.payable &&
      header.documentTotal.source === 'explicit-document-total' && header.checkNumber && header.checkDate && header.payor &&
      proof.reviewIds.length && proof.documentTotal === header.documentTotal.amount) {
      trustedOriginal = {checkNumber: header.checkNumber, checkDate: header.checkDate, payor: header.payor,
        amount: header.documentTotal.amount, invoiceIds: [...proof.reviewIds]};
    }
  }
  return { ...resolveSavedRemittancePayment({businessId, attemptIds: [...ids], activities, trustedOriginal}),
    attemptId, canonicalReference, sourceImageHash };
}
