import {communicationsOwner,isolatedSmsTestDatabase} from '@/app/lib/communications/server';
import {readBoundedJson} from '@/app/lib/publicScheduling/httpBody';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
 const {db,businessId}=await communicationsOwner(request);
 const [messages,audit,settings,alerts,usage]=await Promise.all([
 db.from('communication_messages').select('id,request_id,client_id,direction,event_type,recipient,status,body,attempts,simulated,error_code,estimated_segments,estimated_cost,created_at').eq('business_id',businessId).order('created_at',{ascending:false}).limit(100),
 db.from('communication_audit').select('id,message_id,event_type,details,created_at').eq('business_id',businessId).order('created_at',{ascending:false}).limit(100),
 db.from('communication_settings').select('enabled,provider,display_name,time_zone,quiet_start,quiet_end,monthly_limit,milestones').eq('business_id',businessId).maybeSingle(),
 db.from('communication_owner_alerts').select('id,message_id,kind,created_at').eq('business_id',businessId).order('created_at',{ascending:false}).limit(30),db.rpc('trimax_sms_usage',{p_business:businessId})]);
 if(messages.error||audit.error||settings.error||alerts.error||usage.error)throw Error();
 return Response.json({messages:messages.data,audit:audit.data,settings:settings.data,alerts:alerts.data,usage:usage.data},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Communications unavailable. Owner/admin access and the communications migration are required.'},{status:403});}
}
export async function PATCH(request:Request){
 if(process.env.VERCEL_ENV!=='production'&&!isolatedSmsTestDatabase())return Response.json({error:'Preview changes require isolated test data.'},{status:403});
 try{const {db,businessId}=await communicationsOwner(request),input=await readBoundedJson(request,3000) as Record<string,unknown>;
 const {error}=await db.rpc('trimax_update_sms_preferences',{p_business:businessId,p_start:input.quietStart,p_end:input.quietEnd,p_zone:input.timeZone,p_limit:input.monthlyLimit,p_milestones:input.milestones});if(error)throw Error();
 return Response.json({saved:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Preferences not saved. Verify owner access, quiet hours, time zone and message limit.'},{status:400});}
}
