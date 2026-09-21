/** Offline vendor-neutral candidate entry. Legacy research layouts are not called.
 * Existing trusted words can bypass OCR entirely. Unknown layouts return review.
 * Invoice recognition/fusion and business resolution remain separate consumers. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { normalizeDocument } from '../documentNormalization.ts';
import { interpretDocument } from './interpret.ts';
import { EvidenceLedger } from '../recognition/evidenceLedger.ts';
import type { SemanticObservation } from './model.ts';
export { interpretDocument } from './interpret.ts';
export { recognizeLabel, normalizeOrganization } from './labels.ts';
export type { DocumentSemanticModel } from './model.ts';
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export async function recognizeSemanticPage(image: Buffer, ledger: EvidenceLedger, retained: SemanticObservation[] = []) {
  const started = performance.now(), sourceHash = hash(image), meta = await sharp(image).metadata();
  if (sourceHash !== ledger.sourceHash) throw Error('Semantic page/ledger source mismatch');
  const observations = [...retained.filter(o => o.sourceHash === sourceHash && o.verified)];
  let passes = 0;
  if (!observations.length) {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => undefined });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: '', user_defined_dpi: '300' });
      for (const variant of ['native', 'grayscale']) {
        let pixels = sharp(image); if (variant === 'grayscale') pixels = pixels.grayscale();
        const { data } = await worker.recognize(await pixels.png().toBuffer(), {}, { text: true, blocks: true }); passes++;
        const id = `${ledger.documentId}:semantic-page:${variant}`, region = { left: 0, top: 0, width: meta.width!, height: meta.height! };
        const sequence = ledger.append({ field: 'semantic-page', documentId: ledger.documentId, sourceHash, cropHash: sourceHash, region, recognizer: 'tesseract.js-eng-lstm', variant, configuration: 'psm11-native-resolution', raw: data.text, normalized: [data.text.trim()], confidence: data.confidence, provenance: { valid: true, reason: 'Original normalized page pixels; no template or business data', reference: id }, stage: 'phase5e-semantic-page', timestamp: new Date().toISOString() });
        observations.push({ id, runKey: ledger.snapshot().entries[sequence].runKey, sourceHash, cropHash: sourceHash, region, recognizer: 'tesseract.js-eng-lstm', variant, raw: data.text, confidence: data.confidence, verified: true, words: (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))).map(w => ({ text: w.text, confidence: w.confidence, bounds: { left: w.bbox.x0, top: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 } })) });
      }
    } finally { await worker.terminate(); }
  }
  return { model: interpretDocument({ sourceHash, observations }), observations, ledger: ledger.snapshot(), passes, durationMs: performance.now() - started };
}
export async function analyzeUnseenDocument(original: Buffer, attemptId: string, documentId: string) {
  const start = performance.now(), normalized = await normalizeDocument(original), ledger = new EvidenceLedger(attemptId, documentId, hash(normalized.documentColor));
  return { normalization: normalized.evidence, ...await recognizeSemanticPage(normalized.documentColor, ledger), completeMs: performance.now() - start };
}
