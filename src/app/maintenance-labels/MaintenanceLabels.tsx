"use client";
import {useEffect,useEffectEvent,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../lib/supabase';
import {savedLabelAddress} from '../lib/maintenanceLabelAddress';
type Property={id:string;property:string;address:string|null;addressIssue?:string|null};
type Label={id:string;property:string;unit:string|null;scope?:'unit'|'property';address:string;active:boolean;url:string;svg:string};
export default function MaintenanceLabels({loginHref="/login?next=%2Fmaintenance-labels",backLabel="Back to TriMax"}:{loginHref?:string;backLabel?:string}={}){
 const [business,setBusiness]=useState(''),[assignment,setAssignment]=useState(''),[unit,setUnit]=useState(''),[address,setAddress]=useState(''),[scope,setScope]=useState<'property'|'unit'>('property');
 const [properties,setProperties]=useState<Property[]>([]),[labels,setLabels]=useState<Label[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[printId,setPrintId]=useState<string|null>(null);
 const selected=properties.find(p=>p.id===assignment);
 const saved=savedLabelAddress(selected,labels,scope==='unit'?unit:'');
 const effectiveAddress=scope==='unit'?(address.trim()||saved.address):selected?.address??'';
 async function load(id:string,action?:'create'|'replace',label?:Label){
  setBusy(true);setError('');setNotice('');try{
   const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Sign in with your owner or administrator account.');
   const response=await fetch('/api/maintenance-qr?business='+encodeURIComponent(id),{method:action?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify({businessId:id,assignmentId:label?properties.find(p=>p.property===label.property)?.id:assignment,scope:label?'property':scope,action,labelId:label?.id,...(!label&&scope==='unit'?{unit,address:effectiveAddress}:{})})}:{})});
   const data=await response.json();if(!response.ok)throw Error(data.error);setProperties(data.properties);setLabels(data.labels);if(data.properties.length===1)setAssignment(data.properties[0].id);
   if(action)setNotice(action==='replace'?'Replacement ready. Old cards no longer accept requests. Print the new code.':'Permanent label ready. Print as many identical copies as needed.');
  }catch(e){setError(e instanceof Error?e.message:'Labels unavailable');}finally{setBusy(false);}
 }
 const initialLoad=useEffectEvent((id:string)=>{void load(id);});
 useEffect(()=>{void Promise.resolve().then(()=>{const requested=new URLSearchParams(window.location.search).get('business');if(requested){setBusiness(requested);initialLoad(requested);return;}return supabase.from('businesses').select('id').eq('slug','rnl-creations').maybeSingle().then(({data})=>{if(data){setBusiness(data.id);initialLoad(data.id);}});});},[]);
 useEffect(()=>{const done=()=>setPrintId(null);window.addEventListener('afterprint',done);return()=>window.removeEventListener('afterprint',done);},[]);
 function print(label:Label){setPrintId(label.id);requestAnimationFrame(()=>window.print());}
 async function copy(label:Label){try{await navigator.clipboard.writeText(label.url);setNotice('QR link copied.');}catch{setNotice('Copy the public link shown below the QR code.');}}
 return <main className="maintenance-labels-content mx-auto max-w-5xl p-5 text-white">
  <style>{`@media print{.maintenance-qr-card{display:none!important}.maintenance-qr-card[data-print="true"]{display:block!important;width:3.5in;max-width:100%;margin:auto}.maintenance-qr-grid{display:block!important}}`}</style>
  <div className="print:hidden"><Link href={'/?business='+encodeURIComponent(business||'rnl-creations')} className="inline-flex rounded-xl border border-current/20 px-3 py-2 text-sm font-semibold">{backLabel}</Link><h1 className="mt-5 text-3xl font-bold">Maintenance QR Labels</h1><p className="mt-2">One office QR per property, with unlimited identical copies. Anyone can request work without an account; each request needs owner review.</p>
   <form className="my-5 grid gap-3" onSubmit={e=>{e.preventDefault();void load(business,'create');}}>
    <label>Label type<select className="block w-full bg-zinc-900 p-3" value={scope} onChange={e=>{setScope(e.target.value as 'property'|'unit');setAddress('');}}><option value="property">Property-wide office QR — requester enters unit</option><option value="unit">Existing unit-specific label</option></select></label>
    <label>Authorized property<select required className="block w-full bg-zinc-900 p-3" value={assignment} onChange={e=>{setAssignment(e.target.value);setAddress('');setUnit('');}}><option value="">Choose property</option>{properties.map(p=><option key={p.id} value={p.id}>{p.property}</option>)}</select></label>
    {scope==='property'?<div><p>Saved service address</p><p className="rounded border p-3">{selected?.address||selected?.addressIssue||'Choose a property.'}</p><p className="text-sm">The unit is entered on the request form. Reusing this action returns the same active QR.</p></div>:<><label>Unit / location<input required maxLength={100} className="block w-full bg-zinc-900 p-3" value={unit} onChange={e=>{setUnit(e.target.value);setAddress('');}}/></label><label>Service address override (optional)<input maxLength={500} className="block w-full bg-zinc-900 p-3" value={address} placeholder={saved.address||'Only enter a verified address if needed'} onChange={e=>setAddress(e.target.value)}/></label><div><p>Effective service address</p><output className="block rounded border p-3" aria-live="polite">{effectiveAddress||selected?.addressIssue||saved.source}</output><p className="text-sm">{address.trim()?'Override for this unit label only.':saved.source}. Existing property and unit records are unchanged.</p></div></>}
    <button disabled={busy||!business||!assignment||!effectiveAddress} className="rounded-lg bg-orange-500 p-3 font-bold text-black disabled:opacity-50">{busy?'Working…':scope==='property'?'Create or find office QR':'Create or find unit label'}</button>
   </form>{error&&<p role="alert">{error} <Link href={loginHref} className="underline">Sign in</Link></p>}{notice&&<p role="status" className="my-3">{notice}</p>}<p className="mb-5 text-sm">Choose Print cards, then select 5 copies in your print dialog for five identical cards. Replace QR invalidates all old copies; existing requests stay available.</p>
  </div>
  <div className="maintenance-qr-grid grid gap-5 sm:grid-cols-2">{labels.filter(l=>l.active).map(l=><section key={l.id} data-print={printId===l.id} className="maintenance-qr-card break-inside-avoid rounded-lg border bg-white p-5 text-center text-black"><h2 className="text-xl font-bold">R&amp;L Creations · Maintenance request</h2><p className="font-bold">{l.property}{l.scope==='property'?' · Office QR':` · Unit ${l.unit}`}</p><p className="text-sm">{l.address}</p>
   {/* eslint-disable-next-line @next/next/no-img-element -- self-contained printable SVG. */}
   <img src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(l.svg)} alt={`Scan to request maintenance for ${l.property}${l.scope==='property'?', then enter the apartment unit':`, unit ${l.unit}`}`} width={256} height={256} className="mx-auto"/>
   <p>{l.scope==='property'?'Enter the apartment/unit number, describe the work and add photos. No account needed.':'Scan to describe the work and add photos.'}</p><a className="break-all text-xs underline" href={l.url}>{l.url}</a><p className="mt-2 text-xs">A request does not authorize work or billing. For emergencies, contact emergency services or the property emergency contact.</p>
   <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden"><button type="button" onClick={()=>print(l)} className="rounded border p-3">Print cards</button><button type="button" onClick={()=>void copy(l)} className="rounded border p-3">Copy QR link</button>{l.scope==='property'&&<button type="button" disabled={busy||!properties.some(p=>p.property===l.property)} onClick={()=>{if(window.confirm('Replace this property QR? All old printed copies will stop accepting requests. Existing requests and unit-specific labels are preserved.'))void load(business,'replace',l);}} className="rounded border p-3">Replace QR</button>}</div>
  </section>)}</div>
 </main>;
}
