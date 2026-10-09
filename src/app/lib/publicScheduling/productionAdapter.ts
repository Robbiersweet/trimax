import {createHash} from 'node:crypto';
import {validateRequest,type PublicBusiness} from './domain.ts';
export interface SchedulingRpc {rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:{message:string}|null}>}
export type SchedulingReceipt={id:string;reference:string;status:string;submittedAt:string};
const allowed=['requestTypeId','customerName','phone','email','preferredContact','address','description','preferredDate','timeWindowId','flexibility','urgency','notes','consent','website'];
/** Server-only adapter for a dedicated restricted RPC credential. Never use this
 * client in a browser. No default credential is loaded, and no deployment is enabled.
 * Production handler must pass the fail-closed abuse check before calling submit. */
export function createSchedulingPersistence(client:SchedulingRpc,resolveBusiness:(slug:string)=>Promise<PublicBusiness|null>){
 return {async submit(input:{slug:string;input:unknown;idempotencyKey:string;capabilityHash:string}){
  if(!input.input||typeof input.input!=='object'||Array.isArray(input.input)||Object.keys(input.input).some(key=>!allowed.includes(key)))throw Error('Unexpected request fields');
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)||!/^[a-f0-9]{64}$/.test(input.capabilityHash))throw Error('Invalid request identity');
  const business=await resolveBusiness(input.slug);if(!business||business.slug!==input.slug)throw Error('Public business unavailable');
  const checked=validateRequest(input.input,business);if(!checked.ok)throw Error('Invalid scheduling request: '+Object.keys(checked.fields).join(', '));
  const {data,error}=await client.rpc('trimax_submit_public_service_request',{p_slug:input.slug,p_payload:checked.value,p_idempotency_hash:createHash('sha256').update(input.idempotencyKey).digest('hex'),p_capability_hash:input.capabilityHash});
  if(error)throw Error('Scheduling persistence rejected request');
  const receipt=data as SchedulingReceipt;if(!receipt||typeof receipt.id!=='string'||typeof receipt.reference!=='string'||!['pending_confirmation','reviewing','approved','needs_information','rejected','cancelled','converted'].includes(receipt.status)||typeof receipt.submittedAt!=='string')throw Error('Invalid scheduling receipt');
  return {id:receipt.id,reference:receipt.reference,status:receipt.status,submittedAt:receipt.submittedAt};
 }};
}
