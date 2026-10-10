/** Authority consumes optical consensus; shared services do not import this layer. */
import type { recognizeSemanticMoney } from './semanticMoney.ts';
import type { completeMoneyFields } from '../../documentFields/moneyService.ts';
import { decideDocumentTotal } from './documentTotalAuthority.ts';
/** Complete the existing document-authority decision after the shared models finish. */
export function completeMoneyAuthority(monetary: Awaited<ReturnType<typeof recognizeSemanticMoney>>, fields: ReturnType<typeof completeMoneyFields>) {
 const total=fields.find(f=>f.field==='total');
 if(total?.cents==null)return monetary.authority;
 if(monetary.authority.cents!==null&&monetary.authority.cents!==total.cents)return {...monetary.authority,cents:null,reason:'Conflicting established and specialized total evidence'};
 const input=monetary.authorityInput;
 const decision=decideDocumentTotal(input.layout,input.evidence,input.observations,{cents:total.cents,bounds:total.bounds,sourceHash:input.evidence.sourceHash,provenance:total.provenance});
 if(monetary.authority.cents!==null&&decision.cents!==null&&monetary.authority.cents!==decision.cents)return {...decision,cents:null,reason:'Conflicting established and specialized total evidence'};
 return decision.cents!==null?decision:monetary.authority;
}
