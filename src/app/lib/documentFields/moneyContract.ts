/** Neutral field packet. Contains visual evidence only, never a resolver decision. */
import type { OcrV2Foundation, Bounds } from '../ocrV2/types.ts';
import type { completeMoneyFields, prepareMoneyFields } from './moneyService.ts';
import { fuseMoneyObservations } from '../ocrV2/recognition/matureMoney.ts';
import { immutableSnapshot, type Immutable, type RemittanceEvidence } from '../remittanceAttempt.ts';
export type SharedMoneyEvidence={version:'shared-money-1';captureSessionId:string;canonicalHash:string;normalizedHash:string;normalization:OcrV2Foundation;rows:Array<{id:string;bounds:Bounds}>;fields:ReturnType<typeof completeMoneyFields>;monetary:Awaited<ReturnType<typeof prepareMoneyFields>>['monetary']};
export function moneyForConsumer(packet:SharedMoneyEvidence,expected:{captureSessionId:string;canonicalHash:string}){
 if(packet.version!=='shared-money-1'||packet.captureSessionId!==expected.captureSessionId||packet.canonicalHash!==expected.canonicalHash||packet.normalization.sourceImage.sha256!==expected.canonicalHash)throw Error('Stale or mismatched monetary capture');
 for(const f of packet.fields){const decision=fuseMoneyObservations(f.observations,{rowId:f.rowId,field:f.field,documentId:f.observations[0]?.documentId,sourceHash:packet.normalizedHash,cropHash:f.cropHash});if(decision.cents!==f.cents)throw Error('Invalid monetary decision');}
 return immutableSnapshot(packet);
}
/** Map by physical ownership, never row order or invoice values. Unsupported
 * coordinate transforms remain unavailable rather than guessing row identity. */
export function legacyMoneyEvidence(evidence:Immutable<RemittanceEvidence>,packet:SharedMoneyEvidence,frame:{captureSessionId:string;canonicalHash:string;rotation:number;width:number;height:number}){
 if(evidence.attemptId!==frame.captureSessionId)throw Error('Stale legacy attempt');
 const shared=moneyForConsumer(packet,frame),n=shared.normalization.normalization;
 if(n.perspectiveApplied||n.deskewDegrees!==0||n.rotation!==frame.rotation||n.documentDimensions.width!==frame.width||n.documentDimensions.height!==frame.height||shared.normalization.documentGeometry.bounds.left!==0||shared.normalization.documentGeometry.bounds.top!==0)throw Error('Shared and legacy geometry require an explicit coordinate transform');
 const copy=structuredClone(evidence) as RemittanceEvidence;
 const used=new Set<string>();
 for(const row of copy.physicalRows){
  const matches=shared.rows.filter(r=>row.y!=null&&row.y>=r.bounds.top&&row.y<r.bounds.top+r.bounds.height);
  if(matches.length!==1||used.has(matches[0].id))throw Error('Ambiguous shared physical row ownership');
  const owner=matches[0];used.add(owner.id);
  const field=shared.fields.find(f=>f.rowId===owner.id&&f.field==='row_amount');
  if(!field||field.cents===null)continue;
  const previous=row.amountCandidates.filter(c=>c.selected).map(c=>Math.round(c.value*100));
  const conflict=previous.some(c=>c!==field.cents);
  if(conflict)row.amountCandidates.forEach(c=>{c.selected=false;});
  const raw=field.observations.filter(o=>field.provenance.includes(o.id)).map(o=>o.raw).join(' | ');
  if(!row.amountCandidates.some(c=>c.raw===raw&&c.bbox?.x0===field.bounds.left&&c.bbox?.y0===field.bounds.top&&Math.round(c.value*100)===field.cents))row.amountCandidates.push({raw,normalized:(field.cents/100).toFixed(2),value:field.cents/100,selected:!conflict,bbox:{x0:field.bounds.left,y0:field.bounds.top,x1:field.bounds.left+field.bounds.width,y1:field.bounds.top+field.bounds.height}});
 }
 if(used.size!==shared.rows.length)throw Error('Incomplete shared physical row mapping');
 const total=shared.monetary.authority.cents;
 if(total!==null){const old=copy.headerEvidence.documentTotal;copy.headerEvidence.documentTotal=old&&Math.round(old.amount*100)!==total?null:{amount:total/100,source:'explicit-document-total',payable:true};}
 // Keep complete provenance with the evidence snapshot, not just projected values.
 return immutableSnapshot({...copy,sharedMonetaryEvidence:shared});
}
