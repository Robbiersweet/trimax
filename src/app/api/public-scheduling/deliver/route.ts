import {createClient} from '@supabase/supabase-js';
import webpush from 'web-push';
import {timingSafeEqual} from 'node:crypto';
import {customerEmail,deliveryChannels,type Delivery} from '@/app/lib/publicScheduling/delivery';
import {dispatchDeliveries} from '@/app/lib/publicScheduling/dispatch';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET,provided=request.headers.get('authorization')??'';
 if(!expected||Buffer.byteLength(provided)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(provided),Buffer.from(`Bearer ${expected}`)))return Response.json({error:'Unauthorized'},{status:401});
 const channels=deliveryChannels(process.env);
 if(!channels.length)return Response.json({state:'disabled',sent:0});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return Response.json({error:'Delivery configuration unavailable'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const counts=await dispatchDeliveries(channels,{
  async claim(channel){const {data,error}=await db.rpc('trimax_claim_request_delivery',{p_channel:channel});if(error||!Array.isArray(data))throw Error('claim_failed');return data as Delivery[];},
  async send(row){
    if(row.channel==='push'){
     const {data:sub,error:subError}=await db.from('push_subscriptions').select('id,business_id,user_id,endpoint,p256dh,auth,status').eq('id',row.recipient).eq('business_id',row.business_id).eq('status','active').maybeSingle();
     if(subError||!sub?.user_id)throw Error('subscription_unavailable');
     const {data:members,error:memberError}=await db.from('business_users').select('role').eq('business_id',row.business_id).eq('user_id',sub.user_id).in('role',['owner','admin']);
     if(memberError||!members?.length)throw Error('recipient_no_longer_owner');
     webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:robbie@rnlcreations.com',process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);
     const communication=row.event_type==='customer_reply'||row.event_type==='delivery_issue';
     await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:communication?(row.event_type==='customer_reply'?'Customer replied':'Customer message needs attention'):'New service request',body:communication?'Open Communications to review the update.':`${row.parameters.customer} · ${row.parameters.category} · Requested: ${row.parameters.requestedDate}`,tag:communication?`communication-${row.id}`:`service-request-${row.request_id}`,url:communication?`/admin/communications?business=${encodeURIComponent(row.parameters.slug||'')}`:`/admin/service-requests?business=${encodeURIComponent(row.parameters.slug||'')}&request=${row.request_id}`}),{TTL:3600,timeout:10000});
     return 'push-service-accepted';
    }else{
     if(row.business_id!==process.env.SERVICE_REQUEST_EMAIL_BUSINESS_ID)throw Error('sender_workspace_not_configured');
     const email=customerEmail(row);
     const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':row.idempotency_key},body:JSON.stringify({from:process.env.SERVICE_REQUEST_EMAIL_FROM,to:[row.recipient],...email}),signal:AbortSignal.timeout(10000)});
     if(!response.ok)throw Error('email_provider_rejected');
     const result=await response.json();if(typeof result.id!=='string')throw Error('email_provider_invalid_response');return result.id;
    }
  },
  async finish(row,reference,errorCode){const {data,error}=await db.rpc('trimax_finish_request_delivery',{p_id:row.id,p_lease:row.lease_token,p_reference:reference,p_error:errorCode});if(error)throw Error('finish_failed');return data===true;}
 });
 return Response.json(counts,{status:counts.failed?207:200,headers:{'Cache-Control':'no-store'}});
}
