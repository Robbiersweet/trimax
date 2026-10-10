import {isSchedulingPreview} from '@/app/lib/publicScheduling/reviewEnvironment';
import {validateRequest} from '@/app/lib/publicScheduling/domain';
import {devStoreDirectory,submitDevelopmentRequest} from '@/app/lib/publicScheduling/developmentStore';
import {resolvePublicBusiness} from '@/app/lib/publicScheduling/settings';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{slug:string}>}){
 const {slug}=await context.params,business=await resolvePublicBusiness(slug);
 if(!business?.enabled)return Response.json({error:'Business not available.'},{status:404});
 try{devStoreDirectory();}catch{return Response.json({error:'Online requests are not yet available. Please contact the business directly.'},{status:503});}
 const origin=request.headers.get('origin');
 const allowedOrigin=process.env.PUBLIC_SCHEDULING_DEV_ORIGIN || new URL(request.url).origin;
 if(origin&&origin!==allowedOrigin)return Response.json({error:'Origin not allowed.'},{status:403});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON required.'},{status:415});
 // Explicit development adapter only. Production stays closed until a real
 // shared rate-limit/challenge provider and scoped persistence adapter are wired.
 let raw:unknown;try{const reader=request.body?.getReader();if(!reader)throw Error();let bytes=0,text='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>16384){await reader.cancel();return Response.json({error:'Request too large.'},{status:413});}text+=decoder.decode(part.value,{stream:true});}raw=JSON.parse(text+decoder.decode());}catch{return Response.json({error:'Invalid request body.'},{status:400});}
 const validated=validateRequest(raw,business);if(!validated.ok)return Response.json({error:'Please check your request.',fields:validated.fields},{status:422});
 if(isSchedulingPreview()&&!validated.value.email.endsWith('@example.test'))return Response.json({error:'Review preview accepts synthetic @example.test contact details only.'},{status:422});
 const idempotency=request.headers.get('idempotency-key')||'';
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotency))return Response.json({error:'A valid request key is required.'},{status:400});
 try{const saved=await submitDevelopmentRequest(business,validated.value,idempotency);return Response.json({request:{reference:saved.reference,status:saved.status,submittedAt:saved.submittedAt},message:`Your request has been received. ${business.displayName} will confirm the requested time.`},{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){const message=error instanceof Error?error.message:'';if(message.startsWith('Idempotency'))return Response.json({error:'This request key belongs to an earlier submission.'},{status:409});return Response.json({error:'Your request could not be saved. Keep this form open and retry.'},{status:503});}
}
