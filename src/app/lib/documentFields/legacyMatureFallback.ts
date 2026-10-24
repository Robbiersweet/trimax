import {createHash} from 'node:crypto';
import {moneyCents, moneyFixed} from '../money.ts';
import {normalizeVisualMoney} from './visualMoney.ts';
import {maturePaymentValue} from './maturePaymentFields.ts';
import type {runShadowPipeline} from '../ocrV2/shadow/pipeline.ts';
import type {OcrPass} from '../remittanceAttempt.ts';
import type {StructuredRemittanceRowEvidence, RemittanceTotalEvidence} from '../remittanceMatching.ts';

type OpticalResult = Awaited<ReturnType<typeof runShadowPipeline>>;
type Header = {checkNumber: string | null; checkDate: string | null; payor: string | null; documentTotal: RemittanceTotalEvidence | null};
const models = ['svtrv2', 'parseq', 'ppocrv5'];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sameProperty = (a: string, b: string) => {
  const tokens = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
  const x = tokens(a), y = tokens(b);
  if (!x[0] || !y[0] || x.length !== y.length || x.slice(0,-1).some((word,i) => word !== y[i])) return false;
  const last = x[x.length-1], other = y[y.length-1];
  if (last === other) return true;
  const [shorter,longer] = last.length < other.length ? [last,other] : [other,last];
  return shorter.length >= 6 && longer.length - shorter.length <= 2 && longer.startsWith(shorter);
};
export type LegacyMatureDecision = {
  accepted: boolean; reason: string; metadata?: Partial<Pick<Header,'checkNumber'|'checkDate'>>; header?: Header; rows?: StructuredRemittanceRowEvidence[];
  rawPasses?: OcrPass[]; text?: string; proof: unknown;
};

/** Project independently observed fields only. No invoice records, balances,
 * expected answers, residual amounts, or resolver success enter this decision. */
function assessCompleteLegacyMatureFallback(value: unknown, image: Buffer, attemptId: string, previous: Header): LegacyMatureDecision {
  const result = value as OpticalResult;
  const reject = (reason: string): LegacyMatureDecision => ({accepted: false, reason, proof: value});
  if (!result || result.sourceImageHash !== hash(image) || result.document?.id !== attemptId ||
    !/^[a-f0-9]{64}$/.test(result.normalizedImageHash ?? '') || result.paymentCanApply !== false) throw Error('Mature fallback source binding mismatch');
  const normalizedHash = result.normalizedImageHash, header = result.document.header;
  const dimensions = result.normalization.normalization.documentDimensions;
  if (result.normalization.sourceImage.sha256 !== result.sourceImageHash || result.model.sourceHash !== normalizedHash ||
    !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) return reject('Invalid normalized optical coordinate system');
  if (result.resolver.status !== 'review-required' || result.resolver.automaticInvoiceIds.length ||
    result.resolver.candidateAudit.some(row => row.provisionalInvoiceId !== null || row.alternatives.length)) return reject('Fallback must contain optical evidence without financial record context');
  if (!result.model?.table.supported || !result.document.rows.length || result.document.rows.length > 20 ||
    result.document.rows.length !== result.model.table.rows.length || result.physicalRows.length !== result.document.rows.length) return reject('Incomplete independently measured physical table');
  const rowIds = result.document.rows.map(row => row.rowId), modelIds = result.model.table.rows.map(row => row.id), physicalIds = result.physicalRows.map(row => row.id);
  if ([rowIds,modelIds,physicalIds].some(ids => new Set(ids).size !== ids.length) ||
    !rowIds.every(id => modelIds.includes(id) && physicalIds.includes(id))) return reject('Physical table row membership is inconsistent');
  if (!header.checkNumber || !/^\d{1,12}$/.test(header.checkNumber) || !header.checkDate || !/^\d{4}-\d{2}-\d{2}$/.test(header.checkDate) ||
    !header.total?.payable || header.total.source !== 'explicit-document-total' || result.monetary.authority.cents === null ||
    moneyCents(header.total.amount) !== result.monetary.authority.cents) return reject('Incomplete independent payment header or total authority');
  const calendar = new Date(header.checkDate + 'T00:00:00Z');
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10) !== header.checkDate) return reject('Invalid independently observed check date');
  if (Object.values(result.localizedMetadata.conflicts).some(Boolean)) return reject('Conflicting independent payment metadata');
  const identity = result.organizationIdentity;
  if (identity.authority !== 'authoritative' || !identity.value || identity.competingCandidates.length || header.payor !== identity.value) return reject('Independent property identity remains uncertain');
  const payor = identity.candidates.find(c => c.stem === identity.value)?.observedText;
  if (!payor) return reject('Missing literal observed property text');
  if ((previous.checkNumber && previous.checkNumber !== header.checkNumber) || (previous.checkDate && previous.checkDate !== header.checkDate) ||
    (previous.payor && !sameProperty(previous.payor, payor))) return reject('Existing accepted header conflicts with independent field evidence');
  const fields = result.matureMoney;
  if (!fields) return reject('Complete existing monetary model set is unavailable');
  const total = fields.find(f => f.field === 'total');
  const complete = (field: NonNullable<typeof total>) => field.cents !== null && Number.isSafeInteger(field.cents) && field.cents > 0 &&
    field.observations.every(o => models.includes(o.recognizer) && o.field === field.field && o.rowId === field.rowId &&
      o.documentId === attemptId && o.sourceHash === normalizedHash && o.cropHash === field.cropHash) &&
    models.every(m => field.observations.some(o => o.recognizer === m && o.documentId === attemptId && o.sourceHash === normalizedHash && o.cropHash === field.cropHash)) &&
    !models.some(m => new Set(field.observations.filter(o => o.recognizer === m).map(o => normalizeVisualMoney(o.raw))).size > 1) &&
    field.provenance.every(id => field.observations.some(o => o.id === id && normalizeVisualMoney(o.raw) === field.cents)) &&
    new Set(field.observations.filter(o => field.provenance.includes(o.id) && normalizeVisualMoney(o.raw) === field.cents).map(o => o.recognizer)).size >= 2;
  if (!total || total.cents !== result.monetary.authority.cents || !complete(total)) return reject('Footer total lacks complete source-bound model evidence');
  // A correlated page/Tesseract total is not another independent model family.
  // Superseding it requires BOTH an exact caption-owned header and a separate
  // footer field, each confirmed by the existing complete mature model set.
  if (previous.documentTotal?.payable && moneyCents(previous.documentTotal.amount) !== total.cents) {
    const captionProof = result.maturePaymentFields.some(f => f.field === 'documentTotal' && f.value === String(total.cents) && f.complete &&
      f.sourceHash === normalizedHash && new Set(f.observations.filter(o => f.exactLabelProvenance.includes(o.id)).map(o => o.recognizer)).size >= 2);
    if (!captionProof) return reject('Conflicting legacy total lacks independent header and footer corroboration');
  }
  let subtotal = 0;
  const ids = new Set<string>();
  const rows: StructuredRemittanceRowEvidence[] = [];
  for (const row of result.document.rows) {
    const token = row.fusion.topCandidate, geometry = row.geometry;
    const money = fields.find(f => f.rowId === row.rowId && f.field === 'row_amount');
    if (ids.has(row.rowId) || !row.fusion.confidence.confidentlySelected || !token || !/^(?:INV-\d{4,}|\d+)$/.test(token) ||
      row.fusion.sharedVisualAmbiguity || row.fusion.rowId !== row.rowId || geometry.sourceHash !== normalizedHash || geometry.coordinateSpace !== 'normalized-still-pixels' ||
      !Number.isFinite(geometry.top) || !Number.isFinite(geometry.height) || geometry.height <= 0 || !money || money.cents === null || !complete(money) ||
      !models.every(m => row.fusion.observations.some(o => o.recognizer === m && o.rowId === row.rowId && o.cropReference.documentId === attemptId && o.cropReference.sourceImageSha256 === normalizedHash)) ||
      money.observations.some(o => o.rowId !== row.rowId || o.documentId !== attemptId || o.sourceHash !== normalizedHash || o.cropHash !== money.cropHash)) return reject('Ambiguous or incomplete source-owned invoice row');
    const physical = result.model.table.rows.find(r => r.id === row.rowId);
    if (!physical || !physical.invoiceRegion || geometry.top < 0 || geometry.top + geometry.height > dimensions.height ||
      money.bounds.left < 0 || money.bounds.top < 0 || money.bounds.width <= 0 || money.bounds.height <= 0 ||
      money.bounds.left + money.bounds.width > dimensions.width || money.bounds.top + money.bounds.height > dimensions.height ||
      money.bounds.top + money.bounds.height / 2 < geometry.top ||
      money.bounds.top + money.bounds.height / 2 > geometry.top + geometry.height) return reject('Monetary field does not belong to its measured row');
    const propertyObservations = identity.observations.filter(o => o.sourceRegion === row.rowId && models.includes(o.recognizer));
    if (propertyObservations.some(o => o.documentId !== attemptId || o.sourceImageHash !== normalizedHash ||
      o.geometry.top + o.geometry.height / 2 < geometry.top || o.geometry.top + o.geometry.height / 2 > geometry.top + geometry.height)) return reject('Property field does not belong to its measured row');
    const rowProperties = [...new Set(propertyObservations.map(o => o.normalizedText))].filter(text =>
      new Set(propertyObservations.filter(o => sameProperty(o.normalizedText,text)).map(o => o.recognizer)).size >= 2);
    if (rowProperties.some(text => !sameProperty(text,payor))) return reject('An independently observed physical row belongs to a different property');
    const rowProperty = rowProperties[0] ?? '';
    ids.add(row.rowId); subtotal += money.cents;
    const amount = money.cents / 100;
    const projected = {
      rowId: row.rowId, text: [rowProperty,token,moneyFixed(amount)].filter(Boolean).join(' '),
      source: {region: 'mature-owned-row', variant: 'existing-model-consensus', pageMode: 'bounded-field'},
      y: geometry.top + geometry.height / 2, height: geometry.height,
      normalizedInvoiceCandidates: [token], rawInvoiceLikeTokens: row.fusion.observations.map(o => o.rawText),
      unitLikeTokens: row.units.map(u => u.value), dateTokens: [],
      amountCandidates: [{raw: money.observations.find(o => money.provenance.includes(o.id))?.raw ?? moneyFixed(amount), value: amount, selected: true}],
      opticalProvenance: {canonicalHash: result.sourceImageHash, normalizedHash, coordinateSpace: 'normalized-still-pixels',
        rowBounds: geometry, invoiceBounds: physical.invoiceRegion, moneyBounds: money.bounds, invoice: row.fusion, money, propertyObservations},
    };
    rows.push(projected);
  }
  if (!Number.isSafeInteger(subtotal) || subtotal !== total.cents) return reject('Independently observed row amounts do not exactly reconcile with the document total');
  const normalizedHeader: Header = {checkNumber: header.checkNumber, checkDate: header.checkDate, payor,
    documentTotal: {...header.total, normalizationReason: 'Source-owned existing mature model fields; independent header/footer and exact observed-row reconciliation'}};
  const rawPasses: OcrPass[] = result.document.rows.flatMap(row => row.fusion.observations.map(o => ({text: o.rawText, region: 'mature-owned-invoice:' + row.rowId,
    variant: o.recognizer, pageMode: 'bounded-field', confidence: 0, words: []})));
  return {accepted: true, reason: 'Complete independent source-owned fields; no financial context used', header: normalizedHeader, rows, rawPasses,
    text: rows.map(r => r.text).join('\n'), proof: {opticalResult: result,
      fallbackPolicy: 'Optical projection only. Existing payment resolver, eligibility and safeguards still run; no probability fabricated.', supersededSingleEngineHeader: previous}};
}

/** Header fields are independently owned observations, not authorization to
 * replace invoice rows. An uncertain invoice token must retain its ambiguity. */
export function assessLegacyMatureMetadata(value: unknown, image: Buffer, attemptId: string, previous: Header): Partial<Pick<Header,'checkNumber'|'checkDate'>> {
  const r = value as OpticalResult, out: Partial<Pick<Header,'checkNumber'|'checkDate'>> = {};
  if (!r || r.sourceImageHash !== hash(image) || r.document?.id !== attemptId || r.paymentCanApply !== false ||
    r.normalization?.sourceImage.sha256 !== r.sourceImageHash || r.model?.sourceHash !== r.normalizedImageHash ||
    !/^[a-f0-9]{64}$/.test(r.normalizedImageHash ?? '') || r.resolver?.status !== 'review-required' ||
    r.resolver.automaticInvoiceIds.length || r.resolver.candidateAudit.some(row => row.provisionalInvoiceId !== null || row.alternatives.length)) return out;
  const views = ((r.metadataViews ?? []) as Array<{normalization: OpticalResult['normalization']; metadata: OpticalResult['localizedMetadata']}>).filter(v => v.normalization.sourceImage.sha256 === r.sourceImageHash);
  const owned = new Map(views.map(v => [v.metadata.sourceHash,v.normalization.normalization.documentDimensions]));
  owned.set(r.normalizedImageHash,r.normalization.normalization.documentDimensions);
  for (const field of ['checkNumber','checkDate'] as const) {
    if (r.localizedMetadata.conflicts[field] || views.some(v => v.metadata.conflicts[field])) continue;
    const fields = r.maturePaymentFields.filter(f => f.field === field);
    const values = new Set<string>(); let invalid = false;
    for (const f of fields) {
      const dimensions = owned.get(f.sourceHash), b = f.bounds;
      if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0 || !Object.values(b).every(Number.isFinite) || b.left < 0 || b.top < 0 || b.width <= 0 || b.height <= 0 ||
        b.left+b.width > dimensions.width || b.top+b.height > dimensions.height || !/^[a-f0-9]{64}$/.test(f.cropHash) ||
        f.observations.some(o => !models.includes(o.recognizer) || o.documentId !== attemptId || o.fieldId !== f.fieldId || o.sourceHash !== f.sourceHash || o.cropHash !== f.cropHash)) {invalid=true;break;}
      const parsed = f.observations.map(o => ({...o,parsed:maturePaymentValue(o.raw,field)}));
      // All complete rival values survive, even from an otherwise unsupported
      // view. A malformed caption cannot supply exact-caption provenance.
      parsed.forEach(o => {if(o.parsed !== null) values.add(o.parsed);});
      const exactCaption = (raw:string) => field === 'checkDate'
        ? /^(?:(?:CHECK|PAYMENT)\s+)?DATE\s*[#:.]?\s*\d/i.test(raw.trim())
        : /^(?:CK|CHK|CHECK)(?:\s+(?:NO|NUMBER))?\s*[#:.]*\s*\d/i.test(raw.trim());
      if (models.some(m => new Set(parsed.filter(o => o.recognizer===m).map(o => o.parsed)).size>1)) {invalid=true;break;}
      if (f.value !== null && (!f.complete || !models.every(m => parsed.some(o => o.recognizer===m)) ||
        f.provenance.some(id => !parsed.some(o => o.id===id && o.parsed===f.value)) ||
        new Set(parsed.filter(o => f.provenance.includes(o.id) && o.parsed===f.value).map(o => o.recognizer)).size<2 ||
        new Set(parsed.filter(o => f.exactLabelProvenance.includes(o.id) && o.parsed===f.value && exactCaption(o.raw)).map(o => o.recognizer)).size<2)) {invalid=true;break;}
    }
    const supported = fields.filter(f => f.complete && f.value !== null);
    const strong = views.flatMap(v => v.metadata.observations).filter(o => o.field===field && o.confidence>=70 && o.value).map(o => o.value!);
    strong.forEach(v => values.add(v));
    if (previous[field]) values.add(previous[field]!);
    if (!invalid && supported.length && values.size===1 && r.document.header[field]===supported[0].value && r.localizedMetadata[field]===supported[0].value) out[field]=supported[0].value;
  }
  return out;
}

export function assessLegacyMatureFallback(value: unknown, image: Buffer, attemptId: string, previous: Header): LegacyMatureDecision {
  const decision = assessCompleteLegacyMatureFallback(value,image,attemptId,previous);
  return {...decision,metadata:assessLegacyMatureMetadata(value,image,attemptId,previous)};
}
