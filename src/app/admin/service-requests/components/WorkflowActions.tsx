"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {PublicServiceRequest} from '../../../lib/publicScheduling/domain';
import {appointmentInstant,type WorkflowAction,type WorkflowChange,type WorkflowContext} from '../../../lib/publicScheduling/workflow';
export type WorkflowApi={load:(id:string)=>Promise<WorkflowContext>;save:(change:WorkflowChange)=>Promise<{request:PublicServiceRequest;context:WorkflowContext}>};
export default function WorkflowActions({request,timeZone,api,onUpdated}:{request:PublicServiceRequest;timeZone:string;api:WorkflowApi;onUpdated:(r:PublicServiceRequest)=>void}){
 const [context,setContext]=useState<WorkflowContext|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[client,setClient]=useState(''),[date,setDate]=useState(request.preferredDate),[time,setTime]=useState(''),[minutes,setMinutes]=useState(60),[conflictReason,setConflictReason]=useState('');
 const [property,setProperty]=useState(''),[unit,setUnit]=useState(''),[propertyName,setPropertyName]=useState(''),[unitLabel,setUnitLabel]=useState('');
 const propertyRequired = !context?.linked;
 const apartmentRequest = request.requestTypeId === 'property' || Boolean(request.unit);
 const locationReady = !propertyRequired || (
  Boolean(property && (property !== 'new' || propertyName.trim().length >= 2)) &&
  Boolean(unit && (unit !== 'manual' || unitLabel.trim()))
 );
 useEffect(()=>{let active=true;api.load(request.id).then(c=>{if(active){setContext(c);setClient(c.linked?.request_client_id??'');
 const start=c.linked?.appointment_start;
 const end=c.linked?.appointment_end;
 if(start){
  const booked=new Date(start);
  setDate(new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(booked));
  setTime(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(booked));
  if(end)setMinutes(Math.round((Date.parse(end)-Date.parse(start))/60000));
 }
 const knownProperty=c.properties?.find(p=>p.name===request.propertyName);
 const knownUnit=c.units?.find(u=>u.property_id===knownProperty?.id&&u.unit_label===request.unit);
 if(knownProperty)setProperty(knownProperty.id);
 if(knownUnit)setUnit(knownUnit.id);}}).catch(()=>{if(active)setMessage('Workflow unavailable. Reload after the workflow deployment is ready.');});return()=>{active=false;};},[api,request.id,request.propertyName,request.unit,timeZone]);
 async function act(action:WorkflowAction){if(busy||!locationReady)return;setBusy(true);setMessage('');try{
  const scheduled=action==='schedule'||action==='approve_schedule';
  const result=await api.save({requestId:request.id,expectedRevision:request.revision??1,mutationId:crypto.randomUUID(),action,clientId:client||null,start:scheduled?appointmentInstant(date,time,timeZone):null,minutes:scheduled?minutes:null,propertyId:propertyRequired&&property!=='new'?property||null:null,
   propertyName:propertyRequired&&property==='new'?propertyName.trim():null,
   unitId:propertyRequired&&!['manual','none'].includes(unit)?unit||null:null,
   unitLabel:propertyRequired&&unit==='manual'?unitLabel.trim():null,
   noUnit:propertyRequired&&unit==='none',
   conflictReason:scheduled&&conflictReason.trim()?conflictReason.trim():null});
  setContext(result.context);onUpdated(result.request);
  setMessage(action==='cancel_appointment'?'Appointment cancelled. The Queue item remains open.':scheduled?'Appointment saved to the Queue calendar. Customer delivery is tracked separately.':'Client and Queue item linked. No appointment booked.');
 }catch(error){setMessage(error instanceof Error?error.message:'Action failed. Reload before retrying.');}finally{setBusy(false);}}
 const terminal=['rejected','cancelled'].includes(request.status);
 return <section className="owner-workflow" aria-label="Client, Queue and scheduling"><h3>Confirm appointment</h3>{message&&<p role="status">{message}</p>}{context&&!terminal&&<>
  {!context.linked&&<label>Client<select value={client} onChange={e=>setClient(e.target.value)}><option value="">Match email/phone, or create a new client</option>{context.clients.map(c=><option key={c.id} value={c.id}>{c.name} â€” {c.email||c.phone||'No contact details'}</option>)}</select><small>Matching preserves existing client details. Multiple matches require your selection.</small></label>}
  {propertyRequired && <div className="owner-fields">
   <label>Queue property<select value={property} onChange={e=>{setProperty(e.target.value);setUnit('');}}>
    <option value="">Select property</option>
    {(context.properties??[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    <option value="new">Add a property</option>
   </select></label>
   {property==='new'&&<label>Property name<input maxLength={120} value={propertyName} onChange={e=>setPropertyName(e.target.value)}/></label>}
   {property&&<label>Queue unit<select value={unit} onChange={e=>setUnit(e.target.value)}>
    <option value="">Select unit</option>
    {(context.units??[]).filter(u=>u.property_id===property).map(u=><option key={u.id} value={u.id}>{u.unit_label}</option>)}
    <option value="manual">Enter a unit label</option>
    {!apartmentRequest&&<option value="none">No unit at this property</option>}
   </select></label>}
   {unit==='manual'&&<label>Unit label<input maxLength={40} value={unitLabel} onChange={e=>setUnitLabel(e.target.value)}/></label>}
  </div>}
  {context.linked?<p><Link href={`/queue/${context.linked.id}?business=${encodeURIComponent(request.businessSlug)}`}>Open Queue item â†’</Link> Â· <Link href={`/calendar?business=${encodeURIComponent(request.businessSlug)}${date ? "&date="+encodeURIComponent(date) : ""}`}>Open calendar â†’</Link></p>:request.status==='approved'&&<button disabled={busy||!locationReady} className="owner-primary" onClick={()=>void act('convert')}>Match client & add to Queue</button>}

  {context.linked?.appointment_start&&<p>Booked: {new Date(context.linked.appointment_start).toLocaleString('en-US',{timeZone})} ({timeZone}) <button disabled={busy} onClick={()=>void act('cancel_appointment')}>Cancel appointment</button></p>}
  <div className="owner-fields owner-appointment"><p><strong>Customer requested:</strong> {request.preferredDate||'Flexible'} · {request.timeWindowId||'Any window'}</p><p className="owner-small">Choose the actual arrival time ({timeZone}). Confirmation updates Queue and Calendar and queues a customer email when eligible.</p><div className="owner-two"><label>Appointment date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Start time<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div><details><summary>Duration · {minutes} min</summary><label>Duration (minutes)<input type="number" min={15} max={720} step={15} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label></details><details open><summary>Check calendar conflicts</summary><p><Link href={`/calendar?business=${encodeURIComponent(request.businessSlug)}${date ? "&date="+encodeURIComponent(date) : ""}`}>View pending and confirmed commitments →</Link></p>{context.queue.filter(q=>q.scheduled_date===date&&q.id!==context.linked?.id).map(q=><p key={q.id}>{q.property} Â· {q.appointment_start?new Date(q.appointment_start).toLocaleTimeString('en-US',{timeZone}):'Date only â€” review before booking'}</p>)}<p className="owner-small">The server checks conflicts again when saving, including date-only work. To deliberately overlap work, enter a reason below.</p></details><details><summary>Override a conflict</summary><label>Conflict override reason<textarea maxLength={500} value={conflictReason} onChange={e=>setConflictReason(e.target.value)} placeholder="Why this overlap is workable"/><small>Only use after reviewing existing work. Your reason is saved in the appointment audit.</small></label></details><button disabled={busy||!locationReady||!date||!time||!Number.isInteger(minutes)||minutes<15||minutes>720} className="owner-primary" onClick={()=>void act(request.status==='approved'?'schedule':'approve_schedule')}>{busy?'Savingâ€¦':request.status==='approved'?'Save appointment':'Approve & save appointment'}</button></div>}
 </>}{context?.delivery&&<details><summary>Delivery history</summary><p className="owner-small">Queued email requires configured delivery. Accepted by a provider does not prove receipt on a device or in an inbox. SMS is not active.</p>{context.delivery.map((d,i)=><p key={i}>{d.channel} Â· {d.event_type.replaceAll("_"," ")} Â· {d.status==='delivered'?'Provider accepted':d.status} Â· {d.attempts} attempts{d.last_error_code?` Â· ${d.last_error_code}`:''}</p>)}</details>}{terminal&&<p>This request is closed.</p>}</section>;
}
