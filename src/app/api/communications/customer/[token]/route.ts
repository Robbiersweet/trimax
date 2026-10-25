import {createHash} from 'node:crypto';
import {communicationsDb} from '@/app/lib/communications/server';
import {calendarDataUri} from '@/app/lib/calendar';
export const runtime='nodejs';
function escape(value:unknown){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"};
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
 const {token}=await params;if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error();const db=communicationsDb();
 const {data:link}=await db.from('communication_links').select('business_id,message_id').eq('token_hash',createHash('sha256').update(token).digest('hex')).gt('expires_at',new Date().toISOString()).is('revoked_at',null).maybeSingle();if(!link)throw Error();
 const {data:message}=await db.from('communication_messages').select('business_id,queue_id,entity_type,entity_id,client_id,request_id,event_type').eq('id',link.message_id).eq('business_id',link.business_id).maybeSingle();if(!message)throw Error();
 const {data:settings}=await db.from('communication_settings').select('display_name,time_zone').eq('business_id',link.business_id).maybeSingle();
 let title='Service update',content='';
 if(message.queue_id){
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
