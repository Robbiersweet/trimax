import {normalizeSmsPhone} from '@/app/lib/communications/consent';
import {createHash,randomBytes} from 'node:crypto';
import {communicationsDb,isolatedSmsTestDatabase} from '@/app/lib/communications/server';
import {calendarDataUri} from '@/app/lib/calendar';
export const runtime='nodejs';
function escape(value:unknown){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
 const {token}=await params;if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error();const db=communicationsDb();
 const {data:link}=await db.from('communication_links').select('business_id,message_id').eq('token_hash',createHash('sha256').update(token).digest('hex')).gt('expires_at',new Date().toISOString()).is('revoked_at',null).maybeSingle();if(!link)throw Error();
 const {data:message}=await db.from('communication_messages').select('business_id,queue_id,entity_type,entity_id,client_id,request_id,event_type,recipient').eq('id',link.message_id).eq('business_id',link.business_id).maybeSingle();if(!message)throw Error();
 const {data:settings}=await db.from('communication_settings').select('display_name,time_zone').eq('business_id',link.business_id).maybeSingle();
 let title='Service update',content='';
 if(message.request_id&&message.event_type==='needs_information'){
  const {data:r}=await db.from('public_service_requests').select('status,phone,public_reference').eq('id',message.request_id).eq('business_id',link.business_id).maybeSingle();
  if(!r||normalizeSmsPhone(r.phone)!==message.recipient)throw Error();
  title='Additional information';content=r.status==='needs_information'?`<p>Please provide additional information about request ${escape(r.public_reference)}. Your reply will be reviewed by the business.</p><form method="post"><input type="hidden" name="key" value="${randomBytes(32).toString('hex')}"><label for="reply">Your reply</label><p><textarea id="reply" name="body" required maxlength="1600" rows="7"></textarea></p><button type="submit">Send reply</button></form>`:'<p>This request is no longer awaiting additional information.</p>';
 }else if(message.queue_id){
  if(!message.request_id){const {data:currentClient,error}=await db.rpc('trimax_queue_sms_client',{p_business:link.business_id,p_queue:message.queue_id,p_phone:message.recipient});if(error||!message.client_id||currentClient!==message.client_id)throw Error();}
  const {data:q}=await db.from('queue_items').select('id,appointment_start,appointment_end,appointment_revision,appointment_status,appointment_previous_start,appointment_previous_end,appointment_changed_at').eq('id',message.queue_id).eq('business_id',link.business_id).maybeSingle();if(!q)throw Error();
  const cancelled=q.appointment_status==='cancelled';const start=cancelled?q.appointment_previous_start:q.appointment_start,end=cancelled?q.appointment_previous_end:q.appointment_end;
  if(new URL(request.url).searchParams.get('format')==='ics'){
   const uri=calendarDataUri({id:q.id,title:settings?.display_name||'Service appointment',date:start?.slice(0,10)||null,start,end,...{revision:q.appointment_revision,changedAt:q.appointment_changed_at,cancelled}});if(!uri)throw Error();
   return new Response(decodeURIComponent(uri.slice(uri.indexOf(',')+1)),{headers:{...headers,'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="service-appointment.ics"'}});
  }
  title=cancelled?'Appointment cancelled':start?'Confirmed appointment':'Scheduling pending';
  content=`<p>${start?escape(new Date(start).toLocaleString('en-US',{timeZone:settings?.time_zone||'America/Los_Angeles',dateStyle:'full',timeStyle:'short'})): 'No appointment is confirmed.'}</p>${start?'<p><a href="?format=ics">Add or update in Apple Calendar, Google Calendar or Outlook (.ics)</a></p>':''}`;
 }else if(message.entity_id&&message.client_id&&['invoice','estimate'].includes(message.entity_type)){
  const invoice=message.entity_type==='invoice';
  const {data:doc}=await db.from(invoice?'invoices':'estimates').select(invoice?'display_id,project_title,invoice_amount,amount_paid,status':'display_id,project_title,estimate_amount,status').eq('id',message.entity_id).eq('business_id',link.business_id).eq('client_id',message.client_id).maybeSingle();if(!doc)throw Error();
  const d=doc as unknown as Record<string,unknown>;
  title=`${invoice?'Invoice':'Estimate'} ${d.display_id||''}`;
  content=`<p>${escape(d.project_title)}</p><p>Status: ${escape(d.status)}</p><p>Total: ${escape(invoice?d.invoice_amount:d.estimate_amount)}</p>${invoice?`<p>Recorded payments: ${escape(d.amount_paid)}</p>`:''}<p>Your detailed document was sent by email. Contact the business if you need another copy.</p>`;
 }else throw Error();
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:18px system-ui;max-width:42rem;margin:3rem auto;padding:1rem;color:#173b42}a{color:#166c59}</style><h1>${escape(settings?.display_name||'Service update')}</h1><h2>${escape(title)}</h2>${content}</html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
 }catch{return new Response('This private link is unavailable or expired. Contact the business for assistance.',{status:404,headers});}
}


export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  if(process.env.VERCEL_ENV!=='production'&&!isolatedSmsTestDatabase())throw Error();
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw Error();
  const {token}=await params;if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error();
  const reader=request.body?.getReader();if(!reader)throw Error();let size=0,text='';const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>12000){await reader.cancel();throw Error();}text+=decoder.decode(part.value,{stream:true});}
  const form=new URLSearchParams(text+decoder.decode());const body=form.get('body'),key=form.get('key');
  if(!body||body.trim().length>1600||!key||!/^[a-f0-9]{64}$/.test(key))throw Error();
  const {error}=await communicationsDb().rpc('trimax_customer_link_reply',{p_hash:createHash('sha256').update(token).digest('hex'),p_key:key,p_body:body});if(error)throw Error();
  return new Response('Your reply was received. The business will review it. No appointment or request status has been changed.',{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 }catch{return new Response('Your reply could not be accepted. The link may be expired, the request may have changed, or the reply limit was reached. Contact the business for assistance.',{status:400,headers});}
}
