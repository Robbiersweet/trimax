/** Shared visual money service. No resolver, invoice snapshot or business values. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { Bounds } from '../ocrV2/types.ts';
import type { DocumentSemanticModel, SemanticObservation } from '../ocrV2/semantics/model.ts';
import { EvidenceLedger } from '../ocrV2/recognition/evidenceLedger.ts';
import { recognizeSemanticMoney } from '../ocrV2/recognition/semanticMoney.ts';
import { fuseMoneyObservations, normalizeVisualMoney, type MatureMoneyObservation } from '../ocrV2/recognition/matureMoney.ts';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export type MoneyCrop={rowId:string;field:'row_amount'|'total';bounds:Bounds;bytes:Buffer;sha256:string};
export async function prepareMoneyFields(image:Buffer,model:DocumentSemanticModel,page:SemanticObservation[],ledger:EvidenceLedger) {
 const monetary=await recognizeSemanticMoney(image,model,page,ledger);
 const crops:MoneyCrop[]=[];
 const regions=[...monetary.regions.filter(r=>r.bounds).map(r=>({rowId:r.rowId,field:'row_amount' as const,bounds:r.bounds!})),...(monetary.totalBounds?[{rowId:'document-total',field:'total' as const,bounds:monetary.totalBounds}]:[])];
 for(const region of regions){const bytes=await sharp(image).extract(region.bounds).flatten({background:'white'}).png().toBuffer();crops.push({...region,bytes,sha256:hash(bytes)});}
 return {monetary,crops};
}
/** Complete a batched model invocation; retain every observation, including rejects. */
export function completeMoneyFields(crops:MoneyCrop[],observations:MatureMoneyObservation[],versions:Record<string,unknown>,ledger:EvidenceLedger){
 if(observations.some(o=>!crops.some(c=>c.rowId===o.rowId&&c.field===o.field)))throw Error('Unexpected monetary field output');
 return crops.map(crop=>{
  const expected={rowId:crop.rowId,field:crop.field,documentId:ledger.documentId,sourceHash:ledger.sourceHash,cropHash:crop.sha256};
  const own=observations.filter(o=>o.rowId===crop.rowId&&o.field===crop.field),decision=fuseMoneyObservations(own,expected);
  for(const o of own)ledger.append({field:o.field,documentId:ledger.documentId,rowId:o.field==='row_amount'?o.rowId:undefined,sourceHash:ledger.sourceHash,cropHash:crop.sha256,region:crop.bounds,recognizer:o.recognizer,variant:'native',configuration:`mature-money-consensus-1:${hash(Buffer.from(JSON.stringify(versions)))}`,raw:o.raw,normalized:normalizeVisualMoney(o.raw)===null?[]:[String(normalizeVisualMoney(o.raw))],confidence:o.confidence??0,durationMs:o.durationMs,provenance:{valid:true,reason:'Uncalibrated sequence recognizer on exact same physical money crop; no business hints',reference:o.id},stage:'phase6-mature-money',timestamp:new Date().toISOString()});
  return {rowId:crop.rowId,field:crop.field,bounds:crop.bounds,cropHash:crop.sha256,...decision};
 });
}
