/* Scoring-only; never imported by inference. */
const token=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function evidenceMetrics(expected,observed){
 const truth=expected.truth,rows=observed.document?.rows||[],total=observed.document?.header?.total?.amount;
 const authoritative=total==null?null:Math.round(total*100);
 const result={wrongAuthoritativeTotals:0,wrongAcceptedRowAmounts:0,wrongInvoiceTokens:0,wrongRecordIds:0,intermediateNumericEvidence:[],intermediateWrongNumericConsensuses:[],failures:[]};
 result.wrongAuthoritativeTotals=[...new Set([authoritative,observed.monetary?.authority?.cents].filter(v=>v!=null))].filter(v=>v!==truth.authoritativeTotalCents).length;
 rows.forEach((r,i)=>{const t=truth.rows[i];result.wrongAcceptedRowAmounts += [...new Set((r.amounts||[]).map(a=>a.cents))].filter(v=>!t||v!==t.amountCents).length;
 if(r.fusion?.confidence?.confidentlySelected&&token(r.fusion.topCandidate)!==token(t?.invoiceNumber))result.wrongInvoiceTokens++;});
 result.wrongRecordIds=(observed.resolver?.automaticInvoiceIds||[]).filter((id,i)=>!truth.rows[i]?.invoiceRecordId||id!==truth.rows[i].invoiceRecordId).length;
 function add(stage,field,rowId,cents,provenance,reason){if(cents==null)return;const index=rows.findIndex(r=>r.rowId===rowId);const value=field==='total'?truth.authoritativeTotalCents:truth.rows[index]?.amountCents;
 const accepted=field==='total'?authoritative===cents:(rows[index]?.amounts||[]).some(a=>a.cents===cents);
 const item={stage,field,rowId,cents,expectedCents:value??null,correct:value!=null&&value===cents,acceptedDownstream:accepted,provenance:provenance||[],rejectionReason:accepted?null:reason||'Field excluded by downstream evidence contract'};
 result.intermediateNumericEvidence.push(item);if(!item.correct){result.intermediateWrongNumericConsensuses.push(item);if(accepted)result.failures.push('Wrong intermediate money reached authority: '+stage+':'+rowId);}}
 for(const f of observed.matureMoney||[])add('mature-money-consensus',f.field,f.rowId,f.cents,f.provenance,f.field==='total'?observed.monetary?.authority?.reason:'Not accepted in final row evidence');
 for(const f of observed.monetary?.rows||[])add('tesseract-money-consensus','row_amount',f.rowId,f.cents,f.provenance,'Not accepted in final row evidence');
 add('semantic-page-total','total','document-total',observed.pageOnlyTotal?.cents,observed.pageOnlyTotal?.provenance,observed.monetary?.authority?.reason);
 return result;
}
module.exports={evidenceMetrics};
