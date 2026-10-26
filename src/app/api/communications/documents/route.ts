import {communicationsOwner} from '@/app/lib/communications/server';
import {readBoundedJson} from '@/app/lib/publicScheduling/httpBody';
export const runtime='nodejs';
export async function POST(request:Request){
 const preview=process.env.VERCEL_ENV!=='production';
 if(preview?(process.env.SMS_TEST_MODE!=='enabled'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://yzyfmvoswucyauogueca.supabase.co'||process.env.SMS_TEST_SUPABASE_URL!==process.env.NEXT_PUBLIC_SUPABASE_URL):process.env.SERVICE_REQUEST_SMS_ENABLED!=='enabled')return Response.json({error:'Document texts are disabled. SMS activation is separate from email.'},{status:409});
 try{
 const {db,businessId}=await communicationsOwner(request),body=await readBoundedJson(request,1500) as Record<string,unknown>;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!['estimate','invoice'].includes(String(body.kind))||typeof body.documentId!=='string'||!uuid.test(body.documentId)||typeof body.key!=='string'||!uuid.test(body.key))return Response.json({error:'Invalid document text request.'},{status:400});
 const {data,error}=await db.rpc('trimax_queue_document_sms',{p_business:businessId,p_kind:body.kind,p_document:body.documentId,p_key:body.key});
 if(error||!data)return Response.json({error:'Text not queued. Check issued document status, current client SMS consent and workspace settings.'},{status:409});
 return Response.json({queued:true,messageId:data,simulated:preview},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Text not queued. Owner or administrator access is required.'},{status:403});}
}
