import {createClient} from '@supabase/supabase-js';
import {readBoundedJson} from '../../lib/publicScheduling/httpBody';
import {maintenanceQrRuntime,maintenanceQrSvg,maintenanceQrUrl} from '../../lib/maintenanceQr';
export const runtime='nodejs';
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function manage(request:Request,create:boolean){
 try{
  maintenanceQrRuntime();
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)return response({error:'Sign in required'},401);
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)return response({error:'Sign in required'},401);
  const params=new URL(request.url).searchParams;
  const body=create?await readBoundedJson(request,4000) as Record<string,unknown>:{};
  if(Object.keys(body).some(k=>!['businessId','assignmentId','unit','address'].includes(k)))return response({error:'Invalid field'},400);
  const {data,error}=await db.rpc('trimax_manage_maintenance_qr',{p_business_id:create?body.businessId:params.get('business'),p_assignment_id:create?body.assignmentId:null,p_unit:create?body.unit:null,p_address:create?body.address:null});
  if(error)return response({error:'An owner or administrator must select an authorized property.'},403);
  const origin=process.env.VERCEL_ENV==='production'?'https://rnlcreations.com':process.env.MAINTENANCE_QR_LAB_WEBSITE_ORIGIN;
  if(!origin)throw Error('Lab website origin required');
  const labels=await Promise.all(data.labels.map(async(label:{id:string})=>({...label,url:maintenanceQrUrl(label.id,origin),svg:await maintenanceQrSvg(label.id,origin)})));
  return response({...data,labels});
 }catch{return response({error:'QR label management unavailable'},503);}
}
export const GET=(request:Request)=>manage(request,false);
export const POST=(request:Request)=>manage(request,true);
