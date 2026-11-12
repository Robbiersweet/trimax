import {createClient} from '@supabase/supabase-js';
import webpush from 'web-push';
import {timingSafeEqual} from 'node:crypto';
import {deliveryChannels,type Delivery} from '@/app/lib/publicScheduling/delivery';
import {dispatchDeliveries} from '@/app/lib/publicScheduling/dispatch';
import {customerAppointment,customerRequest} from '@/app/lib/publicScheduling/customerAppointment';
import {appointmentCalendar,calendarLink,renderSchedulingEmail} from '@/app/lib/publicScheduling/customerTransactionalEmail';
import {syntheticRequestIds} from '@/app/lib/verifiedSyntheticRequests';
export const runtime='nodejs';
export const maxDuration=60;
function deliverySecret(request: Request) {
 const expected=process.env.CRON_SECRET,provided=request.headers.get('authorization')??'';
 return expected && Buffer.byteLength(provided)===Buffer.byteLength(`Bearer ${expected}`) && timingSafeEqual(Buffer.from(provided),Buffer.from(`Bearer ${expected}`)) ? expected : null;
}

async function sendSchedulingEmail(recipient: string, idempotencyKey: string, email: ReturnType<typeof renderSchedulingEmail>, attachment?: string) {
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
  body:JSON.stringify({
   from:process.env.SERVICE_REQUEST_EMAIL_FROM,to:[recipient],...email,
   ...(attachment ? {attachments:[{filename:'test-appointment.ics',content:Buffer.from(attachment).toString('base64')}]} : {}),
  }),
  signal:AbortSignal.timeout(10000),
 });
 if(!response.ok)throw Error('email_provider_rejected');
 const result=await response.json();
 if(typeof result.id!=='string')throw Error('email_provider_invalid_response');
 return result.id as string;
}

export async function GET(request: Request) {
 const expected=deliverySecret(request);
 if(!expected)return Response.json({error:'Unauthorized'},{status:401});
 const channels=deliveryChannels(process.env);
 if(!channels.length)return Response.json({state:'disabled',sent:0});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return Response.json({error:'Delivery configuration unavailable'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const counts=await dispatchDeliveries(channels,{
  async claim(channel){const {data,error}=channel==='email' ? await db.rpc('trimax_claim_customer_schedule_email',{p_business:process.env.SERVICE_REQUEST_EMAIL_BUSINESS_ID,p_test_ids:syntheticRequestIds(process.env.SERVICE_REQUEST_EMAIL_BUSINESS_ID!)}) : await db.rpc('trimax_claim_request_delivery',{p_channel:channel});if(error||!Array.isArray(data))throw Error('claim_failed');return data as Delivery[];},
  async send(row){
    if(row.channel==='push'){
     const {data:sub,error:subError}=await db.from('push_subscriptions').select('id,business_id,user_id,endpoint,p256dh,auth,status').eq('id',row.recipient).eq('business_id',row.business_id).eq('status','active').maybeSingle();
     if(subError||!sub?.user_id)throw Error('subscription_unavailable');
     const {data:members,error:memberError}=await db.from('business_users').select('role').eq('business_id',row.business_id).eq('user_id',sub.user_id).in('role',['owner','admin']);
     if(memberError||!members?.length)throw Error('recipient_no_longer_owner');
     webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:robbie@rnlcreations.com',process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);
     await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:'New service request',body:`${row.parameters.customer} · ${row.parameters.category} · Requested: ${row.parameters.requestedDate}`,tag:`service-request-${row.request_id}`,url:`/admin/service-requests?business=${encodeURIComponent(row.parameters.slug||'')}&request=${row.request_id}`}),{TTL:3600,timeout:10000});
     return 'push-service-accepted';
    }else{
     if(row.business_id!==process.env.SERVICE_REQUEST_EMAIL_BUSINESS_ID)throw Error('sender_workspace_not_configured');
     const customer=await customerRequest(db,row.business_id,row.request_id);
     if(!customer||customer.row.email!==row.recipient||!row.consent_reference)throw Error('customer_recipient_unavailable');
     if(row.event_type!=='request_received'&&row.event_type!=='appointment_scheduled')throw Error('unsupported_email_event');
     const appointment=row.event_type==='appointment_scheduled' ? await customerAppointment(db,row.business_id,customer) : null;
     if(row.event_type==='appointment_scheduled'&&(!appointment||Date.parse(appointment.start)!==Date.parse(row.parameters.start??'')||Date.parse(appointment.end)!==Date.parse(row.parameters.end??'')))throw Error('appointment_changed');
     const link=appointment ? calendarLink(row.request_id,appointment,expected) : undefined;
     const email=renderSchedulingEmail(customer.row.public_reference,customer.service,appointment??undefined,link);
     const key=appointment ? `schedule-confirmed:${row.request_id}:${Date.parse(appointment.start)}:${Date.parse(appointment.end)}` : `schedule-received:${row.request_id}`;
     return sendSchedulingEmail(row.recipient,key,email);
    }
  },
  async finish(row,reference,errorCode){const {data,error}=await db.rpc('trimax_finish_request_delivery',{p_id:row.id,p_lease:row.lease_token,p_reference:reference,p_error:errorCode});if(error)throw Error('finish_failed');return data===true;}
 });
 return Response.json(counts,{status:counts.failed?207:200,headers:{'Cache-Control':'no-store'}});
}

/** A time-limited provider check, separate from requests and their outbox. */
export async function POST(request: Request) {
 if(!deliverySecret(request))return Response.json({error:'Unauthorized'},{status:401});
 const destination=process.env.SERVICE_REQUEST_EMAIL_TEST_TO;
 const until=Date.parse(process.env.SERVICE_REQUEST_EMAIL_TEST_UNTIL??'');
 if(process.env.VERCEL_ENV!=='production'||!destination||!(until>Date.now())||
   !process.env.RESEND_API_KEY||!process.env.SERVICE_REQUEST_EMAIL_FROM)return new Response(null,{status:404});
 const url=new URL(request.url);
 const kind=url.searchParams.get('kind');
 if(kind!=='receipt'&&kind!=='confirmation')return new Response(null,{status:400});
 const appointment=kind==='confirmation' ? {
  start:'2030-01-07T17:00:00Z',end:'2030-01-07T18:00:00Z',zone:'America/Los_Angeles',
  service:'Sample maintenance visit',location:'Sample test location',
 } : undefined;
 const email=renderSchedulingEmail('DELIVERY-TEST','Sample maintenance visit',appointment);
 email.subject='[TEST] '+email.subject;
 email.text='Controlled delivery test. No appointment was booked.\n\n'+email.text;
 email.html='<p>Controlled delivery test. No appointment was booked.</p>'+email.html;
 try {
  const id=await sendSchedulingEmail(destination,`schedule-provider-test:${until}:${kind}`,email,
   appointment ? appointmentCalendar('calendar-delivery-test',appointment) : undefined);
  let status = 'provider_accepted';
  try {
   const receipt=await fetch('https://api.resend.com/emails/'+encodeURIComponent(id),{
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`},cache:'no-store',signal:AbortSignal.timeout(5000),
   });
   if(receipt.ok){
    const report=await receipt.json();
    if(Array.isArray(report.to)&&report.to.length===1&&report.to[0]===destination&&report.subject===email.subject){
     const events=['delivered','opened','clicked','bounced','failed','suppressed','delivery_delayed'];
     if(events.includes(report.last_event))status=report.last_event;
    }
   }
  } catch { /* Acceptance is still recorded if provider status is unavailable. */ }
  return Response.json({id,status},{headers:{'Cache-Control':'no-store'}});
 } catch {
  return Response.json({status:'provider_rejected'},{status:502,headers:{'Cache-Control':'no-store'}});
 }
}