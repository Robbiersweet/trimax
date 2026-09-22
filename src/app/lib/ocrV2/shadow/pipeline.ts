/** Runs on the isolated model worker, never imported by a production payment route. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { normalizeDocument } from '../documentNormalization.ts';
import { recognizeSemanticPage } from '../semantics/index.ts';
import { EvidenceLedger } from '../recognition/evidenceLedger.ts';
import { fuseInvoiceObservations, type RecognizerObservation } from '../fusion/index.ts';
import type { OfflineDocument, OfflineSnapshot } from '../resolver/index.ts';
import { resolveDocumentWithResidual, type ResidualDocument } from '../resolver/residual.ts';
import { assertUnverifiedInput, SHADOW_VERSION } from './contract.ts';
import type { DocumentSemanticModel } from '../semantics/model.ts';
import type { Bounds } from '../types.ts';
import { normalizePaymentDate } from '../recognition/paymentEvidence.ts';
import { recognizeSemanticMoney } from '../recognition/semanticMoney.ts';
import { fuseMoneyObservations, normalizeVisualMoney, type MatureMoneyObservation } from '../recognition/matureMoney.ts';
import { fuseOrganizationIdentity, type OrganizationObservation } from '../recognition/organizationIdentity.ts';
import { deriveResidualAmount } from '../recognition/residualAmount.ts';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export type InvoiceCrop = { rowId: string; bounds: Bounds; bytes: Buffer; sha256: string };
export type MoneyCrop = InvoiceCrop & { field: 'row_amount' | 'total' };
export type OrganizationCrop = InvoiceCrop & { regionType: OrganizationObservation['regionType'] };
export type ModelBatch = { organizationObservations?: OrganizationObservation[]; observations: RecognizerObservation[]; moneyObservations?: MatureMoneyObservation[]; modelTimings?: Record<string, unknown>; versions: Record<string, unknown> };
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
  recognize: (crops: InvoiceCrop[], documentId: string, sourceHash: string, moneyCrops: MoneyCrop[], organizationCrops: OrganizationCrop[]) => Promise<ModelBatch>) {
  assertUnverifiedInput(input);
  if (hash(original) !== input.sourceImageHash) throw Error('Canonical capture hash mismatch');
  const started = performance.now(), normalized = await normalizeDocument(original);
  const sourceHash = hash(normalized.documentColor), ledger = new EvidenceLedger(input.attemptId, input.attemptId, sourceHash);
  const semantics = await recognizeSemanticPage(normalized.documentColor, ledger), model = semantics.model;
  const monetary = await recognizeSemanticMoney(normalized.documentColor, model, semantics.observations, ledger);
  const size = await sharp(normalized.documentColor).metadata(), crops: InvoiceCrop[] = [];
  for (const row of model.table.rows) {
    const bounds = row.invoiceRegion ?? invoiceCell(model, row.bounds, size.width!, size.height!);
    if (!bounds) continue;
    const bytes = await sharp(normalized.documentColor).extract(bounds).png().toBuffer();
    crops.push({ rowId: row.id, bounds, bytes, sha256: hash(bytes) });
  }
  const moneyCrops: MoneyCrop[] = [];
  const moneyRegions = [...monetary.regions.filter(r => r.bounds).map(r => ({ rowId: r.rowId, field: 'row_amount' as const, bounds: r.bounds! })),
    ...(monetary.totalBounds ? [{ rowId: 'document-total', field: 'total' as const, bounds: monetary.totalBounds }] : [])];
  for (const region of moneyRegions) {
    const bytes = await sharp(normalized.documentColor).extract(region.bounds).flatten({ background: 'white' }).png().toBuffer();
    moneyCrops.push({ ...region, bytes, sha256: hash(bytes) });
  }
  const organizationCrops: OrganizationCrop[] = [];
  const identityColumn = model.table.columns.find(c => ['property_name','customer_name','payor_name'].includes(c.type) && c.semanticConfidence === 'label-supported');
  if (identityColumn) {
    const next = model.table.columns.filter(c => c.bounds.left > identityColumn.bounds.left).sort((a,b) => a.bounds.left-b.bounds.left)[0];
    if (next) for (const row of model.table.rows) {
      const left = Math.max(0, Math.min(row.bounds.left, identityColumn.bounds.left)-12);
      const bounds = row.physical?.columnRegions[identityColumn.type] ?? { left, top: row.bounds.top, width: next.bounds.left-left-8, height: row.bounds.height };
      if (bounds.width <= 0 || bounds.top < 0 || bounds.top+bounds.height > size.height!) continue;
      const bytes = await sharp(normalized.documentColor).extract(bounds).png().toBuffer();
      organizationCrops.push({ rowId: row.id, bounds, bytes, sha256: hash(bytes), regionType: identityColumn.type as OrganizationObservation['regionType'] });
    }
  }
  const recognitionStart = performance.now();
  const batch: ModelBatch = crops.length ? await recognize(crops, input.attemptId, sourceHash, moneyCrops, organizationCrops) : { observations: [], versions: { status: 'not-run-no-supported-invoice-cells' } };
  const recognitionMs = performance.now() - recognitionStart;
  for (const o of batch.observations) {
    const crop = crops.find(c => c.rowId === o.rowId);
    if (!crop || o.cropReference.sha256 !== crop.sha256 || o.cropReference.sourceImageSha256 !== sourceHash || o.cropReference.documentId !== input.attemptId)
      throw Error('Model output does not belong to canonical row pixels');
  }
  const matureMoney = batch.moneyObservations ? moneyCrops.map(crop => {
    const expected = { rowId: crop.rowId, field: crop.field, documentId: input.attemptId, sourceHash, cropHash: crop.sha256 };
    const own = batch.moneyObservations!.filter(o => o.rowId === crop.rowId && o.field === crop.field);
    const decision = fuseMoneyObservations(own, expected);
    for (const o of own) ledger.append({ field: o.field, documentId: input.attemptId, rowId: o.field === 'row_amount' ? o.rowId : undefined,
      sourceHash, cropHash: crop.sha256, region: crop.bounds, recognizer: o.recognizer, variant: 'native',
      configuration: `mature-money-consensus-1:${hash(Buffer.from(JSON.stringify(batch.versions)))}`, raw: o.raw,
      normalized: normalizeVisualMoney(o.raw) === null ? [] : [String(normalizeVisualMoney(o.raw))], confidence: o.confidence ?? 0, durationMs: o.durationMs,
      provenance: { valid: true, reason: 'Uncalibrated sequence recognizer on exact same physical money crop; no business hints', reference: o.id }, stage: 'phase6-mature-money', timestamp: new Date().toISOString() });
    return { rowId: crop.rowId, field: crop.field, bounds: crop.bounds, cropHash: crop.sha256, ...decision };
  }) : null;
  if (batch.moneyObservations?.some(o => !moneyCrops.some(c => c.rowId === o.rowId && c.field === o.field))) throw Error('Unexpected monetary field output');
  const identityStart = performance.now();
  const identityObservations = batch.organizationObservations ?? [];
  for (const o of identityObservations) {
    const crop = organizationCrops.find(c => c.rowId === o.sourceRegion);
    if (!crop || o.documentId !== input.attemptId || o.sourceImageHash !== sourceHash || o.cropHash !== crop.sha256 || JSON.stringify(o.geometry) !== JSON.stringify(crop.bounds) || o.regionType !== crop.regionType) throw Error('Organization output does not belong to labeled canonical pixels');
  }
  const organizationIdentity = fuseOrganizationIdentity(identityObservations, { documentId: input.attemptId, sourceImageHash: sourceHash });
  for (const o of organizationIdentity.observations) ledger.append({ field: 'organization-identity', documentId: input.attemptId, rowId: o.sourceRegion,
    sourceHash, cropHash: o.cropHash, region: o.geometry, recognizer: o.recognizer, variant: 'native', configuration: organizationIdentity.version,
    organizationIdentity: { consensusStem: organizationIdentity.consensusStem, descriptorEvidence: organizationIdentity.descriptorEvidence, authorityReason: organizationIdentity.reason, competingCandidates: organizationIdentity.competingCandidates, confidenceCalibrated: false },
    raw: o.rawText, normalized: [o.normalizedText], confidence: o.confidence ?? 0, durationMs: o.durationMs,
    provenance: { valid: true, reason: 'Visual labeled identity crop; uncalibrated scores are not authority probabilities', reference: o.id }, stage: 'phase6-organization-identity', timestamp: new Date().toISOString() });
  const identityValue = organizationIdentity.authority === 'authoritative' ? organizationIdentity.value : model.identity.value;
  const identityConflict = identityValue && model.identity.value && identityValue !== model.identity.value;
  const acceptedIdentity = identityConflict ? null : identityValue;
  const identityMs = performance.now()-identityStart;
  const missingRows: string[] = [];
  const rows: OfflineDocument['rows'] = [];
  for (const row of model.table.rows) {
    const observations = batch.observations.filter(o => o.rowId === row.id);
    if (!['svtrv2','parseq','ppocrv5'].every(name => observations.some(o => o.recognizer === name))) { missingRows.push(row.id); continue; }
    const money = matureMoney ? matureMoney.find(r => r.rowId === row.id && r.field === 'row_amount')! : monetary.rows.find(r => r.rowId === row.id)!;
    if (!money) { missingRows.push(row.id); continue; }
    const moneyObservations = money.observations;
    rows.push({ rowId: row.id, fusion: fuseInvoiceObservations(observations), geometry: { ...row.bounds, sourceHash, coordinateSpace: 'normalized-still-pixels' },
      amounts: money.cents === null ? [] : moneyObservations.filter(o => money.provenance.includes(o.id)).map(o => ({ cents: money.cents!, raw: o.raw, observationId: o.id, rowId: row.id })),
      units: model.rowFields.filter(f => f.rowId === row.id && f.type === 'unit' && f.confidence >= 85).map(f => ({ value: f.value, observationId: f.observationId, rowId: row.id })), accountCandidates: [] });
  }
  const header = (type: 'check_number' | 'check_date') => {
    const fields = model.metadataFields.filter(f => f.type === type && f.confidence >= 85);
    const values = [...new Set(fields.map(f => type === 'check_date' ? normalizePaymentDate(f.value.trim()) : /^\d+$/.test(f.value.trim()) ? f.value.trim() : null))]; return values.length === 1 ? values[0] : null;
  };
  const document: ResidualDocument = { id: input.attemptId, rows, rawPasses: [], header: { payor: acceptedIdentity, checkNumber: header('check_number'), checkDate: header('check_date'),
    total: monetary.authority.cents == null ? null : { amount: monetary.authority.cents/100, source: 'explicit-document-total', payable: true }, provenance: 'Same-capture vendor-neutral visual evidence; no verified answers' } };
  const anchors=model.table.columns.find(c=>c.type==='invoice_number')?.geometryEvidence ?? [];
  const residual=deriveResidualAmount({documentId:input.attemptId,sourceHash,
    authoritativeTotal:{cents:monetary.authority.cents,provenance:[...model.total.provenance,...monetary.authority.supportedFooter.flatMap(v=>v.observations),...monetary.authority.labels.map(l=>l.observationId)]},
    rows:model.table.rows.map(row=>{
      const money=matureMoney?.find(r=>r.rowId===row.id&&r.field==='row_amount') ?? monetary.rows.find(r=>r.rowId===row.id);
      return {rowId:row.id,bounds:row.bounds,ownership:monetary.regions.find(r=>r.rowId===row.id)?.ownership??null,
        cropHash:moneyCrops.find(c=>c.rowId===row.id&&c.field==='row_amount')?.sha256??'',cents:money?.cents??null,authoritative:money?.cents!=null,provenance:money?.provenance??[]};
    }),
    passes:semantics.observations.filter(o=>o.verified&&o.sourceHash===sourceHash).map(o=>({observationId:o.id,anchors:anchors.filter(a=>a.observationId===o.id&&a.kind==='repeated-invoice-token').map(a=>a.bounds)}))});
  if(residual.evidence)document.residualEvidence=residual;
  const resolved = resolveDocumentWithResidual(document, input.snapshot);
  const established=rows.map(row=>residual.evidence?.rowId===row.rowId?residual.evidence.derivedAmount:[...new Set(row.amounts.map(a=>a.cents))].length===1?row.amounts[0].cents:null);
  const complete=rows.length===model.table.rows.length&&rows.length>0&&established.every(c=>c!==null);
  const arithmeticSubtotal=complete?established.reduce<number>((sum,c)=>sum+c!,0):null;
  const arithmeticReconciliation={subtotal:arithmeticSubtotal,total:monetary.authority.cents,
    difference:arithmeticSubtotal===null||monetary.authority.cents===null?null:arithmeticSubtotal-monetary.authority.cents,
    evidenceClass:'observed-plus-derived-arithmetic',paymentAuthority:false};
  const blockers = [...model.reviewReasons.filter(reason => reason !== model.total.reason && !(acceptedIdentity && reason === model.identity.reason)), ...(monetary.authority.cents === null ? [monetary.authority.reason] : []),
    ...(matureMoney ? matureMoney.filter(r => r.field === 'row_amount' && r.cents === null && residual.evidence?.rowId!==r.rowId).map(r => `Unresolved monetary evidence for ${r.rowId}: ${r.reason}`)
      : monetary.rows.filter(r => r.cents === null && residual.evidence?.rowId!==r.rowId).map(r => `Unresolved monetary evidence for ${r.rowId}: ${r.rejectionReason}`)),
    ...missingRows.map(id => `Incomplete recognizer evidence for ${id}`), ...new Set(resolved.audit.flatMap(a => a.blockers))];
  if (!rows.length) blockers.push('No supported physical rows');
  if (resolved.status !== 'resolved') blockers.push(`Resolver: ${resolved.status}`);
  const automatic = blockers.length === 0 && resolved.status === 'resolved';
  // The durable comparison summary reads model.total, while the resolver reads
  // document.header.total. Project the same authority into both, retaining the
  // earlier page-only observation for inspection rather than losing it.
  const total = { ...model.total, cents: monetary.authority.cents, reason: monetary.authority.reason,
    candidates: [...new Set([...model.total.candidates, ...monetary.authority.allFooterCandidates.map(c => c.cents)])],
    provenance: [...new Set([...model.total.provenance, ...monetary.authority.labels.map(l => l.observationId), ...monetary.authority.supportedFooter.flatMap(c => c.observations)])],
    observedSubtotal: monetary.authority.subtotal };
  const semanticReasons = [...model.reviewReasons.filter(reason => reason !== model.total.reason && !(acceptedIdentity && reason === model.identity.reason)), ...(total.cents === null ? [total.reason] : [])];
  const diagnosticModel = { ...model, identity: acceptedIdentity ? { ...model.identity, value: acceptedIdentity, reason: organizationIdentity.reason, provenance: organizationIdentity.candidates.find(c => c.stem === acceptedIdentity)?.provenance ?? model.identity.provenance } : model.identity, total, reviewReasons: semanticReasons, reviewRequired: semanticReasons.length > 0 };
  return { version: SHADOW_VERSION, ocrEngine: 'v2-shadow' as const, paymentCanApply: false as const,
    physicalRows: model.table.rows.map(row=>({id:row.id,geometry:row.physical??row.bounds,invoiceStatus:rows.find(r=>r.rowId===row.id)?.fusion.confidence??'UNKNOWN',amountStatus:(matureMoney?.find(r=>r.rowId===row.id&&r.field==='row_amount')??monetary.rows.find(r=>r.rowId===row.id))?.cents==null?'UNKNOWN':'observed',specializedInvoiceInvoked:crops.some(c=>c.rowId===row.id),specializedMoneyInvoked:moneyCrops.some(c=>c.rowId===row.id)})),
    captureSessionId: input.captureSessionId, sourceImageHash: input.sourceImageHash, normalizedImageHash: sourceHash,
    build: input.build, models: { ...batch.versions, organization: organizationIdentity.version, money: matureMoney ? 'mature-money-consensus-1' : monetary.version }, semanticVersion: model.version, layoutVersion: model.version,
    benchmarkVersion: 'trimax-ocr-real-v2', normalization: normalized.evidence, model: diagnosticModel, pageOnlyIdentity: model.identity, pageOnlyTotal: model.total, document,
    // Business snapshot is available to the resolver only; do not duplicate it into results.
    resolver: { status: automatic ? 'automatic' : 'review-required', automaticInvoiceIds: automatic ? resolved.automaticInvoiceIds : [], counts: resolved.counts, audit: resolved.audit,
      candidateAudit:resolved.rows.map(r=>({rowId:r.rowId,provisionalInvoiceId:r.provisionalInvoiceId,alternatives:r.alternatives})) },
    reviewBlockers: blockers, organizationIdentity, monetary, matureMoney, residual, arithmeticReconciliation, modelTimings: batch.modelTimings, ledger: ledger.snapshot(),
    timings: { identityFusionMs: identityMs, identityRecognitionMs: identityObservations.reduce((n,o)=>n+o.durationMs,0), normalizationMs: normalized.evidence.metrics.completeMs, semanticsMs: semantics.durationMs, moneyMs: monetary.durationMs,
      matureMoneyMs: batch.moneyObservations?.reduce((n,o) => n + o.durationMs, 0) ?? 0, recognitionMs, resolverMs: resolved.durationMs, totalMs: performance.now()-started },
  };
}
