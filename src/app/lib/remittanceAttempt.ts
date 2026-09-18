import { findRemittanceMatches, type RemittanceInvoiceRecord, type RemittanceHeaderPass, type StructuredRemittanceRowEvidence, type RemittanceTotalEvidence, selectRemittanceHeaderEvidence, parseCheckDate, extractUnitCodeCandidates } from "./remittanceMatching.ts";
import { findDuplicateRemittance, type DuplicateRemittanceActivity } from "./duplicateRemittance.ts";

export type OcrObservation = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
export type OcrPass = RemittanceHeaderPass & { words: OcrObservation[] };
export type ScanCapture = { source: string; image: { width: number; height: number; bytes: number; mime: string }; quality: Record<string, number | boolean>; sources: Array<{ id: string; status: "success" | "failure"; stage?: string; error?: string; metrics?: Record<string, unknown> }>; selectionReason: string };
export type TokenAssignment = { row: number; token: string; pass: string; bbox: OcrObservation["bbox"]; centerY: number; rowY: number; distance: number; accepted: boolean; reason: string };
export type RemittanceEvidence = {
  schemaVersion: 1;
  attemptId: string;
  capture: ScanCapture;
  rawPasses: OcrPass[];
  headerEvidence: { checkNumber: string | null; checkDate: string | null; payor: string | null; documentTotal: RemittanceTotalEvidence | null; candidates: ReturnType<typeof selectRemittanceHeaderEvidence> };
  physicalRows: Array<StructuredRemittanceRowEvidence & { bounds: { top: number | null; bottom: number | null }; rawTokens: TokenAssignment[] }>;
  assignments: TokenAssignment[];
  diagnostics: string[];
};
export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export function immutableSnapshot<T>(input: T): Immutable<T> {
  const copy = structuredClone(input);
  function freeze(value: unknown) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  freeze(copy);
  return copy as Immutable<T>;
}
export function createRemittanceEvidence(input: Omit<RemittanceEvidence, "schemaVersion" | "physicalRows"> & { physicalRows: StructuredRemittanceRowEvidence[] }) {
  return immutableSnapshot({ ...input, schemaVersion: 1 as const, physicalRows: input.physicalRows.map((row, index) => ({ ...row, rowId: `row-${index + 1}`, bounds: { top: row.y == null || row.height == null ? null : row.y - row.height / 2, bottom: row.y == null || row.height == null ? null : row.y + row.height / 2 }, rawTokens: input.assignments.filter(assignment => assignment.accepted && assignment.row === index + 1) })) });
}

// The sole OCR-to-payment authority. Inputs include the database/activity snapshot;
// no clock, network, React state, or previous attempt is consulted here.
export function resolveRemittanceAttempt(evidence: Immutable<RemittanceEvidence>, invoices: RemittanceInvoiceRecord[], activities: DuplicateRemittanceActivity[], context: { role: string; receivedDate: string; fingerprint: string }) {
  const snapshot = structuredClone(evidence) as RemittanceEvidence;
  const header = snapshot.headerEvidence;
  const total = header.documentTotal?.source === "explicit-document-total" && header.documentTotal.payable
    ? header.documentTotal : { amount: 0, source: "none" as const, payable: false };
  const rows = snapshot.physicalRows;
  const text = rows.map(row => row.text).join("\n");
  const resolverResult = findRemittanceMatches(invoices.slice().sort((a,b) => a.id.localeCompare(b.id)), text, header.payor ?? "", rows, total);
  if (!rows.length) resolverResult.issues.push("No authoritative physical rows were observed.");
  const duplicateResult = findDuplicateRemittance({ checkNumber: header.checkNumber, checkDate: header.checkDate,
    amount: total.amount, payor: header.payor, receivedDate: context.receivedDate, fingerprint: context.fingerprint,
    invoiceIds: resolverResult.resolvedMatches.map(invoice => invoice.id), invoiceNumbers: resolverResult.resolvedMatches.map(invoice => invoice.displayId),
  }, activities.slice().sort((a,b) => a.id.localeCompare(b.id)), context.role);
  const reviewIds = [...new Set(resolverResult.resolvedMatches.map(invoice => invoice.id))].sort();
  const unitConflicts = resolverResult.matchTrace.filter(trace => trace.accepted && trace.unitCandidates?.length && !trace.unitEvidence && extractUnitCodeCandidates(invoices.find(invoice => invoice.id === trace.invoiceId)?.projectTitle ?? "").length > 0);
  const sourceFailure = snapshot.capture.sources.length > 0 && !snapshot.capture.sources.some(source => source.status === "success");
  const blockers = [...resolverResult.issues, ...(sourceFailure ? ["No capture source evaluation succeeded."] : []), ...(unitConflicts.length ? ["Observed unit conflicts with the resolved invoice unit."] : []), ...(duplicateResult.status !== "none" ? ["Duplicate remittance requires review."] : [])];
  const reconciliationResult = { eligible: blockers.length === 0 && rows.length > 0 && total.amount > 0,
    blockers, reviewIds, documentTotal: total.amount > 0 ? total.amount : null,
    resolvedTotal: resolverResult.matchedTotal, rowSubtotal: resolverResult.lineTotal };
  return immutableSnapshot({ evidence: snapshot, resolverResult, duplicateResult, reconciliationResult,
    corroboration: { invoices, activities, context },
    diagnostics: { FACT: { attemptId: snapshot.attemptId, capture: snapshot.capture, rawPasses: snapshot.rawPasses, assignments: snapshot.assignments },
      NORMALIZATION: { header: snapshot.headerEvidence, rows }, CORROBORATION: resolverResult.matchTrace,
      FINAL_RESOLUTION: { duplicateResult, reconciliationResult } } });
}
export type RemittanceAttempt = ReturnType<typeof resolveRemittanceAttempt>;
export function attemptAllowsApply(attempt: RemittanceAttempt | null, selectedIds: string[], reviewIds: string[], amount: number | null, duplicateConflict: boolean) {
  if (!attempt?.reconciliationResult.eligible || duplicateConflict || amount === null) return false;
  const expected = attempt.reconciliationResult.reviewIds;
  const same = (ids: string[]) => new Set(ids).size === ids.length && ids.length === expected.length && ids.every(id => expected.includes(id));
  return same(selectedIds) && same(reviewIds) && Math.round(amount * 100) === Math.round((attempt.reconciliationResult.documentTotal ?? 0) * 100);
}

export function selectObservedHeader(passes: OcrPass[], rows: StructuredRemittanceRowEvidence[]) {
  const candidates = selectRemittanceHeaderEvidence(passes, rows);
  const dates = new Set<string>();
  const payors = new Set<string>();
  for (const pass of passes.filter(pass => !/merged|reconstruction/.test(pass.region))) {
    for (const line of pass.text.split(/\r?\n/)) {
      if (/\b[I1L|]?NV/i.test(line) && !/\b(?:CHECK|CK#|TOTAL)\b/i.test(line)) continue;
      const date = line.match(/\b(?:CHECK\s+DATE|PAYMENT\s+DATE|DATE)\s*[:#]?\s*(\d{1,4}[/-]\d{1,2}[/-]\d{1,4})/i);
      if (date) { const parsed = parseCheckDate(date[1]); if (parsed) dates.add(parsed); }
      const payor = line.match(/^\s*(?:PAYOR|CUSTOMER|PROPERTY)\s*:\s*(.+)$/i);
      if (payor) payors.add(payor[1].trim());
    }
  }
  const rowSubtotal = rows.reduce((sum, row) => sum + (row.amountCandidates.find(amount => amount.selected)?.value ?? 0), 0);
  const tinyConflict = (candidates.evidence?.amount ?? 0) < rowSubtotal * 0.1 && (candidates.totalCandidates[0]?.agreement ?? 0) < 2;
  return { checkNumber: candidates.checkNumber || null, checkDate: dates.size === 1 ? [...dates][0] : null,
    payor: payors.size === 1 ? [...payors][0] : null, documentTotal: candidates.evidence?.payable && !tinyConflict ? candidates.evidence : null, candidates };
}

export function emptyRemittanceEvidence(attemptId: string, capture: ScanCapture | null, reason: string) {
  return createRemittanceEvidence({ attemptId, capture: capture ?? { source: "unknown", image: { width: 0, height: 0, bytes: 0, mime: "unknown" }, quality: {}, sources: [], selectionReason: "Not evaluated" }, rawPasses: [],
    headerEvidence: { checkNumber: null, checkDate: null, payor: null, documentTotal: null, candidates: { evidence: null, totalCandidates: [], checkNumber: "", checkCandidates: [] } }, physicalRows: [], assignments: [], diagnostics: [reason] });
}
