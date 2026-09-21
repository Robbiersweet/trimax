// Adapter for retained offline artifacts. This module never selects a customer template.
import { interpretDocument } from './interpret.ts';
import type { SemanticObservation } from './model.ts';
import type { DocumentIdentityEvidence } from '../recognition/documentIdentity.ts';
import type { preservePaymentEvidence } from '../recognition/preservePaymentEvidence.ts';
import type { structuralLayout } from '../layout/generalized.ts';
import type { EvidenceLedger } from '../recognition/evidenceLedger.ts';
type Replay = Awaited<ReturnType<typeof preservePaymentEvidence>>;
export function replayDocumentSemantics(layout: Awaited<ReturnType<typeof structuralLayout>>, replay: Replay, identity: DocumentIdentityEvidence, ledger: ReturnType<EvidenceLedger['snapshot']>) {
  const observations: SemanticObservation[] = replay.observations.map(o => ({ id: o.id, runKey: o.id, sourceHash: o.sourceHash, cropHash: o.cropHash, recognizer: 'tesseract.js-eng-lstm', variant: o.variant, raw: o.raw, confidence: o.confidence, region: o.bounds, words: o.words, verified: true, field: o.field, rowId: o.rowId }));
  for (const o of identity.rawObservations) {
    const entry = ledger.entries.find(e => e.provenance.reference === o.provenance.reference);
    observations.push({ id: o.provenance.reference, runKey: entry?.runKey ?? o.provenance.reference, sourceHash: o.sourceHash, cropHash: o.cropHash, recognizer: o.recognizer, variant: o.variant, raw: o.raw, confidence: o.confidence, region: o.region, words: o.words, verified: !!entry?.provenance.valid && !ledger.invalidations?.some(e => e.runKey === entry.runKey), field: o.field, rowId: o.rowId });
  }
  const first = layout.rows[0];
  return interpretDocument({ sourceHash: replay.evidence.sourceHash, observations, rows: layout.rows.map((row, i) => ({ id: replay.evidence.rows[i].rowId, bounds: row.bounds, amountRegion: row.amountRegion, amountCents: replay.evidence.rows[i].cents })),
    columns: [...(first?.invoiceRegion ? [{ type: 'invoice_number' as const, bounds: first.invoiceRegion }] : []), ...(first?.amountRegion ? [{ type: 'row_amount' as const, bounds: first.amountRegion }] : [])],
    preservedTotal: replay.authority.cents === null ? undefined : { cents: replay.authority.cents, provenance: replay.authority.labels.map(l => l.observationId) } });
}
