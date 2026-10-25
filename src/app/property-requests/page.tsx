"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import RequestPhotos from "../book/RequestPhotos";
import {createPhotoCapability} from "../lib/requestPhotos/clientCapability";
import { supabase } from "../lib/supabase";

type Assignment = { id: string; businessId: string; property: string; directQueue: boolean; windows?: {id:string;label:string}[]; types: { id: string; label: string }[] };
type RequestSummary = { id: string; reference: string; status: string; property: string; description: string; preferredDate: string | null; timeWindowId?:string|null; flexibility?:string; urgency?:string; queueItemId: string | null; appointmentStart: string | null; appointmentEnd: string | null };

export default function PropertyRequestsPage() {
 const [assignments,setAssignments]=useState<Assignment[]>([]),[requests,setRequests]=useState<RequestSummary[]>([]);
 const [assignmentId,setAssignmentId]=useState(""),[typeId,setTypeId]=useState(""),[unit,setUnit]=useState(""),[description,setDescription]=useState(""),[date,setDate]=useState(""),[direct,setDirect]=useState(false);
 const [urgency,setUrgency]=useState("routine"),[flexibility,setFlexibility]=useState("flexible"),[timeWindowId,setTimeWindowId]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const pending=useRef<{key:string;payload:string}|null>(null),sending=useRef(false);
 const [photosEnabled,setPhotosEnabled]=useState(false),[photoReceipts,setPhotoReceipts]=useState<{id:string;secret:string}[]>([]);
 const photoCapability=useRef<Awaited<ReturnType<typeof createPhotoCapability>>|null>(null);
 useEffect(()=>{let active=true;void fetch("/api/property-request-photos",{cache:"no-store"}).then(r=>r.ok?r.json():{enabled:false}).then(data=>{if(active)setPhotosEnabled(data.enabled===true);}).catch(()=>{});return()=>{active=false;};},[]);
 async function sessionToken(){const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error("Sign in");return session.access_token;}
 const assignment=assignments.find(a=>a.id===assignmentId);
 async function refresh(){
  const {data,error:failure}=await supabase.rpc("trimax_property_request_context");
  if(failure){setError("Property requests are not available. Please sign in or contact R&L to confirm your property access.");return;}
  const context=data as {assignments:Assignment[];requests:RequestSummary[]};
  setAssignments(context.assignments);setRequests(context.requests);
 }
 useEffect(()=>{let active=true;void Promise.resolve(supabase.rpc("trimax_property_request_context")).then(({data,error:failure})=>{
  if(!active)return;
  if(failure)setError("Property requests are not available. Please sign in or contact R&L to confirm your property access.");
  else {const context=data as {assignments:Assignment[];requests:RequestSummary[]};setAssignments(context.assignments);setRequests(context.requests);}
  setLoading(false);
 }).catch(()=>{if(active){setError("Property requests are not available. Please sign in or contact R&L to confirm your property access.");setLoading(false);}});return()=>{active=false;};},[]);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(sending.current||!assignment)return;
  sending.current=true;setBusy(true);setError("");setSuccess("");
  const payload:{requestTypeId:string;unit:string;description:string;preferredDate:string;directQueue:boolean;urgency:string;flexibility:string;timeWindowId:string;uploadCapabilityHash?:string}={requestTypeId:typeId,unit:unit.trim(),description:description.trim(),preferredDate:date,urgency,flexibility,timeWindowId,directQueue:direct&&assignment.directQueue};
  try{if(photosEnabled){photoCapability.current??=await createPhotoCapability();payload.uploadCapabilityHash=photoCapability.current.uploadCapabilityHash;}}catch{sending.current=false;setBusy(false);setError("Photo preparation failed. Please retry.");return;}
  const signature=JSON.stringify([assignment.id,payload]);
  if(!pending.current||pending.current.payload!==signature)pending.current={key:crypto.randomUUID(),payload:signature};
  try{
   const {data:{session}}=await supabase.auth.getSession();
   const response=await fetch("/api/property-requests",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token??""}`},body:JSON.stringify({assignmentId:assignment.id,key:pending.current.key,payload})});
   const data=await response.json();
   if(!response.ok)throw Error((data.error??"Unable to submit.")+" An unchanged retry will not create a duplicate.");
   setSuccess(data.queueItemId?"Added to the Work Queue. Scheduling will be confirmed separately.":"Request received. R&L will review the work and confirm the next steps.");
   if(photosEnabled&&photoCapability.current&&typeof data.id==="string"){const secret=photoCapability.current.secret;setPhotoReceipts(old=>old.some(p=>p.id===data.id)?old:[...old,{id:data.id,secret}]);}
   photoCapability.current=null;pending.current=null;setDescription("");setUnit("");setDate("");setDirect(false);setUrgency("routine");setFlexibility("flexible");setTimeWindowId("");await refresh();
  }catch(failure){setError(failure instanceof Error?failure.message:"Unable to submit. Please retry.");}
  finally{sending.current=false;setBusy(false);}
 }
 return <main className="mx-auto max-w-3xl space-y-6 p-5 sm:p-8">
  <header><p className="text-sm font-semibold uppercase tracking-widest">R&amp;L Creations</p><h1 className="text-3xl font-bold">Property work requests</h1><p className="mt-2">Send unit details and preferred timing. Your request does not book an appointment or dispatch work.</p></header>
  {loading&&<p role="status">Loading your properties…</p>}
  {error&&<p role="alert" className="rounded border border-red-500 p-4">{error}</p>}
  {success&&<p role="status" className="rounded border border-green-600 p-4">{success}</p>}
  {!loading&&!assignments.length&&<p>No assigned properties found. <Link className="underline" href="/login?next=%2Fproperty-requests">Sign in</Link> with your assigned account, or contact R&amp;L.</p>}
  {!!assignments.length&&<form onSubmit={submit} className="space-y-4 rounded-xl border p-5">
   <label className="block">Property<select required disabled={busy} className="mt-1 block w-full rounded border bg-white p-3 text-black" value={assignmentId} onChange={e=>{setAssignmentId(e.target.value);setTypeId("");setDirect(false);setTimeWindowId("");}}><option value="">Choose your property</option>{assignments.map(a=><option key={a.id} value={a.id}>{a.property}</option>)}</select></label>
   <label className="block">Service<select required disabled={busy||!assignment} className="mt-1 block w-full rounded border bg-white p-3 text-black" value={typeId} onChange={e=>setTypeId(e.target.value)}><option value="">Choose a service</option>{assignment?.types.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
   <label className="block">Building / unit<input required maxLength={100} disabled={busy} value={unit} onChange={e=>setUnit(e.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-black"/></label>
   <label className="block">Work needed<textarea required maxLength={3000} rows={5} disabled={busy} value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-black"/></label>
   <label className="block">Preferred date (optional)<input type="date" required={flexibility==="fixed"} disabled={busy} value={date} onChange={e=>setDate(e.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-black"/></label>
   <label className="block">Preferred time window<select disabled={busy||!assignment} value={timeWindowId} onChange={e=>setTimeWindowId(e.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-black"><option value="">Any time window</option>{assignment?.windows?.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
   <label className="block">Timing flexibility<select disabled={busy} value={flexibility} onChange={e=>setFlexibility(e.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-black"><option value="flexible">Flexible</option><option value="preferred">Preferred date</option><option value="fixed">Specific date requested</option></select></label>
   <label className="block">Urgency<select disabled={busy} value={urgency} onChange={e=>setUrgency(e.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-black"><option value="routine">Routine</option><option value="soon">Soon</option><option value="time_sensitive">Time-sensitive</option><option value="urgent">Urgent</option></select></label>
   <p className="text-sm">This form is not monitored for emergencies. For immediate danger, contact emergency services. Timing and urgency are requests, not confirmed appointments or dispatch.</p>
   {assignment?.directQueue&&<label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={direct} disabled={busy} onChange={e=>setDirect(e.target.checked)}/><span>Add directly to the Work Queue using my property permission. An appointment still requires scheduling approval.</span></label>}
   <button disabled={busy||!assignment} className="rounded-lg bg-orange-500 px-5 py-3 font-bold text-black disabled:opacity-50">{busy?"Submitting…":direct?"Add to Work Queue":"Send for review"}</button>
  </form>}
  {photoReceipts.map(p=><RequestPhotos key={p.id} requestId={p.id} secret={p.secret} endpoint="/api/property-request-photos" getSessionToken={sessionToken}/>)}
  <section aria-label="Your requests"><h2 className="text-xl font-bold">Your requests</h2><ul className="mt-3 space-y-3">{requests.map(r=><li key={r.id} className="rounded-lg border p-4"><p className="font-semibold">{r.property} · {r.status.replaceAll("_"," ")}</p><p className="whitespace-pre-wrap">{r.description}</p><p className="mt-2 text-sm">Requested: {r.preferredDate||"No date preference"} · {assignments.find(a=>a.property===r.property)?.windows?.find(w=>w.id===r.timeWindowId)?.label||r.timeWindowId||"Any time window"} · {r.flexibility||"preferred"} timing · {(r.urgency||"routine").replaceAll("_"," ")}</p><p className="mt-2 text-sm">{r.appointmentStart?`Scheduled: ${new Date(r.appointmentStart).toLocaleString()}`:r.queueItemId?"In Work Queue · awaiting scheduling":"Awaiting review"}</p><p className="break-all text-xs">{r.reference}</p></li>)}</ul></section>
 </main>;
}
