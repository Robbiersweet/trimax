import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {maintenanceQrContext,maintenanceQrRuntime,maintenanceQrBusiness,maintenanceQrOrigins,maintenanceQrLab} from '../../../lib/maintenanceQr';
import {readBoundedJson} from '../../../lib/publicScheduling/httpBody';
import {productionConfig,productionBusiness,restrictedRpc,unusedCapabilityHash} from '../../../lib/publicScheduling/productionRuntime';
import {enforceProductionAbuse} from '../../../lib/publicScheduling/abuseProtection';
import {turnstileProvider,trustedVercelIdentity} from '../../../lib/publicScheduling/providers';
import {validateRequest} from '../../../lib/publicScheduling/domain';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function cors(request:Request,response:Response){const origin=request.headers.get('origin');try{if(origin&&maintenanceQrOrigins().has(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');}}catch{}return response;}
export async function OPTIONS(request:Request){let allowed=false;try{allowed=maintenanceQrOrigins().has(request.headers.get('origin')??'');}catch{}return cors(request,new Response(null,{status:allowed?204:403,headers:{'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Idempotency-Key, X-Turnstile-Token','Cache-Control':'no-store'}}));}
export async function GET(_request:Request,context:Context){
 try{const qr=await maintenanceQrContext((await context.params).id);if(!qr)return reply({error:'Label unavailable'},404);const business=await maintenanceQrBusiness(qr);return reply({...qr,business:{slug:business.slug,displayName:business.displayName,rules:business.rules,requestTypes:business.requestTypes.map(({id,publicLabel,active,displayOrder})=>({id,publicLabel,active,displayOrder}))},siteKey:maintenanceQrLab()?null:process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY});}catch{return reply({error:'QR intake unavailable'},503);}
}
async function submit(request:Request,context:Context){
 try{
  const qr=await maintenanceQrContext((await context.params).id);if(!qr)return reply({error:'Label unavailable'},404);
  const key=request.headers.get('idempotency-key')??'';if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))return reply({error:'Invalid request key'},400);
  const body=await readBoundedJson(request,16384) as Record<string,unknown>;
  const managerToken=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(managerToken){
   if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin denied'},403);
   if(Object.keys(body).some(k=>!['assignmentId','payload'].includes(k))||typeof body.assignmentId!=='string'||!body.payload||typeof body.payload!=='object')return reply({error:'Invalid manager request'},400);
   const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${managerToken}`}}});
   const {data:{user},error:authError}=await db.auth.getUser(managerToken);if(authError||!user)return reply({error:'Sign in required'},401);
   const {data,error}=await db.rpc('trimax_submit_manager_maintenance_qr',{p_label_id:qr.id,p_assignment_id:body.assignmentId,p_key:key,p_payload:body.payload});
   return error?reply({error:'Check your property assignment and request details'},403):reply(data,201);
  }
  const origin=request.headers.get('origin')??'';if(!maintenanceQrOrigins().has(origin))return reply({error:'Origin denied'},403);
  const lab=maintenanceQrLab(),config=lab?null:productionConfig();
  const business=config?await productionBusiness(qr.slug,restrictedRpc(config)):await maintenanceQrBusiness(qr);if(!business||business.businessId!==qr.businessId)return reply({error:'Service unavailable'},404);
  const validated=validateRequest({...body,address:qr.address+', Unit '+qr.unit},business);if(!validated.ok)return reply({error:'Check the request details',fields:validated.fields},422);
  if(config){const abuse=await enforceProductionAbuse({businessSlug:qr.slug,challengeToken:request.headers.get('x-turnstile-token')??'',trustedClientIdentity:trustedVercelIdentity(request)},{...config.providers,challenge:turnstileProvider(process.env.TURNSTILE_SECRET_KEY!,new URL(origin).hostname)});
  if(!abuse.allowed)return reply({error:'Security check failed. Please retry.'},429);}
  const {data,error}=await maintenanceQrRuntime().rpc('trimax_submit_maintenance_qr',{p_label_id:qr.id,p_payload:validated.value,p_key:key,p_capability_hash:unusedCapabilityHash(config?.fingerprintSecret??process.env.SCHEDULING_FINGERPRINT_SECRET!,qr.slug,createHash('sha256').update(qr.id+key).digest('hex'))});
  return error?reply({error:'Unable to save. Keep this form open and retry.'},409):reply({request:data,message:'Request received. Appointment not confirmed.'},201);
 }catch{return reply({error:'QR intake unavailable. Your request has not been confirmed.'},503);}
}

export async function POST(request:Request,context:Context){return cors(request,await submit(request,context));}
