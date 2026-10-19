"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {loadWorkspaceAccess} from '../lib/workspaceAccess';

type Notice={id:string;request_id:string;customer_name:string;request_type:string;requested_date?:string|null;submitted_at:string;read_at:string|null};
/** Caller JWT + database RLS; no intake credential or admin authority in the browser. */
export default function SchedulingNotifications({business}:{business:string}){
 const [page,setPage]=useState(0);
 const [rows,setRows]=useState<Notice[]>([]),[count,setCount]=useState(0),[open,setOpen]=useState(false),[error,setError]=useState(''),[allowed,setAllowed]=useState(false);
 useEffect(()=>{
  let cancelled=false,inFlight=false,authEpoch=0;
  async function load(){
   if(inFlight||document.visibilityState==='hidden')return;
   inFlight=true;const epoch=authEpoch;
   try{
    const access=(await loadWorkspaceAccess()).find(w=>w.businessSlug===business&&['owner','admin'].includes(w.role));
    if(!access){if(!cancelled&&epoch===authEpoch){setAllowed(false);setRows([]);setCount(0);}return;}
    const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error();
    const [inbox,unread]=await Promise.all([
     supabase.from('scheduling_owner_notifications').select('id,request_id,customer_name,request_type,requested_date,submitted_at,read_at').eq('business_id',access.businessId).eq('recipient_id',user.id).order('submitted_at',{ascending:false}).range(page*50,page*50+49),
     supabase.from('scheduling_owner_notifications').select('id',{count:'exact',head:true}).eq('business_id',access.businessId).eq('recipient_id',user.id).is('read_at',null)
    ]);
    if(inbox.error||unread.error)throw Error();
    if(!cancelled&&epoch===authEpoch){setAllowed(true);setRows(inbox.data??[]);setCount(unread.count??0);setError('');}
   }catch{if(!cancelled&&epoch===authEpoch){setRows([]);setCount(0);setError('Notifications unavailable. Check Service Requests.');}}
   finally{inFlight=false;}
  }
  void load();const timer=window.setInterval(()=>void load(),30000);
  const wake=()=>void load();window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){authEpoch++;setRows([]);setCount(0);setAllowed(false);setOpen(false);}});
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);subscription.unsubscribe();};
 },[business,page]);
 async function mark(id:string){
  try{
  const {data,error:failure}=await supabase.from('scheduling_owner_notifications').update({read_at:new Date().toISOString()}).eq('id',id).is('read_at',null).select('id,read_at');
  if(failure){setError('Could not mark notification read. Try again.');return;}
  if(data?.length){setRows(old=>old.map(r=>r.id===id?{...r,read_at:data[0].read_at}:r));setCount(n=>Math.max(0,n-1));}
  }catch{setError('Could not mark notification read. Try again.');}
 }
 if(!allowed&&!error)return null;
 return <section className="relative my-3" aria-label="Scheduling notifications">
  <button className="rounded-xl border border-zinc-600 px-3 py-2 text-sm text-white" aria-expanded={open} onClick={()=>setOpen(!open)}>Notifications <span aria-live="polite">({count} unread)</span></button>
  {error&&<p role="status" className="text-sm text-amber-300">{error}</p>}
  {open&&<div className="mt-2 max-h-96 overflow-auto rounded-xl border border-zinc-600 bg-zinc-950 p-3 text-white"><h2 className="font-semibold">Service request notifications</h2><p className="text-xs text-zinc-400">Page {page+1} · updates every 30 seconds</p>{rows.length===0?<p>No notifications yet.</p>:<ul>{rows.map(n=><li key={n.id} className="border-b border-zinc-700 py-3"><Link className="block underline" href={`/admin/service-requests?business=${encodeURIComponent(business)}&request=${encodeURIComponent(n.request_id)}`} onClick={()=>{void mark(n.id);setOpen(false);}}>{!n.read_at?'Unread · ':''}{n.customer_name} — {n.request_type}</Link><p className="text-xs">Requested: {n.requested_date||'Flexible date'}</p><time className="block text-xs" dateTime={n.submitted_at}>{new Date(n.submitted_at).toLocaleString()}</time>{!n.read_at&&<button className="mt-2 text-sm underline" onClick={()=>void mark(n.id)}>Mark as read</button>}</li>)}</ul>}<div className="flex gap-4 pt-3"><button disabled={page===0} onClick={()=>setPage(n=>n-1)}>Newer</button><button disabled={rows.length<50} onClick={()=>setPage(n=>n+1)}>Older</button></div></div>}
 </section>;
}
