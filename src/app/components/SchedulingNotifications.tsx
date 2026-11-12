"use client";
import Link from 'next/link';
import {useEffect,useId,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {loadWorkspaceAccess} from '../lib/workspaceAccess';
import {syntheticRequestIds,isVerifiedSyntheticRequest} from '../lib/verifiedSyntheticRequests';

type Notice={id:string;request_id:string;customer_name:string;request_type:string;requested_date?:string|null;submitted_at:string;read_at:string|null};
/** Caller JWT + database RLS; no intake credential or admin authority in the browser. */
export default function SchedulingNotifications({business}:{business:string}){
 const panelId=useId();
 const toggle=useRef<HTMLButtonElement>(null);
 const [page,setPage]=useState(0);
 const [includeTests,setIncludeTests]=useState(false),[businessId,setBusinessId]=useState('');
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
    const ids=syntheticRequestIds(access.businessId);
    let inboxQuery=supabase.from('scheduling_owner_notifications').select('id,request_id,customer_name,request_type,requested_date,submitted_at,read_at').eq('business_id',access.businessId).eq('recipient_id',user.id);
    let unreadQuery=supabase.from('scheduling_owner_notifications').select('id',{count:'exact',head:true}).eq('business_id',access.businessId).eq('recipient_id',user.id).is('read_at',null);
    if(ids.length){
     const excluded=`(${ids.join(',')})`;
     if(!includeTests)inboxQuery=inboxQuery.not('request_id','in',excluded);
     unreadQuery=unreadQuery.not('request_id','in',excluded);
    }
    const [inbox,unread]=await Promise.all([inboxQuery.order('submitted_at',{ascending:false}).range(page*50,page*50+49),unreadQuery]);
    if(inbox.error||unread.error)throw Error();
    if(!cancelled&&epoch===authEpoch){setBusinessId(access.businessId);setAllowed(true);setRows(inbox.data??[]);setCount(unread.count??0);setError('');}
   }catch{if(!cancelled&&epoch===authEpoch){setRows([]);setCount(0);setError('Notifications unavailable. Check Service Requests.');}}
   finally{inFlight=false;}
  }
  void load();const timer=window.setInterval(()=>void load(),30000);
  const wake=()=>void load();window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'){authEpoch++;setRows([]);setCount(0);setAllowed(false);setOpen(false);}});
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);subscription.unsubscribe();};
 },[business,page,includeTests]);
 async function mark(id:string){
  try{
  const {data,error:failure}=await supabase.from('scheduling_owner_notifications').update({read_at:new Date().toISOString()}).eq('id',id).is('read_at',null).select('id,read_at');
  if(failure){setError('Could not mark notification read. Try again.');return;}
  if(data?.length){setRows(old=>old.map(r=>r.id===id?{...r,read_at:data[0].read_at}:r));if(!isVerifiedSyntheticRequest(businessId,rows.find(r=>r.id===id)?.request_id??''))setCount(n=>Math.max(0,n-1));}
  }catch{setError('Could not mark notification read. Try again.');}
 }
 if(!allowed&&!error)return null;
 return (
  <section className="relative my-2" aria-label="Scheduling notifications" onKeyDown={event=>{
   if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);toggle.current?.focus();}
  }}>
   <button ref={toggle} type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
    aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(current=>!current)}>
    Notifications
    <span className="sr-only" aria-live="polite">{count} unread</span>
    {count>0&&<span aria-hidden="true" className="rounded-full bg-orange-400/15 px-2 py-0.5 text-orange-300">{count}</span>}
   </button>
   {error&&<p role="status" className="text-sm text-amber-300">{error}</p>}
   <div id={panelId} hidden={!open} className="mt-1 max-h-[min(24rem,55dvh)] overflow-auto rounded-xl border border-zinc-600 bg-zinc-950 p-3 text-white">
    <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-300">
     <input type="checkbox" checked={includeTests} onChange={event=>{setIncludeTests(event.target.checked);setPage(0);setRows([]);}}/>
     Show test notifications
    </label>
    {rows.length===0?<p>{page===0?'No notifications yet.':'No older notifications.'}</p>:<ul>{rows.map(notice=>(
     <li key={notice.id} className="border-b border-zinc-700 py-2">
      <Link className="block break-words py-2 text-sm font-semibold underline" href={`/admin/service-requests?business=${encodeURIComponent(business)}&request=${encodeURIComponent(notice.request_id)}`}
       onClick={()=>{void mark(notice.id);setOpen(false);}}>{!notice.read_at?'Unread · ':''}{notice.customer_name} — {notice.request_type}</Link>
      <p className="text-xs text-zinc-300">Requested: {notice.requested_date||'Flexible date'}</p>
      <time className="block text-xs text-zinc-300" dateTime={notice.submitted_at}>{new Date(notice.submitted_at).toLocaleString()}</time>
      {!notice.read_at&&<button type="button" className="min-h-11 text-sm underline" onClick={()=>void mark(notice.id)}>Mark as read</button>}
     </li>
    ))}</ul>}
    {(page>0||rows.length===50)&&<div className="flex items-center justify-between gap-2">
     <button type="button" className="min-h-11 px-2 disabled:opacity-50" disabled={page===0} onClick={()=>setPage(current=>current-1)}>Newer</button>
     <span className="text-xs">Page {page+1}</span>
     <button type="button" className="min-h-11 px-2 disabled:opacity-50" disabled={rows.length<50} onClick={()=>setPage(current=>current+1)}>Older</button>
    </div>}
   </div>
  </section>
 );
}
