// Offline Phase 5D. No invoice records, expected names or benchmark labels enter here.
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { inspectStructuralLines, type structuralLayout } from '../layout/generalized.ts';
import { fieldVariant } from './index.ts';
import type { Bounds } from '../types.ts';
import { EvidenceLedger, type EvidenceObservation } from './evidenceLedger.ts';

type Layout = Awaited<ReturnType<typeof structuralLayout>>;
type Word = { text: string; confidence: number; bounds: Bounds };
export type IdentityObservation = EvidenceObservation & { words: Word[]; durationMs: number };
export type DocumentIdentityEvidence = {
  documentId: string; sourceHash: string; rawObservations: IdentityObservation[];
  propertyCandidates: string[]; accountCandidates: string[]; payorCandidates: string[];
  payor: string | null; confidence: 'supported' | 'unavailable'; ambiguity: string;
  provenance: string[]; labelBounds: Bounds | null; durationMs: number; passCount: number;
};
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export const normalizeIdentity = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Exact optical agreement only. No fuzzy repair or suffix completion. */
export function decideIdentity(observations: IdentityObservation[], ledger: EvidenceLedger, labelValid: boolean) {
  const projection = ledger.project('property');
  const candidates = [...new Set(projection.accepted.flatMap(o => o.normalized).filter(Boolean))];
  const supported = candidates.filter(value => {
    if (!/^[\p{L}\d][\p{L}\d &'’.,()/-]+$/u.test(value) || value.split(' ').length < 2) return false;
    const votes = projection.accepted.filter(o => o.normalized.includes(value) && o.confidence >= 80);
    // Repeated rows are independent image regions; two variants can corroborate a
    // single row only at high confidence. Duplicate reruns never add votes.
    return votes.length >= 2 && (new Set(votes.map(o => o.cropHash)).size >= 2 || votes.every(o => o.confidence >= 90));
  });
  const strongConflict = supported.length === 1 && projection.accepted.some(o => o.confidence >= 90 && o.normalized.length && !o.normalized.includes(supported[0]));
  const payor = labelValid && supported.length === 1 && !strongConflict && !projection.conflicts.length ? supported[0] : null;
  return { payor, propertyCandidates: candidates, accountCandidates: [...new Set(observations.filter(o => o.field === 'account').flatMap(o => o.normalized))],
    payorCandidates: supported, confidence: payor ? 'supported' as const : 'unavailable' as const,
    ambiguity: payor ? 'Exact labeled optical agreement' : !labelValid ? 'No reliable exact property label and account boundary' : strongConflict || supported.length > 1 || projection.conflicts.length ? 'Conflicting identity observations' : 'Insufficient exact high-confidence property agreement',
    provenance: payor ? projection.accepted.filter(o => o.normalized.includes(payor)).map(o => o.provenance.reference) : [] };
}

export async function recognizeDocumentIdentity(image: Buffer, layout: Layout, documentId: string, ledger: EvidenceLedger): Promise<DocumentIdentityEvidence> {
  const start = performance.now(), sourceHash = hash(image), metadata = await sharp(image).metadata();
  if (sourceHash !== ledger.sourceHash || documentId !== ledger.documentId || metadata.width !== layout.sourceWidth || metadata.height !== layout.sourceHeight) throw Error('Identity image/layout/ledger mismatch');
  const rawObservations: IdentityObservation[] = [];
  let labelBounds: Bounds | null = null, labelValid = false;
  const a = await inspectStructuralLines(image), header = layout.headerRegion;
  if (!header || !layout.rows.length) return { documentId, sourceHash, rawObservations, ...decideIdentity(rawObservations, ledger, false), labelBounds, durationMs: performance.now() - start, passCount: 0 };
  const line = a.lines.reduce((best, l) => Math.abs(l.top * a.scaleY - header.top) < Math.abs(best.top * a.scaleY - header.top) ? l : best, a.lines[0]);
  const right = Math.min(...layout.rows.flatMap(r => r.invoiceRegion ? [r.invoiceRegion.left] : []));
  const extent = (cs: typeof a.components): Bounds | null => {
    if (!cs.length) return null;
    const left = Math.max(0, Math.floor((Math.min(...cs.map(c => c.left)) - 4) * a.scaleX)), top = Math.max(0, Math.floor((Math.min(...cs.map(c => c.top)) - 4) * a.scaleY));
    return { left, top, width: Math.min(a.sourceWidth - left, Math.ceil((Math.max(...cs.map(c => c.left + c.width)) + 4) * a.scaleX) - left), height: Math.min(a.sourceHeight - top, Math.ceil((Math.max(...cs.map(c => c.top + c.height)) + 4) * a.scaleY) - top) };
  };
  const heading = extent(a.components.filter(c => c.left + c.width < right / a.scaleX && Math.abs(c.centerY - a.slope * (c.left + c.width / 2) - line.center) < a.font * .85));
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => undefined });
  async function observe(field: string, bounds: Bounds, variant: 'native' | 'local-contrast', rowId?: string) {
    const begin = performance.now(), prepared = await fieldVariant(image, { regionId: field, field: 'header', bounds, ownership: bounds }, variant);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '', user_defined_dpi: '300' });
    const { data } = await worker.recognize(prepared.image, {}, { text: true, blocks: true });
    const observation: IdentityObservation = { field, documentId, rowId, sourceHash, cropHash: hash(prepared.pixels), region: bounds, recognizer: 'tesseract.js-eng-lstm', variant, configuration: 'psm7-scale2-border12', raw: data.text, normalized: normalizeIdentity(data.text) ? [normalizeIdentity(data.text)] : [], confidence: data.confidence,
      provenance: { valid: true, reason: 'Source-bound Phase 2 header/row component geometry', reference: `${documentId}:identity:${field}:${rowId ?? 'document'}:${variant}` }, timestamp: new Date().toISOString(), stage: 'phase5d-identity', durationMs: performance.now() - begin,
      words: (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))).map(w => ({ text: w.text, confidence: w.confidence, bounds: { left: bounds.left + (w.bbox.x0 - 12) / 2, top: bounds.top + (w.bbox.y0 - 12) / 2, width: (w.bbox.x1 - w.bbox.x0) / 2, height: (w.bbox.y1 - w.bbox.y0) / 2 } })) };
    rawObservations.push(observation); ledger.append(observation);
  }
  try {
    if (heading) for (const variant of ['native', 'local-contrast'] as const) await observe('identity-heading', heading, variant);
    const words = rawObservations.flatMap(o => o.words).filter(w => w.bounds.left >= 0 && w.bounds.top >= 0).sort((x, y) => y.confidence - x.confidence);
    const property = words.find(w => /^property$/i.test(w.text) && w.confidence >= 60), account = words.find(w => /^account$/i.test(w.text) && w.confidence >= 60);
    labelValid = !!property && !!account && property.bounds.left + property.bounds.width < account.bounds.left && account.bounds.left < right;
    labelBounds = property?.bounds ?? null;
    // A weak preceding heading can locate diagnostic crops but cannot establish
    // identity authority. Its raw spelling is never repaired to "Property".
    const diagnosticAnchor = property ?? words.find(w => account && /^[a-z]{4,}$/i.test(w.text) && w.bounds.left + w.bounds.width < account.bounds.left);
    if (diagnosticAnchor && account) for (const [i, row] of layout.rows.entries()) {
      for (const [field, left, end] of [['property', diagnosticAnchor.bounds.left - a.font * a.scaleX * .7, account.bounds.left - a.font * a.scaleX * .3], ['account', account.bounds.left - a.font * a.scaleX * .3, row.invoiceRegion?.left ?? right]] as const) {
        const bounds = extent(a.components.filter(c => c.left * a.scaleX >= left && (c.left + c.width) * a.scaleX < end && Math.abs(c.centerY * a.scaleY - row.baseline.slope * (c.left + c.width / 2) * a.scaleX - row.baseline.intercept) < a.font * a.scaleY * .8));
        if (bounds) for (const variant of ['native', 'local-contrast'] as const) await observe(field, bounds, variant, `${documentId}-${i}`);
      }
    }
  } finally { await worker.terminate(); }
  return { documentId, sourceHash, rawObservations, ...decideIdentity(rawObservations, ledger, labelValid), labelBounds, durationMs: performance.now() - start, passCount: rawObservations.length };
}
