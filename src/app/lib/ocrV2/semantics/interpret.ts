// Values are visual observations only. No customer records, fixture IDs or expected answers.
import type { Bounds } from '../types.ts';
import { mapSemanticTable } from './tableGeometry.ts';
import { owns, type RowComponent } from './physicalRows.ts';
import { headerMoney } from '../recognition/documentTotalAuthority.ts';
import { recognizeLabel, normalizeOrganization } from './labels.ts';
import type { DocumentSemanticModel, SemanticObservation, SemanticLabel, SemanticField, SemanticRow } from './model.ts';
const right = (b: Bounds) => b.left + b.width, bottom = (b: Bounds) => b.top + b.height;
const overlaps = (a: Bounds, b: Bounds) => Math.min(right(a), right(b)) > Math.max(a.left, b.left) && Math.min(bottom(a), bottom(b)) > Math.max(a.top, b.top);
const sameLine = (a: Bounds, b: Bounds) => Math.abs(bottom(a) - bottom(b)) < Math.max(a.height, b.height) * .6;
const union = (boxes: Bounds[]): Bounds => { const left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top)); return { left, top, width: Math.max(...boxes.map(right)) - left, height: Math.max(...boxes.map(bottom)) - top }; };
const identityTypes = new Set(['property_name', 'customer_name', 'payor_name']);
export function interpretDocument(input: {
  sourceHash: string; observations: SemanticObservation[]; rows?: SemanticRow[];
  physicalComponents?: RowComponent[];
  columns?: Array<{ type: SemanticField['type']; bounds: Bounds }>;
  preservedTotal?: { cents: number; provenance: string[] }; // Previously validated Phase 5C authority, not a numeric guess.
}): DocumentSemanticModel {
  const started = performance.now(), reuseStart = performance.now();
  const groups = new Map<string, SemanticObservation[]>();
  for (const o of input.observations.filter(o => o.verified && o.sourceHash === input.sourceHash)) groups.set(o.runKey, [...(groups.get(o.runKey) ?? []), o]);
  const observations = [...groups.values()].filter(group => new Set(group.map(o => o.raw.trim().replace(/\s+/g, ' '))).size === 1).map(group => ({ ...group[0], confidence: Math.min(...group.map(o => o.confidence)) }));
  const preservedTotal = input.preservedTotal?.provenance.length && input.preservedTotal.provenance.every(id => observations.some(o => o.id === id)) ? input.preservedTotal : undefined;
  const evidenceReuseMs = performance.now() - reuseStart, labelStart = performance.now(), labels: SemanticLabel[] = [];
  for (const o of observations) {
    const words = o.words;
    const consumed = new Set<number>();
    for (let i = 0; i < words.length; i++) {
      if (consumed.has(i)) continue;
      for (const count of [3, 2, 1]) {
        const ws = words.slice(i, i + count); if (ws.length !== count || ws.some((w, n) => n > 0 && (!sameLine(ws[0].bounds, w.bounds) || w.bounds.left - right(ws[n - 1].bounds) > w.bounds.height * 2))) continue;
        const joined = ws.map(w => w.text).join(' ').replace(/^['"(]+/, '');
        const raw = count === 1 ? joined.replace(/[:$].*$/, '') : joined;
        const recognized = recognizeLabel(raw); if (!recognized) continue;
        if (!/[:：]/.test(joined) && labels.some(l => l.observationId === o.id && sameLine(l.bounds, ws[0].bounds) && right(l.bounds) <= ws[0].bounds.left && ws[0].bounds.left - right(l.bounds) < l.bounds.height * 12 && /[:：]/.test(words[l.words[0]].text))) continue;
        const indexes = ws.map((_, n) => i + n);
        labels.push({ id: `${o.id}:label:${i}`, observationId: o.id, runKey: o.runKey, ...recognized, raw, bounds: union(ws.map(w => w.bounds)), confidence: Math.min(...ws.map(w => w.confidence)), words: indexes });
        indexes.forEach(index => consumed.add(index)); break;
      }
    }
  }
  const labelsMs = performance.now() - labelStart, structureStart = performance.now();
  const mapped = mapSemanticTable(observations, labels, input.physicalComponents);
  const heading = mapped.heading;
  const columns = mapped.columns.length ? mapped.columns : input.columns ?? [];
  const rows: SemanticRow[] = input.rows ? structuredClone(input.rows) : mapped.rows;
  const supported = rows.length > 0 && columns.some(c => c.type === 'invoice_number') && columns.some(c => c.type === 'row_amount');
  const first = rows.length ? Math.min(...rows.map(r => r.bounds.top)) : Infinity, last = rows.length ? Math.max(...rows.map(r => bottom(r.bounds))) : -Infinity;
  const outsideRows = (b: Bounds) => !rows.some(r => overlaps(b, r.bounds));
  const relations: DocumentSemanticModel['spatialRelationships'] = [], fields: SemanticField[] = [];
  for (const label of labels) {
    const o = observations.find(o => o.id === label.observationId)!;
    const inHeader = heading.some(h => h.id === label.id) || (label.bounds.top < first && columns.some(c => c.type === label.type && overlaps(c.bounds, label.bounds)));
    if (!inHeader) {
      let following = o.words.filter((w, i) => !label.words.includes(i) && sameLine(label.bounds, w.bounds) && w.bounds.left >= right(label.bounds) - 1 && w.bounds.left - right(label.bounds) < label.bounds.height * 12).sort((a, b) => a.bounds.left - b.bounds.left);
      if (!following.length) {
        const below = o.words.filter((w, i) => !label.words.includes(i) && w.bounds.top >= bottom(label.bounds) && w.bounds.top - bottom(label.bounds) < label.bounds.height * 2 && Math.abs(w.bounds.left - label.bounds.left) < label.bounds.height * 2).sort((a, b) => a.bounds.top - b.bounds.top)[0];
        if (below) following = o.words.filter(w => sameLine(w.bounds, below.bounds) && w.bounds.left >= label.bounds.left - label.bounds.height && w.bounds.left - label.bounds.left < label.bounds.height * 12).sort((a, b) => a.bounds.left - b.bounds.left);
      }
      const stop = following.findIndex(w => labels.some(l => l.observationId === o.id && l.id !== label.id && overlaps(w.bounds, l.bounds)));
      const valueWords = stop >= 0 ? following.slice(0, stop) : following;
      const inline = o.words[label.words[0]]?.text.match(/^[^:$]+[:$]\s*(.+)$/)?.[1];
      const raw = inline ?? valueWords.map(w => w.text).join(' ');
      if (raw) fields.push({ type: label.type, value: raw, normalized: identityTypes.has(label.type) ? normalizeOrganization(raw).key : raw, cents: headerMoney(raw) ?? undefined, bounds: inline ? label.bounds : union(valueWords.map(w => w.bounds)), observationId: o.id, runKey: o.runKey, confidence: inline ? label.confidence : Math.min(...valueWords.map(w => w.confidence)), labelIds: [label.id] });
    }
  }
  // Specialized retained identity crops remain evidence, but their field name
  // alone does not prove semantics: an aligned label is still mandatory.
  for (const o of observations.filter(o => ['property', 'customer', 'payor', 'account'].includes(o.field ?? ''))) {
    const label = labels.filter(l => (identityTypes.has(l.type) || l.type === 'account_number') && l.bounds.top < o.region.top && Math.abs(l.bounds.left - o.region.left) < Math.max(l.bounds.height, o.region.height) * 2).sort((a, b) => b.bounds.top - a.bounds.top)[0];
    if (label && o.raw.trim()) fields.push({ type: label.type, value: normalizeOrganization(o.raw).display, normalized: normalizeOrganization(o.raw).key, bounds: o.region, observationId: o.id, runKey: o.runKey, confidence: o.confidence, labelIds: [label.id], rowId: o.rowId });
  }
  // Generic table cells require no fixed order. Invoice text here is a semantic
  // observation, never a replacement for the frozen invoice recognition/fusion.
  for (const col of columns) for (const row of rows) for (const o of observations) {
    const next = columns.filter(c => c.bounds.left > col.bounds.left).sort((a, b) => a.bounds.left - b.bounds.left)[0];
    const ws = o.words.filter(w => (row.physical?owns(row.physical,w.bounds):overlaps(w.bounds,row.bounds)) && w.bounds.left >= col.bounds.left - col.bounds.height && (!next || right(w.bounds) < next.bounds.left));
    const label = labels.find(l => l.type === col.type && overlaps(l.bounds, col.bounds));
    if (ws.length && (label || ('semanticConfidence' in col && col.semanticConfidence === 'provisional-geometry' && col.type === 'row_amount'))) { const raw = ws.sort((a, b) => a.bounds.left - b.bounds.left).map(w => w.text).join(' '); fields.push({ type: col.type, value: raw, normalized: identityTypes.has(col.type) ? normalizeOrganization(raw).key : raw, cents: col.type === 'row_amount' ? headerMoney(raw) ?? undefined : undefined, bounds: union(ws.map(w => w.bounds)), observationId: o.id, runKey: o.runKey, confidence: Math.min(...ws.map(w => w.confidence)), labelIds: label ? [label.id] : [], rowId: row.id }); }
  }
  fields.forEach(f => f.labelIds.forEach(id => relations.push({ from: id, to: f.observationId, relation: f.rowId ? 'column-value' : 'adjacent-value' })));
  const structureMs = performance.now() - structureStart, identityStart = performance.now();
  function labelSupported(ids: string[]) {
    return ids.some(id => { const label = labels.find(l => l.id === id)!; return label.correction === 'formatting-only' ? label.confidence >= 60 : label.confidence >= 70 && new Set(labels.filter(l => l.normalized === label.normalized && overlaps(l.bounds, label.bounds) && l.confidence >= 70).map(l => l.runKey)).size >= 2; });
  }
  const identityFields = fields.filter(f => identityTypes.has(f.type)), identityCandidates = [...new Set(identityFields.map(f => f.normalized))];
  const supportedIdentity = identityCandidates.filter(value => {
    const own = identityFields.filter(f => f.normalized === value && f.confidence >= 80 && labelSupported(f.labelIds));
    return /^[\p{L}\d][\p{L}\d &'’()/-]+$/u.test(value) && (value.match(/\p{L}/gu)?.length ?? 0) >= 3 && new Set(own.map(f => f.runKey)).size >= 2;
  });
  const identityConflict = supportedIdentity.length === 1 && identityFields.some(f => f.normalized !== supportedIdentity[0] && f.confidence >= 90 && labelSupported(f.labelIds));
  const identityValue = supportedIdentity.length === 1 && !identityConflict ? identityFields.filter(f => f.normalized === supportedIdentity[0]).sort((a, b) => b.confidence - a.confidence)[0].value : null;
  const identity = { value: identityValue, candidates: identityCandidates, reason: identityValue ? 'Corroborated visual organization text with semantic label geometry' : identityConflict || supportedIdentity.length > 1 ? 'Conflicting identity evidence' : 'Insufficient labeled organization evidence', provenance: identityValue ? identityFields.filter(f => f.normalized === supportedIdentity[0]).map(f => f.observationId) : [] };
  const identityMs = performance.now() - identityStart, totalStart = performance.now();
  const totals = fields.filter(f => f.type === 'document_total' && f.cents !== undefined && outsideRows(f.bounds) && f.labelIds.every(id => outsideRows(labels.find(l => l.id === id)!.bounds)));
  const numeric = observations.flatMap(o => {
    const direct = o.field === 'total' ? headerMoney(o.raw) : null;
    return direct !== null ? [{ cents: direct, confidence: o.confidence, bounds: o.region, runKey: o.runKey, id: o.id, variant: o.variant }] : o.words.flatMap(w => { const cents = headerMoney(w.text); return cents !== null && outsideRows(w.bounds) ? [{ cents, confidence: w.confidence, bounds: w.bounds, runKey: o.runKey, id: o.id, variant: o.variant }] : []; });
  }).filter(v => outsideRows(v.bounds));
  function moneySupported(cents: number, bounds?: Bounds) { const own = numeric.filter(v => v.cents === cents && (!bounds || overlaps(v.bounds, bounds))); return own.some(v => v.confidence >= 85) || new Set(own.filter(v => v.confidence >= 40).map(v => v.variant)).size >= 2; }
  function totalLabelSupported(id: string) {
    const l = labels.find(l => l.id === id)!;
    if (l.correction !== 'formatting-only') return labelSupported([id]);
    const same = labels.filter(other => other.type === 'document_total' && other.correction === 'formatting-only' && overlaps(other.bounds, l.bounds));
    return l.confidence >= 85 || same.some(other => other.confidence >= 40) && new Set(same.filter(other => other.confidence >= 20).map(other => other.runKey)).size >= 2;
  }
  const approved = totals.filter(f => moneySupported(f.cents!, f.bounds) && f.labelIds.some(totalLabelSupported));
  const finalValues = numeric.filter(v => v.bounds.top >= last && rows.length > 0 && rows.every(r => r.amountRegion && Math.abs(right(r.amountRegion) - right(v.bounds)) <= Math.max(r.amountRegion.height, v.bounds.height) * 2) && v.bounds.top - last <= Math.max(...rows.map(r => r.bounds.height)) * 4);
  const detachedLabels = labels.filter(l => l.type === 'document_total' && bottom(l.bounds) <= first && l.correction === 'formatting-only' && l.confidence >= 40);
  const detachedSupported = detachedLabels.some(l => l.confidence >= 85) || new Set(detachedLabels.map(l => l.runKey)).size >= 2;
  const detached = detachedSupported && !approved.length && !preservedTotal ? [...new Set(finalValues.filter(v => moneySupported(v.cents, v.bounds)).map(v => v.cents))] : [];
  const values = [...new Set([...approved.map(f => f.cents!), ...detached, ...(preservedTotal ? [preservedTotal.cents] : [])])];
  const observedSubtotal = rows.length && rows.every(r => r.amountCents != null) ? rows.reduce((sum, r) => sum + r.amountCents!, 0) : null;
  const conflictingExplicit = totals.filter(f => f.confidence >= 40 && f.labelIds.some(id => labels.find(l => l.id === id)?.correction === 'formatting-only')).some(f => values.length === 1 && f.cents !== values[0]);
  const cents = supported && values.length === 1 && !conflictingExplicit && (observedSubtotal === null || observedSubtotal === values[0]) ? values[0] : null;
  const total = { cents, candidates: [...new Set(numeric.map(v => v.cents))], reason: cents !== null ? preservedTotal?.cents === cents ? 'Preserved validated total authority; semantic conflicts checked' : 'Supported document-level label/value relationship outside rows' : values.length > 1 || conflictingExplicit ? 'Conflicting document-total evidence' : 'Insufficient document-total authority or conflicting observed subtotal', provenance: [...approved.map(f => f.observationId), ...(preservedTotal?.provenance ?? []), ...detachedLabels.map(l => l.observationId)], observedSubtotal };
  for (const l of detachedLabels) for (const v of finalValues) relations.push({ from: l.id, to: v.id, relation: 'header-label-final-value' });
  const position = (b: Bounds) => bottom(b) <= first ? 'above-rows' : b.top >= last ? 'below-rows' : 'beside-or-in-table';
  const check = labels.find(l => l.type === 'check_number' && l.bounds.top < first), totalLabelPosition = labels.filter(l => l.type === 'document_total').map(l => position(l.bounds)), totalValuePosition = [...totals.map(t => position(t.bounds)), ...finalValues.map(v => position(v.bounds))];
  const separateCheck = check && labels.some(l => l.type === 'payee_name' && Math.abs(l.bounds.top - check.bounds.top) < (first - check.bounds.top)) && first - bottom(check.bounds) > Math.max(...rows.map(r => r.bounds.height)) * 8;
  const classId = !supported ? 'unknown_review' : separateCheck ? 'check_stub_tabular_v1' : totals.some(t => t.bounds.top >= last) ? 'tabular_footer_total_v1' : totals.some(t => bottom(t.bounds) <= first) ? 'tabular_header_total_pair_v1' : detachedLabels.length && finalValues.length ? 'tabular_header_total_footer_value_v1' : 'tabular_metadata_v1';
  const reviewReasons = [...(!supported ? ['Insufficient semantic table mapping; no columns or rows invented'] : []), ...(identityValue ? [] : [identity.reason]), ...(cents === null ? [total.reason] : [])];
  return { version: 'phase6-semantics-2', sourceHash: input.sourceHash, documentType: classId, table: { supported, headerPosition: heading.length ? union(heading.map(l => l.bounds)) : null, columns, rows, headerGeometry: mapped.headerGeometry, physicalGeometry: mapped.physicalGeometry }, headers: fields.filter(f => bottom(f.bounds) <= first), labels, metadataFields: fields.filter(f => !f.rowId), rowFields: fields.filter(f => f.rowId), totals, identityFields, spatialRelationships: relations, template: { id: classId, invoiceColumnOrder: columns.map(c => c.type), amountColumnPosition: columns.findIndex(c => c.type === 'row_amount'), totalLabelPosition: [...new Set(totalLabelPosition)].join(',') || 'unresolved', totalValuePosition: [...new Set(totalValuePosition)].join(',') || 'unresolved', identityFieldPosition: [...new Set(identityFields.map(f => f.rowId ? 'table-column' : position(f.bounds)))].join(',') || 'unresolved' }, identity, total, reviewRequired: !!reviewReasons.length, reviewReasons, timings: { labelsMs, structureMs, identityMs, totalMs: performance.now() - totalStart, evidenceReuseMs, completeMs: performance.now() - started } };
}
