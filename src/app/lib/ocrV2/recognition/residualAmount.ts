import type { Bounds } from '../types.ts';

export type ResidualInput = {
  documentId: string; sourceHash: string;
  authoritativeTotal: { cents: number | null; provenance: string[] };
  rows: Array<{ rowId: string; bounds: Bounds; ownership: Bounds | null; cropHash: string;
    cents: number | null; authoritative: boolean; provenance: string[] }>;
  // Distinct page-pass invoice anchors: each must map one-to-one to physical rows.
  passes: Array<{ observationId: string; anchors: Bounds[] }>;
};
export type DerivedAmountEvidence = {
  evidenceClass: 'derived-arithmetic'; rowId: string;
  derivation: 'document_total_minus_confirmed_rows';
  authoritativeTotal: { cents: number; provenance: string[] };
  confirmedRowAmounts: Array<{ rowId: string; cents: number; provenance: string[] }>;
  derivedAmount: number; arithmeticDifference: number;
  prerequisitesSatisfied: true;
  provenance: { documentId: string; sourceHash: string; rowCropHash: string; passIds: string[] };
};
const validCents = (n: number) => Number.isSafeInteger(n) && n >= 0;
const validBox = (b: Bounds) => [b.left,b.top,b.width,b.height].every(Number.isFinite) && b.left >= 0 && b.top >= 0 && b.width > 0 && b.height > 0;
const contains = (a: Bounds,b: Bounds) => b.left >= a.left && b.top >= a.top && b.left+b.width <= a.left+a.width && b.top+b.height <= a.top+a.height;
const overlaps = (a: Bounds,b: Bounds) => Math.min(a.left+a.width,b.left+b.width)>Math.max(a.left,b.left) && Math.min(a.top+a.height,b.top+b.height)>Math.max(a.top,b.top);

/** Pure exact-cent arithmetic. No invoice records, expected labels or OCR substitutions. */
export function deriveResidualAmount(input: ResidualInput) {
  const reasons: string[] = [], {rows,authoritativeTotal:total,passes}=input;
  if(!input.documentId || !input.sourceHash)reasons.push('Missing source provenance');
  if(total.cents===null || !validCents(total.cents) || !total.provenance.length)reasons.push('No authoritative exact-cent total');
  if(rows.length<2 || new Set(rows.map(r=>r.rowId)).size!==rows.length || rows.some(r=>!r.rowId))reasons.push('Missing or duplicate physical rows');
  if(rows.some(r=>!validBox(r.bounds)||!r.ownership||!validBox(r.ownership)||!contains(r.bounds,r.ownership)||!r.cropHash))reasons.push('Unproven row ownership');
  if(rows.some((r,i)=>rows.slice(i+1).some(s=>overlaps(r.bounds,s.bounds))))reasons.push('Competing or duplicate row allocation');
  if(passes.length<2 || new Set(passes.map(p=>p.observationId)).size!==passes.length || passes.some(p=>!p.observationId || p.anchors.length!==rows.length ||
    p.anchors.some(a=>!validBox(a)||rows.filter(r=>contains(r.bounds,a)).length!==1) || rows.some(r=>p.anchors.filter(a=>contains(r.bounds,a)).length!==1)))reasons.push('Physical row count is not stable across page passes');
  const unresolved=rows.filter(r=>r.cents===null);
  if(unresolved.length!==1)reasons.push('Exactly one unresolved row required');
  const confirmed=rows.filter(r=>r.cents!==null);
  if(confirmed.some(r=>!r.authoritative||!validCents(r.cents!)||!r.provenance.length))reasons.push('Another row lacks authoritative exact-cent evidence');
  const subtotal=confirmed.reduce((sum,r)=>sum+(r.cents??0),0);
  const residual=total.cents===null?null:total.cents-subtotal;
  if(!validCents(subtotal)||residual===null||!validCents(residual))reasons.push('Negative, fractional or unsafe arithmetic residual');
  const difference=residual===null?null:subtotal+residual-total.cents!;
  if(difference!==0)reasons.push('Arithmetic mismatch');
  const evidence: DerivedAmountEvidence|null=reasons.length?null:{evidenceClass:'derived-arithmetic',rowId:unresolved[0].rowId,
    derivation:'document_total_minus_confirmed_rows',authoritativeTotal:{cents:total.cents!,provenance:[...total.provenance]},
    confirmedRowAmounts:confirmed.map(r=>({rowId:r.rowId,cents:r.cents!,provenance:[...r.provenance]})),derivedAmount:residual!,arithmeticDifference:0,
    prerequisitesSatisfied:true,provenance:{documentId:input.documentId,sourceHash:input.sourceHash,rowCropHash:unresolved[0].cropHash,passIds:passes.map(p=>p.observationId)}};
  return {input:structuredClone(input),evidence,reasons,confirmedSubtotal:validCents(subtotal)?subtotal:null};
}
export type ResidualEvaluation = ReturnType<typeof deriveResidualAmount>;
