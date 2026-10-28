"use client";
import {useEffect,useEffectEvent,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../lib/supabase';
type Label={id:string;property:string;unit:string;address:string;active:boolean;url:string;svg:string};
export default function MaintenanceLabels({loginHref="/login?next=%2Fmaintenance-labels"}:{loginHref?:string}={}){
 const [business,setBusiness]=useState(''),[assignment,setAssignment]=useState(''),[unit,setUnit]=useState(''),[address,setAddress]=useState('');
 const [properties,setProperties]=useState<{id:string;property:string}[]>([]),[labels,setLabels]=useState<Label[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(id:string,create=false){
  setBusy(true);setError('');try{
   const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Sign in with your owner or administrator account.');
   const response=await fetch('/api/maintenance-qr?business='+encodeURIComponent(id),{method:create?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(create?{'Content-Type':'application/json'}:{})},...(create?{body:JSON.stringify({businessId:id,assignmentId:assignment,unit,address})}:{})});
   const data=await response.json();if(!response.ok)throw Error(data.error);setProperties(data.properties);setLabels(data.labels);
  }catch(e){setError(e instanceof Error?e.message:'Labels unavailable');}finally{setBusy(false);}
 }
 const initialLoad=useEffectEvent((id:string)=>{void load(id);});
 useEffect(()=>{void Promise.resolve().then(()=>{const requested=new URLSearchParams(window.location.search).get('business');if(requested){setBusiness(requested);initialLoad(requested);return;}return supabase.from('businesses').select('id').eq('slug','rnl-creations').maybeSingle().then(({data})=>{if(data){setBusiness(data.id);initialLoad(data.id);}});});},[]);
 return <main className="mx-auto max-w-5xl p-5 text-white">
  <div className="print:hidden"><Link href="/?business=rnl-creations" className="underline">Back to TriMax</Link><h1 className="mt-5 text-3xl font-bold">Maintenance QR labels</h1><p className="mt-2">Permanent location labels. Anyone scanning can request work; only authorized managers can submit directly to the Queue.</p>
   <form className="my-5 grid gap-3" onSubmit={e=>{e.preventDefault();void load(business,true);}}>
    <label>Authorized property<select required className="block w-full bg-zinc-900 p-3" value={assignment} onChange={e=>setAssignment(e.target.value)}><option value="">Choose property</option>{properties.map(p=><option key={p.id} value={p.id}>{p.property}</option>)}</select></label>
    <label>Unit / location<input required maxLength={100} className="block w-full bg-zinc-900 p-3" value={unit} onChange={e=>setUnit(e.target.value)}/></label>
    <label>Service address<input required maxLength={500} className="block w-full bg-zinc-900 p-3" value={address} onChange={e=>setAddress(e.target.value)}/></label>
    <button disabled={busy||!business} className="rounded-lg bg-orange-500 p-3 font-bold text-black disabled:opacity-50">{busy?'Working…':'Create or find permanent label'}</button>
   </form>{error&&<p role="alert">{error} <Link href={loginHref} className="underline">Sign in</Link></p>}<button type="button" onClick={()=>window.print()} disabled={!labels.length} className="mb-5 rounded border p-3">Print labels</button>
  </div>
  <div className="grid gap-5 sm:grid-cols-2">{labels.filter(l=>l.active).map(l=><section key={l.id} className="break-inside-avoid rounded-lg border bg-white p-5 text-center text-black"><h2 className="text-xl font-bold">R&amp;L Creations · Maintenance request</h2><p>{l.property} · Unit {l.unit}</p>{/* Generated QR only; no remote analytics or address lookup. */}
   {/* eslint-disable-next-line @next/next/no-img-element -- self-contained printable SVG. */}
   <img src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(l.svg)} alt={`Scan to request maintenance for ${l.property}, unit ${l.unit}`} width={256} height={256} className="mx-auto"/>
   <p>Scan to describe the work and add photos.</p><a className="break-all text-xs underline" href={l.url}>{l.url}</a><p className="mt-2 text-xs">A request is not an appointment. For emergencies, contact emergency services.</p>
  </section>)}</div>
 </main>;
}
