/** Bounded optical money recognition. No invoice snapshot or expected values. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Bounds } from '../types.ts';
import type { DocumentSemanticModel, SemanticObservation } from '../semantics/model.ts';
import { inspectStructuralLines, type structuralLayout } from '../layout/generalized.ts';
import { EvidenceLedger } from './evidenceLedger.ts';
import { fieldVariant } from './index.ts';
import { decideMoney, paymentMoney, type PaymentObservation, type DocumentPaymentEvidence } from './paymentEvidence.ts';
import { decideDocumentTotal } from './documentTotalAuthority.ts';

const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const bottom = (b: Bounds) => b.top + b.height;
const right = (b: Bounds) => b.left + b.width;
type Layout = Awaited<ReturnType<typeof structuralLayout>>;

/** Numeric whitelists can give correlated, confident-looking wrong digits.
 * Require a strong observation, and retain any credible competing value.
 * Existing invoice fusion and document-total authority are untouched. */
export function decideRowMoney(observations: PaymentObservation[]) {
  const decision = decideMoney(observations);
  const strong = observations.filter(o => o.confidence >= 85 && o.money.length === 1);
  const values = [...new Set(strong.flatMap(o => o.money))];
  const cents = values.length === 1 && !observations.some(o => o.confidence >= 40 && o.money.some(v => v !== values[0])) ? values[0] : null;
  return { ...decision, cents, ambiguity: cents !== null ? 'supported' as const : decision.candidates.length ? 'conflicting' as const : 'missing' as const,
    confidence: cents === null ? 'unavailable' as const : decision.confidence,
    provenance: cents === null ? [] : observations.filter(o => o.money.length === 1 && o.money[0] === cents).map(o => o.id),
    rejectionReason: cents !== null ? null : values.length ? 'Credible competing monetary transcription' : 'No strong complete monetary transcription' };
}

export async function recognizeSemanticMoney(image: Buffer, model: DocumentSemanticModel, page: SemanticObservation[], ledger: EvidenceLedger) {
  const started = performance.now(), sourceHash = hash(image), meta = await sharp(image).metadata();
  if (sourceHash !== model.sourceHash || sourceHash !== ledger.sourceHash) throw Error('Money source mismatch');
  const structure = await inspectStructuralLines(image);
  const font = structure.font * structure.scaleY;
  const pad = Math.max(2, Math.ceil(font * .2));
  const regions = model.table.rows.map(row => {
    const owner = row.amountRegion;
    if (!owner) return { rowId: row.id, ownership: null, bounds: null };
    const cs = structure.components.filter(c => c.left * structure.scaleX >= owner.left && (c.left + c.width) * structure.scaleX <= right(owner)
      && c.top * structure.scaleY >= owner.top && (c.top + c.height) * structure.scaleY <= bottom(owner)
      && c.height * structure.scaleY <= owner.height && c.pixels >= 3);
    if (!cs.length) return { rowId: row.id, ownership: owner, bounds: null };
    const left = Math.max(owner.left, Math.floor(Math.min(...cs.map(c => c.left * structure.scaleX)) - pad));
    const top = Math.max(owner.top, Math.floor(Math.min(...cs.map(c => c.top * structure.scaleY)) - pad));
    return { rowId: row.id, ownership: owner, bounds: { left, top,
      width: Math.min(right(owner), Math.ceil(Math.max(...cs.map(c => (c.left + c.width) * structure.scaleX))) + pad) - left,
      height: Math.min(bottom(owner), Math.ceil(Math.max(...cs.map(c => (c.top + c.height) * structure.scaleY))) + pad) - top } };
  });
  const last = Math.max(...model.table.rows.map(r => bottom(r.bounds)));
  const rowHeight = Math.max(...model.table.rows.map(r => r.bounds.height));
  const complete = regions.every(r => r.bounds !== null) && regions.length > 0;
  const footerCandidates = complete ? structure.lines.filter(l => l.top * structure.scaleY >= last && l.top * structure.scaleY - last <= rowHeight * 4
    && regions.every(r => Math.abs((l.left + l.width) * structure.scaleX - right(r.bounds!)) <= font * 2)
    && l.left * structure.scaleX >= Math.min(...regions.map(r => r.ownership!.left))) : [];
  const footer = footerCandidates.length === 1 ? footerCandidates[0] : null;
  const totalBounds = footer ? { left: Math.max(0, Math.floor(footer.left * structure.scaleX - pad)), top: Math.max(last, Math.floor(footer.top * structure.scaleY - pad)),
    width: Math.ceil(footer.width * structure.scaleX + pad * 2), height: Math.ceil(footer.height * structure.scaleY + pad * 2) } : undefined;
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => undefined });
  let passes = 0, reused = 0;
  const observations: PaymentObservation[] = [];
  async function observe(bounds: Bounds, variant: 'native' | 'local-contrast', field: 'amount' | 'total' | 'header', rowId?: string) {
    if (bounds.left < 0 || bounds.top < 0 || right(bounds) > meta.width! || bottom(bounds) > meta.height!) throw Error('Money crop outside source');
    const prepared = await fieldVariant(image, { regionId: rowId ?? field, field: field === 'header' ? 'header' : 'amount', bounds, ownership: bounds }, variant);
    const cropHash = hash(prepared.pixels), numeric = field !== 'header', configuration = numeric ? 'money-v1-psm8-numeric-scale2' : 'money-v1-psm7-label-scale2';
    const retained = ledger.project(field, rowId).accepted.filter(e => e.cropHash === cropHash && JSON.stringify(e.region) === JSON.stringify(bounds)
      && e.variant === variant && e.configuration === configuration && e.recognizer === 'tesseract.js-eng-lstm');
    const began = performance.now();
    let raw: string, confidence: number, words: PaymentObservation['words'];
    if (retained.length === 1 && retained[0].words) { raw = retained[0].raw; confidence = retained[0].confidence; words = retained[0].words; reused++; }
    else {
      await worker.setParameters({ tessedit_pageseg_mode: numeric ? PSM.SINGLE_WORD : PSM.SINGLE_LINE, tessedit_char_whitelist: numeric ? '0123456789$,.' : '', user_defined_dpi: '300' });
      const { data } = await worker.recognize(prepared.image, {}, { text: true, blocks: true }); passes++;
      raw = data.text; confidence = data.confidence;
      words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))).map(w => ({ text: w.text, confidence: w.confidence,
        bounds: { left: bounds.left + (w.bbox.x0 - 12) / 2, top: bounds.top + (w.bbox.y0 - 12) / 2, width: (w.bbox.x1 - w.bbox.x0) / 2, height: (w.bbox.y1 - w.bbox.y0) / 2 } }));
      ledger.append({ field, rowId, documentId: ledger.documentId, sourceHash, cropHash, region: bounds, recognizer: 'tesseract.js-eng-lstm', variant, configuration,
        raw, normalized: paymentMoney(raw).map(String), confidence, words, provenance: { valid: true, reason: 'Exact normalized pixels and physical monetary field ownership', reference: rowId ?? field }, stage: 'phase6-money', timestamp: new Date().toISOString() });
      const projected = ledger.project(field, rowId).accepted.find(e => e.cropHash === cropHash && JSON.stringify(e.region) === JSON.stringify(bounds) && e.variant === variant && e.configuration === configuration);
      confidence = projected?.confidence ?? 0;
      if (!projected) words = [];
    }
    const o: PaymentObservation = { id: `${ledger.documentId}:money:${rowId ?? field}:${variant}`, scope: rowId ? 'row' : 'document', rowId, field, bounds, variant,
      sourceHash, cropHash, raw, confidence, words, money: paymentMoney(raw), durationMs: performance.now() - began };
    observations.push(o); return o;
  }
  try {
    const rows = [];
    for (const region of regions) {
      const own = [];
      if (region.bounds) for (const variant of ['native', 'local-contrast'] as const) own.push(await observe(region.bounds, variant, 'amount', region.rowId));
      rows.push({ rowId: region.rowId, ...decideRowMoney(own), observations: own });
    }
    const totals = [];
    if (totalBounds) for (const variant of ['native', 'local-contrast'] as const) totals.push(await observe(totalBounds, variant, 'total'));
    const headers: PaymentObservation[] = page.filter(o => o.verified && o.sourceHash === sourceHash).map(o => ({ id: o.id, scope: 'document', field: 'header', variant: o.variant,
      raw: o.raw, bounds: o.region, sourceHash, cropHash: o.cropHash, confidence: o.confidence, durationMs: 0, words: o.words, money: paymentMoney(o.raw) }));
    // Exact observed label only. Do not alter or reread date/identity fields.
    const label = model.labels.filter(l => l.type === 'document_total' && l.correction === 'formatting-only' && bottom(l.bounds) <= (model.table.headerPosition?.top ?? 0)).sort((a,b) => b.confidence-a.confidence)[0];
    if (label) {
      const b = label.bounds, left = Math.max(0, Math.floor(b.left-pad)), top = Math.max(0, Math.floor(b.top-pad));
      const bounds = { left, top, width: Math.min(meta.width!-left, Math.ceil(b.width+pad*2)), height: Math.min(meta.height!-top, Math.ceil(b.height+pad*2)) };
      for (const variant of ['native', 'local-contrast'] as const) headers.push(await observe(bounds, variant, 'header'));
    }
    const evidence: DocumentPaymentEvidence = { documentId: ledger.documentId, sourceHash, checkNumber: null, checkDate: null, payor: null, authoritativeTotal: null,
      headerEvidence: { observations: headers, checkCandidates: [], dateCandidates: [], payorCandidates: [] }, rows,
      totalEvidence: { ...decideMoney(totals), authority: 'unknown', labelEvidence: [], observations: totals, belowLastRow: true },
      timings: { rowAmountsMs: 0, footerMs: 0, headerMs: 0, completeMs: performance.now()-started, passCount: passes } };
    const layout: Layout = { version: 'structural-layout-experiment-1', coordinateSpace: 'normalized-document-color', sourceWidth: meta.width!, sourceHeight: meta.height!,
      rows: model.table.rows.map((r,i) => ({ id: r.id, bounds: r.bounds, amountRegion: regions[i].bounds ?? undefined, invoiceRegion: r.invoiceRegion, baseline: { intercept: bottom(r.bounds), slope: 0 } })),
      headerRegion: model.table.headerPosition ?? undefined, totalCandidateRegion: totalBounds,
      diagnostics: { font: structure.font, slope: structure.slope, headerCandidates: 0, threshold: structure.threshold, durationMs: 0, warnings: [] } };
    const authority = decideDocumentTotal(layout, evidence, [...headers, ...totals]);
    // A weaker new pass cannot erase established semantic total evidence.
    if (model.total.cents !== null) {
      if (authority.cents !== null && authority.cents !== model.total.cents) { authority.cents = null; authority.reason = 'Conflicting established and specialized total evidence'; }
      else if (authority.subtotal !== null && authority.subtotal !== model.total.cents) { authority.cents = null; authority.reason = 'Observed row subtotal conflicts with established total'; }
      else if (authority.cents === null && !authority.headerValues.some(v => v !== model.total.cents) && !authority.supportedFooter.some(v => v.cents !== model.total.cents)) { authority.cents = model.total.cents; authority.reason = 'Preserved established semantic total authority'; }
    }
    return { version: 'semantic-money-1', regions, totalBounds, footerCandidateCount: footerCandidates.length, rows, authority, observations, reused, passes, durationMs: performance.now()-started };
  } finally { await worker.terminate(); }
}
