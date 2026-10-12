import {readBoundedJson} from './httpBody.ts';
import {validateRequest} from './domain.ts';
import {productionConfig,productionBusiness,restrictedRpc,unusedCapabilityHash} from './productionRuntime.ts';
import {createSchedulingPersistence} from './productionAdapter.ts';
import {submitProductionRequest} from './productionService.ts';
import {trustedVercelIdentity} from './providers.ts';

export async function productionSubmission(request:Request,slug:string){
 const closed=()=>Response.json({error:'Online requests are unavailable. Your details are still here; please retry later.'},{status:503,headers:{'Cache-Control':'no-store'}});
 let config;try{config=productionConfig();}catch{return closed();}
 if(request.headers.get('origin')!==config.origin)return Response.json({error:'Origin not allowed.'},{status:403});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON required.'},{status:415});
 let input:unknown;try{input=await readBoundedJson(request,16384);}catch{return Response.json({error:'Invalid or oversized body.'},{status:400});}
 const key=request.headers.get('idempotency-key')??'';
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))return Response.json({error:'Invalid request key.'},{status:400});
 try{
  const identity=trustedVercelIdentity(request),client=restrictedRpc(config);
  const business=await productionBusiness(slug,client);
  if(!business)return Response.json({error:'Business unavailable.'},{status:404});
  const validated=validateRequest(input,business);
  if(!validated.ok)return Response.json({error:'Please check your request.',fields:validated.fields},{status:422});
  const receipt=await submitProductionRequest({slug,input,idempotencyKey:key,capabilityHash:unusedCapabilityHash(config.fingerprintSecret,slug,key),challengeToken:request.headers.get('x-turnstile-token')??'',trustedClientIdentity:identity},{persistence:createSchedulingPersistence(client,async()=>business),abuseProviders:config.providers});
  return Response.json({request:{reference:receipt.reference,status:receipt.status,submittedAt:receipt.submittedAt},message:'Request received. Appointment not confirmed. The business will contact you. No payment collected.'},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof Error&&error.message==='Idempotency conflict')return Response.json({error:'This request key belongs to an earlier submission.'},{status:409});return closed();}
}
