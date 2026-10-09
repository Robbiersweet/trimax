"use client";
import {useState} from 'react';
import AppShell from '../../components/AppShell';
import {supabase} from '../../lib/supabase';
import OwnerWorkspace from './components/OwnerWorkspace';
import type {PublicServiceRequest} from '../../lib/publicScheduling/domain';
import type {SchedulingSettings} from '../../lib/publicScheduling/settings';
import type {ReviewChange} from '../../lib/publicScheduling/ownerWorkflow';
export default function ServiceRequestsIntake(){
 const [data,setData]=useState<{requests:PublicServiceRequest[];settings:SchedulingSettings}|null>(null),[message,setMessage]=useState('Load the development inbox with your owner/admin account.'),[busy,setBusy]=useState(false);
 async function api(path:string,options:RequestInit={}){const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Sign in with an owner/admin account.');const response=await fetch(`/api/public-scheduling/${path}?business=rnl-creations`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed.');return result;}
 async function load(){setBusy(true);try{const [inbox,settings]=await Promise.all([api('intake'),api('settings')]);setData({requests:inbox.requests,settings});}catch(error){setMessage(error instanceof Error?error.message:'Unable to load.');}finally{setBusy(false);}}
 return <AppShell>{data?<OwnerWorkspace requests={data.requests} settings={data.settings} saveReview={async(change:ReviewChange)=>(await api('review',{method:'PATCH',body:JSON.stringify(change)})).request} saveSettings={async(settings:SchedulingSettings)=>api('settings',{method:'PUT',body:JSON.stringify({expectedRevision:settings.revision,business:settings.business})})}/>:<main className="p-8"><h1 className="text-3xl font-semibold">Service requests</h1><p role="status" className="my-5">{message}</p><button className="rounded bg-emerald-700 px-5 py-3 text-white" onClick={load} disabled={busy}>{busy?'Loading…':'Load owner workspace'}</button></main>}</AppShell>;
}
