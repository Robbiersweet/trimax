// Offline evidence replay. Existing money and total authority policies stay unchanged.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { EvidenceLedger, type EvidenceObservation } from './evidenceLedger.ts';
import { decideMoney, paymentMoney, type PaymentObservation, type DocumentPaymentEvidence } from './paymentEvidence.ts';
import { validateRetainedAmounts, decideDocumentTotal } from './documentTotalAuthority.ts';
import type { structuralLayout } from '../layout/generalized.ts';
type Layout = Awaited<ReturnType<typeof structuralLayout>>;
export type RetainedPaymentObservation = { observation: PaymentObservation; stage: string; timestamp: string; configuration: string; variant: string; currentGeometry?: boolean; rejectionReason?: string };
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export async function preservePaymentEvidence(image: Buffer, layout: Layout, original: DocumentPaymentEvidence, retained: RetainedPaymentObservation[], ledger: EvidenceLedger) {
  const start = performance.now(), evidence = structuredClone(original), references = new Map<string, PaymentObservation>(), sourceHash = hash(image), cropHashes = new Map<string, string>();
  for (const item of retained) {
    const o = item.observation;
    let reason = '';
    try {
      if (!item.rejectionReason) {
      const key = JSON.stringify(o.bounds);
      if (!cropHashes.has(key)) cropHashes.set(key, hash(await sharp(image).extract(o.bounds).flatten({ background: 'white' }).png().toBuffer()));
      if (o.sourceHash !== sourceHash) reason = 'source hash mismatch';
      else if (cropHashes.get(key) !== o.cropHash) reason = 'crop hash mismatch or original crop hash unavailable';
      else if (o.field === 'amount') {
        const index = evidence.rows.findIndex(r => r.rowId === o.rowId), region = layout.rows[index]?.amountRegion;
        if (!item.currentGeometry || JSON.stringify(region) !== JSON.stringify(o.bounds)) {
          const audit = await validateRetainedAmounts(image, layout, evidence, [o]);
          reason = audit.rejected[0]?.reason ?? '';
        }
      }
      }
    } catch { reason = 'invalid or unavailable crop geometry'; }
    if (item.rejectionReason) reason = item.rejectionReason;
    const reference = `${item.stage}:${o.id}:${retained.indexOf(item)}`;
    const entry: EvidenceObservation = { field: o.field, documentId: original.documentId, rowId: o.rowId, sourceHash: o.sourceHash, cropHash: o.cropHash, region: o.bounds, recognizer: 'tesseract.js-eng-lstm', variant: item.variant, configuration: item.configuration, raw: o.raw,
      normalized: o.field === 'amount' || o.field === 'total' ? paymentMoney(o.raw).map(String) : [o.raw.trim().replace(/\s+/g, ' ')], confidence: o.confidence,
      provenance: { valid: !reason, reason: reason || 'Verified normalized source and crop; scoped optical observation', reference }, timestamp: item.timestamp, stage: item.stage };
    ledger.append(entry); references.set(reference, o);
  }
  const projection = ledger.project();
  const observations = projection.accepted.flatMap(e => {
    const o = references.get(e.provenance.reference);
    // Alias names/stages/crops are not new preprocessing variants. The old
    // authority functions count only canonical preprocessing configurations.
    return o ? [{ ...o, id: e.runKey, variant: `${e.variant}:${e.configuration}`, confidence: e.confidence, money: paymentMoney(o.raw) }] : [];
  });
  evidence.rows = evidence.rows.map(row => { const own = observations.filter(o => o.field === 'amount' && o.rowId === row.rowId); return { rowId: row.rowId, ...decideMoney(own), observations: own }; });
  const authority = decideDocumentTotal(layout, evidence, observations.filter(o => o.scope === 'document'));
  evidence.authoritativeTotal = authority.cents;
  return { evidence, authority, observations, ledgerMs: performance.now() - start, audit: { entries: ledger.snapshot().entries.length, unique: projection.accepted.length, duplicates: projection.duplicateCount, conflicts: projection.conflicts, rejected: projection.rejected } };
}
