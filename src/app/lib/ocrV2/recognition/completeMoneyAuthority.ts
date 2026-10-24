/** Authority consumes optical consensus; shared services do not import this layer. */
import type { recognizeSemanticMoney } from './semanticMoney.ts';
import type { completeMoneyFields } from '../../documentFields/moneyService.ts';
import { decideDocumentTotal,type MatureHeaderTotalProof } from './documentTotalAuthority.ts';
/** Complete the existing document-authority decision after the shared models finish. */
export function completeMoneyAuthority(monetary: Awaited<ReturnType<typeof recognizeSemanticMoney>>, fields: ReturnType<typeof completeMoneyFields>,matureHeaders:MatureHeaderTotalProof[]=[]) {
 const total=fields.find(f=>f.field==='total');
 if(total?.cents==null)return monetary.authority;
 if(monetary.authority.cents!==null&&monetary.authority.cents!==total.cents)return {...monetary.authority,cents:null,reason:'Conflicting established and specialized total evidence'};
 const input=monetary.authorityInput;
 const rows=input.evidence.rows.map(row=>{const field=fields.find(f=>f.field==='row_amount'&&f.rowId===row.rowId);return field?{...row,cents:field.cents}:row;});
 const evidence={...input.evidence,rows};
 const decision=decideDocumentTotal(input.layout,evidence,input.observations,{cents:total.cents,bounds:total.bounds,sourceHash:input.evidence.sourceHash,provenance:total.provenance,cropHash:total.cropHash,recognizers:[...new Set(total.observations.filter(o=>total.provenance.includes(o.id)).map(o=>o.recognizer))],models:[...new Set(total.observations.map(o=>o.recognizer))]},matureHeaders);
 if(monetary.authority.cents!==null&&decision.cents!==null&&monetary.authority.cents!==decision.cents)return {...decision,cents:null,reason:'Conflicting established and specialized total evidence'};
 return decision.cents!==null?{...decision,matureRowReconciliation:fields.filter(f=>f.field==='row_amount').map(f=>({rowId:f.rowId,cents:f.cents,cropHash:f.cropHash,provenance:f.provenance}))}:decision;
}
