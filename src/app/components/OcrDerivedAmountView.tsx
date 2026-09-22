export default function OcrDerivedAmountView({payload}:{payload:unknown}) {
  // Read-only diagnostic projection; no inference module enters the browser bundle.
  const result=(payload as {result?:{residual?:{confirmedSubtotal:number|null;reasons:string[];evidence:null|{
    rowId:string;derivedAmount:number;arithmeticDifference:number;authoritativeTotal:{cents:number}
  }}}})?.result;
  if(!result?.residual)return null;
  const {evidence,reasons,confirmedSubtotal}=result.residual;
  const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
  return <section className="space-y-1 rounded border border-white/15 p-3 text-sm">
    <h4 className="font-semibold">Document arithmetic evidence</h4>
    {evidence ? <>
      <p>{evidence.rowId} · OCR amount: unresolved · Derived amount: {money(evidence.derivedAmount)}</p>
      <p>Authoritative total {money(evidence.authoritativeTotal.cents)} − confirmed rows {money(confirmedSubtotal!)} = {money(evidence.derivedAmount)}</p>
      <p>Prerequisites satisfied · Exact arithmetic difference: {money(evidence.arithmeticDifference)}</p>
      <p>Derived from document arithmetic; not OCR-recognized digits. Identity, invoice eligibility and payment checks still apply.</p>
    </> : <p>No derived amount: {reasons.join('; ')}</p>}
  </section>;
}
