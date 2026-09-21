/** Runs on the isolated model worker, never imported by a production payment route. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { normalizeDocument } from '../documentNormalization.ts';
import { recognizeSemanticPage } from '../semantics/index.ts';
import { EvidenceLedger } from '../recognition/evidenceLedger.ts';
import { fuseInvoiceObservations, type RecognizerObservation } from '../fusion/index.ts';
import { resolveOfflineDocument, type OfflineDocument, type OfflineSnapshot } from '../resolver/index.ts';
import { assertUnverifiedInput, SHADOW_VERSION } from './contract.ts';
import type { DocumentSemanticModel } from '../semantics/model.ts';
import type { Bounds } from '../types.ts';
import { decideMoney, normalizePaymentDate, type PaymentObservation } from '../recognition/paymentEvidence.ts';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export type InvoiceCrop = { rowId: string; bounds: Bounds; bytes: Buffer; sha256: string };
export type ModelBatch = { observations: RecognizerObservation[]; versions: Record<string, unknown> };
export type ShadowInput = { attemptId: string; captureSessionId: string; sourceImageHash: string; build: string; snapshot: OfflineSnapshot };

// Derive invoice cell bounds only from the detected semantic column and row.
// Unknown/clipped/overlapping cells remain review-required, with no historical template fallback.
export function invoiceCell(model: DocumentSemanticModel, row: Bounds, width: number, height: number): Bounds | null {
  const column = model.table.columns.find(c => c.type === 'invoice_number');
  if (!model.table.supported || !column) return null;
  const next = model.table.columns.filter(c => c.bounds.left > column.bounds.left).sort((a,b) => a.bounds.left-b.bounds.left)[0];
  const left = Math.max(0, Math.floor(column.bounds.left - column.bounds.height));
  const right = Math.min(width, Math.ceil(next ? next.bounds.left - column.bounds.height : row.left + row.width));
  const top = Math.max(0, Math.floor(row.top)), bottom = Math.min(height, Math.ceil(row.top + row.height));
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right-left, height: bottom-top };
}

export async function runShadowPipeline(original: Buffer, input: ShadowInput,
  recognize: (crops: InvoiceCrop[], documentId: string, sourceHash: string) => Promise<ModelBatch>) {
  assertUnverifiedInput(input);
  if (hash(original) !== input.sourceImageHash) throw Error('Canonical capture hash mismatch');
  const started = performance.now(), normalized = await normalizeDocument(original);
  const sourceHash = hash(normalized.documentColor), ledger = new EvidenceLedger(input.attemptId, input.attemptId, sourceHash);
  const semantics = await recognizeSemanticPage(normalized.documentColor, ledger), model = semantics.model;
  const size = await sharp(normalized.documentColor).metadata(), crops: InvoiceCrop[] = [];
  for (const row of model.table.rows) {
    const bounds = row.invoiceRegion ?? invoiceCell(model, row.bounds, size.width!, size.height!);
    if (!bounds) continue;
    const bytes = await sharp(normalized.documentColor).extract(bounds).png().toBuffer();
    crops.push({ rowId: row.id, bounds, bytes, sha256: hash(bytes) });
  }
  const recognitionStart = performance.now();
  const batch = crops.length ? await recognize(crops, input.attemptId, sourceHash) : { observations: [], versions: { status: 'not-run-no-supported-invoice-cells' } };
  const recognitionMs = performance.now() - recognitionStart;
  for (const o of batch.observations) {
    const crop = crops.find(c => c.rowId === o.rowId);
    if (!crop || o.cropReference.sha256 !== crop.sha256 || o.cropReference.sourceImageSha256 !== sourceHash || o.cropReference.documentId !== input.attemptId)
      throw Error('Model output does not belong to canonical row pixels');
  }
  const missingRows: string[] = [];
  const rows: OfflineDocument['rows'] = [];
  for (const row of model.table.rows) {
    const observations = batch.observations.filter(o => o.rowId === row.id);
    if (!['svtrv2','parseq','ppocrv5'].every(name => observations.some(o => o.recognizer === name))) { missingRows.push(row.id); continue; }
    // A single weak money observation cannot become authoritative merely because
    // a model found an invoice. Keep conflicts and low confidence in review.
    const amounts = model.rowFields.filter(f => f.rowId === row.id && f.type === 'row_amount' && f.cents != null);
    const moneyObservations: PaymentObservation[] = amounts.map(f => ({ id: `${f.observationId}:${row.id}:amount`, scope: 'row', rowId: row.id, field: 'amount', variant: semantics.observations.find(o => o.id === f.observationId)!.variant,
      raw: f.value, bounds: f.bounds, sourceHash, cropHash: sourceHash, durationMs: 0, confidence: f.confidence, money: [f.cents!], words: [] }));
    const money = decideMoney(moneyObservations);
    rows.push({ rowId: row.id, fusion: fuseInvoiceObservations(observations), geometry: { ...row.bounds, sourceHash, coordinateSpace: 'normalized-still-pixels' },
      amounts: money.cents === null ? [] : moneyObservations.filter(o => money.provenance.includes(o.id)).map(o => ({ cents: money.cents!, raw: o.raw, observationId: o.id, rowId: row.id })),
      units: model.rowFields.filter(f => f.rowId === row.id && f.type === 'unit' && f.confidence >= 85).map(f => ({ value: f.value, observationId: f.observationId, rowId: row.id })), accountCandidates: [] });
  }
  const header = (type: 'check_number' | 'check_date') => {
    const fields = model.metadataFields.filter(f => f.type === type && f.confidence >= 85);
    const values = [...new Set(fields.map(f => type === 'check_date' ? normalizePaymentDate(f.value.trim()) : /^\d+$/.test(f.value.trim()) ? f.value.trim() : null))]; return values.length === 1 ? values[0] : null;
  };
  const document: OfflineDocument = { id: input.attemptId, rows, rawPasses: [], header: { payor: model.identity.value, checkNumber: header('check_number'), checkDate: header('check_date'),
    total: model.total.cents == null ? null : { amount: model.total.cents/100, source: 'explicit-document-total', payable: true }, provenance: 'Same-capture vendor-neutral visual evidence; no verified answers' } };
  const resolved = resolveOfflineDocument(document, input.snapshot);
  const blockers = [...model.reviewReasons, ...missingRows.map(id => `Incomplete recognizer evidence for ${id}`), ...new Set(resolved.audit.flatMap(a => a.blockers))];
  if (!rows.length) blockers.push('No supported physical rows');
  if (resolved.status !== 'resolved') blockers.push(`Resolver: ${resolved.status}`);
  const automatic = blockers.length === 0 && resolved.status === 'resolved';
  return { version: SHADOW_VERSION, ocrEngine: 'v2-shadow' as const, paymentCanApply: false as const,
    captureSessionId: input.captureSessionId, sourceImageHash: input.sourceImageHash, normalizedImageHash: sourceHash,
    build: input.build, models: batch.versions, semanticVersion: model.version, layoutVersion: model.version,
    benchmarkVersion: 'trimax-ocr-real-v2', normalization: normalized.evidence, model, document,
    // Business snapshot is available to the resolver only; do not duplicate it into results.
    resolver: { status: automatic ? 'automatic' : 'review-required', automaticInvoiceIds: automatic ? resolved.automaticInvoiceIds : [], counts: resolved.counts, audit: resolved.audit },
    reviewBlockers: blockers, ledger: ledger.snapshot(),
    timings: { normalizationMs: normalized.evidence.metrics.completeMs, semanticsMs: semantics.durationMs, recognitionMs, resolverMs: resolved.durationMs, totalMs: performance.now()-started },
  };
}
