import {customerEmail,type Delivery} from './delivery.ts';
import {DeliveryFailure} from './dispatch.ts';
type Env=Record<string,string|undefined>;
export function emailMode(env:Env):'disabled'|'test'|'resend'{
 if(env.VERCEL_ENV!=='production'){
  if(env.SERVICE_REQUEST_EMAIL_TEST_MODE!=='enabled'||!env.EMAIL_TEST_SUPABASE_URL||env.EMAIL_TEST_SUPABASE_URL!==env.NEXT_PUBLIC_SUPABASE_URL)return 'disabled';
  try{const u=new URL(env.EMAIL_TEST_SUPABASE_URL);if(u.hostname.startsWith('gqknefosisnsjuzmhvts.'))return 'disabled';}catch{return 'disabled';}
  return 'test';
 }
 if(env.SERVICE_REQUEST_DELIVERY_ENABLED!=='enabled'||env.SERVICE_REQUEST_EMAIL_ENABLED!=='enabled'||!env.RESEND_API_KEY||!env.SERVICE_REQUEST_EMAIL_FROM||!env.SERVICE_REQUEST_EMAIL_BUSINESS_ID||!Number.isFinite(Date.parse(env.SERVICE_REQUEST_EMAIL_ACTIVATED_AT||'')))return 'disabled';
 return 'resend';
}
export type EmailCurrent={business_id:string;email:string;contact_consent_at:string|null;status:string;queue_item_id:string|null};
export type EmailAppointment={appointment_start:string|null;appointment_end:string|null;completed_date:string|null};
export function validateEmailCurrent(row:Delivery,current:EmailCurrent|null,appointment:EmailAppointment|null,env:Env){
 if(!current||current.business_id!==row.business_id||current.email.toLowerCase()!==row.recipient.toLowerCase()||!current.contact_consent_at)throw new DeliveryFailure('email_recipient_changed');
 if(emailMode(env)==='resend'&&(!row.created_at||Date.parse(row.created_at)<Date.parse(env.SERVICE_REQUEST_EMAIL_ACTIVATED_AT!)))throw new DeliveryFailure('email_before_activation');
 const status=current.status;
 if((row.event_type==='request_received'&&!['pending_confirmation','reviewing','needs_information'].includes(status))||(row.event_type==='approved'&&(!['approved','converted'].includes(status)||appointment?.appointment_start))||(row.event_type==='declined'&&status!=='rejected')||(row.event_type==='appointment_cancelled'&&appointment?.appointment_start))throw new DeliveryFailure('email_obsolete');
 if(['appointment_scheduled','appointment_rescheduled','reminder_24h','reminder_1h'].includes(row.event_type)&&(!appointment||appointment.completed_date||Date.parse(appointment.appointment_start||'')!==Date.parse(row.parameters.start||'')||Date.parse(appointment.appointment_end||'')!==Date.parse(row.parameters.end||'')||Date.parse(appointment.appointment_start||'')<=Date.now()))throw new DeliveryFailure('email_obsolete');
}
export async function sendCustomerEmail(row:Delivery,env:Env=process.env,transport:typeof fetch=fetch){
 const mode=emailMode(env);if(mode==='disabled')throw new DeliveryFailure('email_disabled');
 const email=customerEmail(row);
 if(mode==='test')return {id:`test-email-${row.id}`,simulated:true,...email};
 if(row.business_id!==env.SERVICE_REQUEST_EMAIL_BUSINESS_ID)throw new DeliveryFailure('email_workspace_mismatch');
 const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':row.idempotency_key},body:JSON.stringify({from:env.SERVICE_REQUEST_EMAIL_FROM,to:[row.recipient],...email}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new DeliveryFailure(response.status===429?'email_rate_limited':'email_provider_rejected');
 const result=await response.json();if(typeof result.id!=='string')throw new DeliveryFailure('email_provider_invalid_response');return {id:result.id,simulated:false,...email};
}
