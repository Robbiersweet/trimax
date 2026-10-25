import {createHash,randomBytes} from 'node:crypto';
import {communicationsDb} from '@/app/lib/communications/server';
import {escapeDocument as escape} from '@/app/lib/communications/customerDocument';
import {calendarDataUri} from '@/app/lib/calendar';
import {emailMode} from '@/app/lib/publicScheduling/emailProvider';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function hash(token:string){if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error();return createHash('sha256').update(token).digest('hex');}
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
 const {token}=await params,db=communicationsDb();
 const {data:l}=await db.from('request_email_links').select('business_id,outbox_id,recipient').eq('token_hash',hash(token)).gt('expires_at',new Date().toISOString()).is('revoked_at',null).maybeSingle();if(!l)throw Error();
 const {data:o}=await db.from('public_scheduling_outbox').select('request_id,event_type,recipient').eq('id',l.outbox_id).eq('business_id',l.business_id).eq('channel','email').eq('audience','customer').maybeSingle();if(!o||o.recipient.toLowerCase()!==l.recipient.toLowerCase())throw Error();
 const {data:r}=await db.from('public_service_requests').select('id,public_reference,email,contact_consent_at,status,queue_item_id').eq('id',o.request_id).eq('business_id',l.business_id).maybeSingle();if(!r||!r.contact_consent_at||r.email.toLowerCase()!==l.recipient.toLowerCase())throw Error();
 const {data:s}=await db.from('public_scheduling_settings').select('display_name,time_zone').eq('business_id',l.business_id).maybeSingle();
 let content=`<p>Request ${escape(r.public_reference)}</p><p>Status: ${escape(r.status.replaceAll('_',' '))}</p>`;
 if(r.queue_item_id){
 const {data:q}=await db.from('queue_items').select('id,appointment_start,appointment_end,appointment_status,appointment_previous_start,appointment_previous_end,appointment_revision,appointment_changed_at').eq('id',r.queue_item_id).eq('business_id',l.business_id).eq('source_request_id',r.id).maybeSingle();if(!q)throw Error();
 const cancelled=q.appointment_status==='cancelled',start=cancelled?q.appointment_previous_start:q.appointment_start,end=cancelled?q.appointment_previous_end:q.appointment_end;
 if(new URL(request.url).searchParams.get('format')==='ics'){const uri=calendarDataUri({id:q.id,title:s?.display_name||'Service appointment',date:start?.slice(0,10)||null,start,end,revision:q.appointment_revision,changedAt:q.appointment_changed_at,cancelled});if(!uri)throw Error();return new Response(decodeURIComponent(uri.slice(uri.indexOf(',')+1)),{headers:{...headers,'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="service-appointment.ics"'}});}
 content+=`<h2>${cancelled?'Appointment cancelled':start?'Confirmed appointment':'Scheduling pending'}</h2>${start?`<p>${escape(new Date(start).toLocaleString('en-US',{timeZone:s?.time_zone||'America/Los_Angeles',dateStyle:'full',timeStyle:'short'}))}</p><p><a href="?format=ics">Add or update your calendar (.ics)</a></p>`:''}`;
 }
 if(o.event_type==='needs_information'&&r.status==='needs_information')content+=`<h2>Reply with additional information</h2><form method="post"><input type="hidden" name="key" value="${randomBytes(32).toString('hex')}"><label for="reply">Your reply</label><p><textarea id="reply" name="body" rows="7" maxlength="1600" required></textarea></p><button type="submit">Send reply</button></form>`;
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private service request</title><style>body{font:18px system-ui;max-width:42rem;margin:3rem auto;padding:1rem}textarea{width:100%}</style><h1>${escape(s?.display_name||'Service request')}</h1>${content}</html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
 }catch{return new Response('This private link is unavailable or expired. Contact the business for assistance.',{status:404,headers});}
}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
 if(process.env.VERCEL_ENV!=='production'&&emailMode(process.env)!=='test')throw Error();
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw Error();
 const {token}=await params,tokenHash=hash(token),reader=request.body?.getReader();if(!reader)throw Error();let bytes=0,text='';const decoder=new TextDecoder();
 while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>12000){await reader.cancel();throw Error();}text+=decoder.decode(p.value,{stream:true});}
 const form=new URLSearchParams(text+decoder.decode()),key=form.get('key'),body=form.get('body');if(!key||!/^[a-f0-9]{64}$/.test(key)||!body||body.trim().length>1600)throw Error();
 const {error}=await communicationsDb().rpc('trimax_request_email_reply',{p_hash:tokenHash,p_key:key,p_body:body});if(error)throw Error();
 return new Response('Your reply was received for review. Your appointment and request status have not changed.',{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 }catch{return new Response('Reply unavailable. The request or link may have changed, or the reply limit was reached. Contact the business for assistance.',{status:400,headers});}
}
