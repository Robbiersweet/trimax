/** Validated arithmetic adapter; the frozen business resolver remains unchanged. */
import { resolveOfflineDocument, type OfflineDocument, type OfflineSnapshot, type OfflineRow } from './index.ts';
import { deriveResidualAmount, type ResidualEvaluation } from '../recognition/residualAmount.ts';
export type ResidualDocument = OfflineDocument & { residualEvidence?: ResidualEvaluation };
export function resolveDocumentWithResidual(document: ResidualDocument,snapshot: OfflineSnapshot,limit=10000) {
  const residual=document.residualEvidence;
  const derived=residual?.evidence ? deriveResidualAmount(residual.input).evidence : null;
  if(residual?.evidence) {
    if(!derived || derived.derivedAmount!==residual.evidence.derivedAmount || derived.rowId!==residual.evidence.rowId ||
      residual.input.documentId!==document.id || residual.input.rows.length!==document.rows.length ||
      document.header.total?.source!=='explicit-document-total' || !document.header.total.payable ||
      document.header.total.amount!==derived.authoritativeTotal.cents/100)throw Error('Invalid residual document proof');
    for(const r of document.rows) {
      const proof=residual.input.rows.find(p=>p.rowId===r.rowId),values=[...new Set(r.amounts.map(a=>a.cents))];
      if(!proof || r.geometry.sourceHash!==residual.input.sourceHash || proof.bounds.top!==r.geometry.top || proof.bounds.height!==r.geometry.height ||
        proof.bounds.left!==r.geometry.left || proof.bounds.width!==r.geometry.width ||
        (proof.cents===null?values.length!==0:values.length!==1||values[0]!==proof.cents) ||
        proof.provenance.some(id=>!r.amounts.some(a=>a.observationId===id)))throw Error('Residual proof does not match current physical row evidence');
    }
  }
  // Separate arithmetic evidence is projected for matching only; raw OCR amounts stay untouched.
  // A zero residual is valid arithmetic, but is not positive collectible payment evidence.
  const amountsFor=(row: OfflineRow)=>derived?.rowId===row.rowId ? derived.derivedAmount===0 ? [] : [{cents:derived.derivedAmount,raw:'Derived: document total minus confirmed rows',observationId:'derived:'+row.rowId,rowId:row.rowId}] : row.amounts;
  const projected = { ...document, rows:document.rows.map(row=>({...row,amounts:amountsFor(row)})) };
  const result=resolveOfflineDocument(projected,snapshot,limit);
  return {...result,document:structuredClone(document),rows:result.rows.map(row=>({...row,evidence:document.rows.find(r=>r.rowId===row.rowId)!,alternatives:row.alternatives.map(a=>({...a,
    amountEvidenceClass:derived?.rowId===row.rowId?'derived-arithmetic':'ocr-recognized',
    trace:derived?.rowId===row.rowId&&a.trace?{...a.trace,ocrRowAmount:null,derivedRowAmount:derived.derivedAmount/100,
      amountEvidence:'Derived document arithmetic: '+(derived.derivedAmount/100).toFixed(2)}:a.trace,
    recordState:snapshot.invoices.find(i=>i.id===a.invoiceId)?.status??null}))}))};
}
