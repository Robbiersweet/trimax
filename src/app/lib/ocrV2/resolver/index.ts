// Offline research only. No database client, payment writer, or production UI imports.
import { createRemittanceEvidence, resolveRemittanceAttempt, type OcrPass } from '../../remittanceAttempt.ts';
import { normalizeInvoiceNumber, type RemittanceInvoiceRecord, type RemittanceTotalEvidence } from '../../remittanceMatching.ts';
import type { DuplicateRemittanceActivity } from '../../duplicateRemittance.ts';
import type { InvoiceFusion } from '../fusion/index.ts';

export type OfflineRow = {
  rowId: string; fusion: InvoiceFusion;
  geometry: { top: number; height: number; left?: number; width?: number; coordinateSpace?: string; sourceHash: string };
  amounts: Array<{ cents: number; raw: string; observationId: string; rowId: string }>;
  units: Array<{ value: string; observationId: string; rowId: string }>;
  accountCandidates: Array<{ value: string; provenance: string }>;
};
export type OfflineDocument = {
  id: string; rows: OfflineRow[]; rawPasses: OcrPass[];
  header: { payor: string | null; checkNumber: string | null; checkDate: string | null;
    total: RemittanceTotalEvidence | null; provenance: string };
};
export type OfflineSnapshot = {
  label: string; provenance: string[]; invoices: RemittanceInvoiceRecord[];
  activities: DuplicateRemittanceActivity[]; receivedDate: string;
};

/** Enumerates observed alternatives; all business interpretation delegates to the existing resolver.
 * No unobserved invoice is introduced by amount, unit, remaining balance, or elimination.
 * Strict amount compatibility is reported separately from the existing exact-invoice-set override.
 */
export function resolveOfflineDocument(document: OfflineDocument, snapshot: OfflineSnapshot, limit = 10000) {
  const start = performance.now();
  if (new Set(document.rows.map(r => r.rowId)).size !== document.rows.length) throw Error('Duplicate physical row ID');
  if (new Set(snapshot.invoices.map(r => r.id)).size !== snapshot.invoices.length) throw Error('Duplicate snapshot record ID');
  const cents = (n: number) => Math.round(n * 100);
  const invoke = (rows: OfflineRow[], tokens: string[], invoices = snapshot.invoices) => resolveRemittanceAttempt(
    createRemittanceEvidence({ attemptId: document.id,
      capture: { source: 'offline-v2-still', image: { width: 0, height: 0, bytes: 0, mime: 'image/png' }, quality: {}, sources: [{ id: 'retained-still', status: 'success' }], selectionReason: 'Frozen optical evidence' },
      rawPasses: document.rawPasses,
      headerEvidence: { ...document.header, documentTotal: document.header.total,
        candidates: { evidence: document.header.total, totalCandidates: [], checkNumber: document.header.checkNumber ?? '', checkCandidates: [] } },
      physicalRows: rows.map((r, i) => ({ rowId: r.rowId, text: tokens[i],
        source: { region: r.rowId, variant: 'fused-observed-alternative', pageMode: 'row' },
        y: r.geometry.top + r.geometry.height / 2, height: r.geometry.height,
        rawInvoiceLikeTokens: [tokens[i]], normalizedInvoiceCandidates: [tokens[i]],
        unitLikeTokens: r.units.map(u => u.value), dateTokens: [],
        amountCandidates: r.amounts.map((a, index) => ({ raw: a.raw, value: a.cents / 100, selected: index === 0 })) })),
      assignments: [], diagnostics: [snapshot.label, document.header.provenance] }),
    invoices, snapshot.activities, { role: 'owner', receivedDate: snapshot.receivedDate, fingerprint: '' });

  const rows = document.rows.map(row => {
    if (row.fusion.rowId !== row.rowId || row.fusion.observations.some(o => o.rowId !== row.rowId || o.cropReference.documentId !== document.id || o.cropReference.sourceImageSha256 !== row.geometry.sourceHash)) throw Error('Invoice provenance mismatch');
    if (row.amounts.some(a => a.rowId !== row.rowId || !Number.isSafeInteger(a.cents) || a.cents <= 0) || row.units.some(u => u.rowId !== row.rowId)) throw Error('Cross-row or invalid field evidence');
    const alternatives = row.fusion.candidates.map(candidate => {
      if (candidate.rowId !== row.rowId || candidate.documentId !== document.id || !/^(?:INV-\d{4,}|\d+)$/.test(candidate.value)
        || !candidate.sourceObservations.length || candidate.sourceObservations.some(id => !row.fusion.observations.some(o => o.id === id && o.formatNormalizedText === candidate.value))) throw Error('Candidate lacks complete observed token provenance');
      const records = snapshot.invoices.filter(invoice => normalizeInvoiceNumber(invoice.displayId) === normalizeInvoiceNumber(candidate.value));
      return records.map(invoice => {
        const result = invoke([row], [candidate.value], [invoice]);
        const trace = result.resolverResult.matchTrace.find(t => t.invoiceId === invoice.id);
        const eligible = !!trace?.accepted && !!trace.eligible;
        const amountCompatible = !!trace && row.amounts.some(a => a.cents === cents(trace.amountDue));
        const unitCompatible = !row.units.length || !!trace?.unitEvidence;
        return { token: candidate.value, invoiceId: invoice.id, eligible, amountCompatible, unitCompatible, trace };
      });
    }).flat();
    const eligibleIds = [...new Set(alternatives.filter(a => a.eligible && a.unitCompatible).map(a => a.invoiceId))];
    return { rowId: row.rowId, evidence: row, alternatives, provisionalInvoiceId: eligibleIds.length === 1 ? eligibleIds[0] : null };
  });
  const counts = { beforeBusinessConstraints: document.rows.length ? rows.reduce((n,r) => n * r.alternatives.length, 1) : 0,
    afterEligibility: 0, afterStrictAmountUnit: 0, afterAmountUnit: 0, afterRecordIdDedupe: 0, afterExactReconciliation: 0 };
  const enumerationStart = performance.now();
  const valid = new Map<string, { invoiceIds: string[]; tokens: string[]; totalCents: number }>();
  const audit: Array<{ invoiceIds: string[]; tokens: string[]; blockers: string[]; exactSetAmountOverride: boolean }> = [];
  const overflow = !Number.isSafeInteger(counts.beforeBusinessConstraints) || counts.beforeBusinessConstraints > limit;
  type Alternative = typeof rows[number]['alternatives'][number];
  const visit = (choice: Alternative[]) => {
    if (choice.length < rows.length) { for (const item of rows[choice.length].alternatives) visit([...choice, item]); return; }
    if (!choice.length || !choice.every(c => c.eligible)) return;
    counts.afterEligibility++;
    const ids = choice.map(c => c.invoiceId), tokens = choice.map(c => c.token);
    // Keep the complete pool so existing duplicate-display-number and account
    // safeguards cannot disappear when evaluating an individual assignment.
    const attempt = invoke(document.rows, tokens);
    const matchedIds = attempt.resolverResult.resolvedMatches.map(i => i.id);
    // A branch cannot gain an unobserved token through the legacy fuzzy matcher.
    const sameAssignment = ids.length === matchedIds.length && ids.every(id => matchedIds.includes(id));
    const strict = choice.every(c => c.amountCompatible && c.unitCompatible);
    if (strict) counts.afterStrictAmountUnit++;
    const exact = document.header.total?.source === 'explicit-document-total' && document.header.total.payable
      && cents(attempt.resolverResult.matchedTotal) === cents(document.header.total.amount);
    // Preserve the existing resolver's document-level exact-set amount corroboration.
    const override = !!exact && sameAssignment && attempt.reconciliationResult.eligible;
    if (!choice.every(c => c.unitCompatible) || (!strict && !override)) return;
    counts.afterAmountUnit++;
    if (new Set(ids).size !== ids.length) return;
    counts.afterRecordIdDedupe++;
    const blockers = [...attempt.reconciliationResult.blockers];
    if (!sameAssignment) blockers.push('Existing resolver did not establish this exact observed assignment.');
    if (!exact) blockers.push('Missing authoritative total or nonzero exact-cent difference.');
    audit.push({ invoiceIds: ids, tokens, blockers, exactSetAmountOverride: !strict && override });
    if (blockers.length) return;
    counts.afterExactReconciliation++;
    valid.set(ids.join('|'), { invoiceIds: ids, tokens, totalCents: cents(attempt.resolverResult.matchedTotal) });
  };
  if (!overflow) visit([]);
  const assignments = [...valid.values()];
  return { version: 'phase5-offline-1', document: structuredClone(document), snapshot: structuredClone(snapshot), rows,
    counts, observedTokenAssignmentCount: document.rows.length ? rows.reduce((n,r) => n * r.evidence.fusion.candidates.length, 1) : 0,
    enumerationComplete: !overflow, assignments, audit,
    status: overflow ? 'review-required' : assignments.length === 1 ? 'resolved' : assignments.length > 1 ? 'review-required' : 'inconsistent',
    automaticInvoiceIds: !overflow && assignments.length === 1 ? assignments[0].invoiceIds : [],
    enumerationMs: performance.now() - enumerationStart, durationMs: performance.now() - start };
}
