import { moneyCents, sumMoney } from "./money.ts";
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
  return same(selectedIds) && same(reviewIds) && moneyCents(amount) === moneyCents(attempt.reconciliationResult.documentTotal ?? 0);
}

export function selectRepeatedPropertyIdentity(passes: OcrPass[], rows: StructuredRemittanceRowEvidence[]) {
  const observations: Array<{text:string;rowId:string;pass:string;bounds:OcrObservation['bbox']}> = [];
  const titleWords=passes.filter(p=>p.region==='full-document').flatMap(p=>p.words);
  for(const pass of passes.filter(p=>p.region==='full-document'||p.region.startsWith('payment-property-row-'))){
    const anchors=pass.region==='full-document'?pass.words:titleWords;
    const property=anchors.find(w=>/^property$/i.test(w.text)&&anchors.some(a=>/^account$/i.test(a.text)&&a.bbox.x0>w.bbox.x1&&Math.abs(a.bbox.y0-w.bbox.y0)<40));
    if(!property)continue;
    const account=anchors.find(w=>/^account$/i.test(w.text)&&w.bbox.x0>property.bbox.x1&&Math.abs(w.bbox.y0-property.bbox.y0)<40);
    if(!account)continue;
    for(const row of rows){
      if(row.y==null||row.height==null)continue;
      const words=pass.words.filter(w=>{
        const y=(w.bbox.y0+w.bbox.y1)/2;
        const nearest=rows.filter(r=>r.y!=null).slice().sort((a,b)=>Math.abs(a.y!-y)-Math.abs(b.y!-y))[0];
        return nearest===row&&Math.abs(y-row.y!)<=row.height!&&w.bbox.y0>property.bbox.y1&&w.bbox.x0>=property.bbox.x0-20&&w.bbox.x1<account.bbox.x0-8;
      }).sort((a,b)=>a.bbox.x0-b.bbox.x0);
      const text=words.map(w=>w.text).join(' ').normalize('NFKC').replace(/\s+/g,' ').trim();
      if(words.length<2||words.some(w=>w.confidence<60)||!/^\p{L}+(?:[ '-]+\p{L}+)+$/u.test(text))continue;
      observations.push({text,rowId:row.rowId,pass:[pass.region.replace(/payment-property-row-\d+$/,'payment-property-row'),pass.variant,pass.pageMode].join(':'),bounds:{x0:Math.min(...words.map(w=>w.bbox.x0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y0:Math.min(...words.map(w=>w.bbox.y0)),y1:Math.max(...words.map(w=>w.bbox.y1))}});
    }
  }
  const candidates=[...new Set(observations.map(o=>o.text.toLowerCase()))].map(key=>{
    const votes=observations.filter(o=>o.text.toLowerCase()===key);
    const passes=[...new Set(votes.map(o=>o.pass))].filter(p=>new Set(votes.filter(o=>o.pass===p).map(o=>o.rowId)).size>=2);
    return {value:votes[0].text,passes,rows:[...new Set(votes.map(o=>o.rowId))]};
  });
  const supported=candidates.filter(c=>c.passes.length>=2&&c.rows.length>=2);
  return {value:supported.length===1?supported[0].value:null,observations,candidates};
}

export function selectObservedCheckDate(passes: OcrPass[], rows: StructuredRemittanceRowEvidence[]) {
  const bodyTop=Math.min(...rows.filter(r=>r.y!=null&&r.height!=null).map(r=>r.y!-r.height!));
  const observations:Array<{date:string;raw:string;pass:string;bounds:OcrObservation['bbox']}> = [];
  if(!Number.isFinite(bodyTop))return {value:null,observations};
  for(const pass of passes.filter(p=>p.region==='full-document'||p.region==='stub-header'||p.region.startsWith('payment-header-field-'))){
    const words=pass.words.filter(w=>Number.isFinite(w.confidence)&&w.confidence>=70&&Object.values(w.bbox).every(Number.isFinite)&&w.bbox.y0>=0&&w.bbox.y1<bodyTop);
    for(const word of words){
      let raw=word.text;
      if(/^DATE\s*[:#]?$/i.test(raw)){
        const next=words.filter(w=>w.bbox.x0>=word.bbox.x1&&w.bbox.x0-word.bbox.x1<100&&Math.abs((w.bbox.y0+w.bbox.y1-word.bbox.y0-word.bbox.y1)/2)<Math.max(word.bbox.y1-word.bbox.y0,w.bbox.y1-w.bbox.y0)).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0];
        if(next)raw+=' '+next.text;
      }
      const match=raw.match(/^(?:CHECK\s+|PAYMENT\s+)?DATE\s*[:#]?\s*(\d{1,4}[/-]\d{1,2}[/-]\d{1,4})$/i);
      const date=match?parseCheckDate(match[1]):null;
      if(date)observations.push({date,raw,pass:[pass.region,pass.variant,pass.pageMode].join(':'),bounds:word.bbox});
    }
  }
  const dates=[...new Set(observations.map(o=>o.date))];
  return {value:dates.length===1&&new Set(observations.map(o=>o.pass)).size>=2?dates[0]:null,observations};
}

export function selectObservedCheckNumber(passes: OcrPass[], rows: StructuredRemittanceRowEvidence[]) {
  const bodyTop=Math.min(...rows.filter(r=>r.y!=null&&r.height!=null).map(r=>r.y!-r.height!));
  const observations:Array<{number:string;raw:string;pass:string;bounds:OcrObservation['bbox'];confidence:number;dateAnchored:boolean;standardLabel:boolean}> = [];
  if(!Number.isFinite(bodyTop))return {value:null,observations};
  for(const pass of passes.filter(p=>p.region==='full-document')){
    const words=pass.words.filter(w=>Number.isFinite(w.confidence)&&w.confidence>=35&&Object.values(w.bbox).every(Number.isFinite)&&w.bbox.y0>=0&&w.bbox.y1<bodyTop);
    for(const word of words){
      let raw=word.text;
      if(/^(?:CHECK|CHK|CK)(?:\s*(?:NO\.?|NUMBER))?\s*[#:]?\s*:?$/i.test(raw)){
        const next=words.filter(w=>w.bbox.x0>=word.bbox.x1&&w.bbox.x0-word.bbox.x1<100&&Math.abs((w.bbox.y0+w.bbox.y1-word.bbox.y0-word.bbox.y1)/2)<Math.max(word.bbox.y1-word.bbox.y0,w.bbox.y1-w.bbox.y0)).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0];
        if(next)raw+=' '+next.text;
      }
      const match=raw.match(/^(?:CHECK|CHK|CK)(?:\s*(?:NO\.?|NUMBER))?\s*[#¥:]?\s*:?\s*(\d{1,12})$/i);
      const dateAnchored=words.some(w=>w.confidence>=70&&/^DATE\s*:\s*\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/i.test(w.text)&&Boolean(parseCheckDate(w.text.replace(/^DATE\s*:\s*/i,'')))&&w.bbox.x1<word.bbox.x0&&word.bbox.x0-w.bbox.x1<150&&Math.abs(w.bbox.y0-word.bbox.y0)<Math.max(w.bbox.y1-w.bbox.y0,word.bbox.y1-word.bbox.y0));
      if(match)observations.push({number:match[1],raw,pass:[pass.region,pass.variant,pass.pageMode].join(':'),bounds:word.bbox,confidence:word.confidence,dateAnchored,standardLabel:!raw.includes('¥')});
    }
  }
  const numbers=[...new Set(observations.map(o=>o.number))];
  const strong=observations.filter(o=>o.confidence>=70);
  const anchored=observations.filter(o=>o.dateAnchored);
  const sameLocation=anchored.length>=2&&anchored.every(o=>Math.abs(o.bounds.x0-anchored[0].bounds.x0)<50&&Math.abs(o.bounds.y0-anchored[0].bounds.y0)<30);
  const corroborated=new Set(strong.map(o=>o.pass)).size>=2||(sameLocation&&new Set(anchored.map(o=>o.pass)).size>=2&&anchored.some(o=>o.confidence>=50&&o.standardLabel));
  return {value:numbers.length===1&&corroborated?numbers[0]:null,observations};
}

export function selectObservedHeader(passes: OcrPass[], rows: StructuredRemittanceRowEvidence[]) {
  const candidates = selectRemittanceHeaderEvidence(passes, rows);
  const dates = new Set<string>();
  const payors = new Set<string>();
  for (const pass of passes.filter(pass => !/merged|reconstruction/.test(pass.region))) {
    for (const line of pass.text.split(/\r?\n/)) {
      if (/\b[I1L|]?NV/i.test(line) && !/\b(?:CHECK|CK#|TOTAL)\b/i.test(line)) continue;
      const date = line.match(/\b(?:CHECK\s+DATE|PAYMENT\s+DATE|DATE)\s*[:#]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-](?:\d{4}|\d{2}))(?![\p{L}\p{N}])/iu);
      if (date && (pass.confidence ?? 0) >= 70) { const parsed = parseCheckDate(date[1]); if (parsed) dates.add(parsed); }
      const payor = line.match(/^\s*(?:PAYOR|CUSTOMER|PROPERTY)\s*:\s*(.+)$/i);
      if (payor) payors.add(payor[1].trim());
    }
  }
  const rowSubtotal = sumMoney(rows.map(row => row.amountCandidates.find(amount => amount.selected)?.value ?? 0));
  const propertyIdentity=selectRepeatedPropertyIdentity(passes,rows);
  const checkDateEvidence=selectObservedCheckDate(passes,rows);
  const checkNumberEvidence=selectObservedCheckNumber(passes,rows);
  const checkNumbers=new Set([candidates.checkNumber,checkNumberEvidence.value].filter((n):n is string=>Boolean(n)));
  const labelledCheckCandidates=candidates.checkCandidates.filter(c=>c.labelled);
  const repeatedCheckValues=[...new Set(labelledCheckCandidates.map(c=>c.value))].filter(value=>new Set(labelledCheckCandidates.filter(c=>c.value===value).map(c=>[c.region,c.variant,c.pageMode].join(':'))).size>=2);
  const conflictingCheckWords=new Set(checkNumberEvidence.observations.map(o=>o.number)).size>1||repeatedCheckValues.length>1;
  // Repeated strong label+value observations of the physical header outrank
  // uncalibrated page text; a competing strong date keeps value unavailable.
  if(checkDateEvidence.value){dates.clear();dates.add(checkDateEvidence.value);}
  else if(new Set(checkDateEvidence.observations.map(o=>o.pass)).size>=2&&new Set(checkDateEvidence.observations.map(o=>o.date)).size>1)checkDateEvidence.observations.forEach(o=>dates.add(o.date));
  const tinyConflict = (candidates.evidence?.amount ?? 0) < rowSubtotal * 0.1 && (candidates.totalCandidates[0]?.agreement ?? 0) < 2;
  return { checkNumber: !conflictingCheckWords&&checkNumbers.size===1?[...checkNumbers][0]:null, checkDate: dates.size === 1 ? [...dates][0] : null,
    payor: payors.size === 1 ? [...payors][0] : payors.size===0?propertyIdentity.value:null, propertyIdentity, checkDateEvidence, checkNumberEvidence, documentTotal: candidates.evidence?.payable && !tinyConflict ? candidates.evidence : null, candidates };
}

export function emptyRemittanceEvidence(attemptId: string, capture: ScanCapture | null, reason: string) {
  return createRemittanceEvidence({ attemptId, capture: capture ?? { source: "unknown", image: { width: 0, height: 0, bytes: 0, mime: "unknown" }, quality: {}, sources: [], selectionReason: "Not evaluated" }, rawPasses: [],
    headerEvidence: { checkNumber: null, checkDate: null, payor: null, documentTotal: null, candidates: { evidence: null, totalCandidates: [], checkNumber: "", checkCandidates: [] } }, physicalRows: [], assignments: [], diagnostics: [reason] });
}
