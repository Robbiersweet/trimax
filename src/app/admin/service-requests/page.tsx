"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import AppShell from '../../components/AppShell';
import {supabase} from '../../lib/supabase';
import OwnerWorkspace from './components/OwnerWorkspace';
import type {PublicServiceRequest} from '../../lib/publicScheduling/domain';
import type {SchedulingSettings} from '../../lib/publicScheduling/settings';
import type {WorkflowChange} from '../../lib/publicScheduling/workflow';
import type {ReviewChange} from '../../lib/publicScheduling/ownerWorkflow';
export default function ServiceRequestsIntake(){const params=useSearchParams();const business=params.get('business')||'rnl-creations';const requestId=params.get('request');return <Inbox key={`${business}:${requestId??''}`} business={business} requestId={requestId}/>;}
function Inbox({business,requestId}:{business:string;requestId:string|null}){
 const [data,setData]=useState<{requests:PublicServiceRequest[];settings:SchedulingSettings & {production?:boolean}}|null>(null),[message,setMessage]=useState('Load the service request inbox with your owner/admin account.'),[busy,setBusy]=useState(true);
 const api=useCallback(async function api(path:string,options:RequestInit={}){const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Sign in with an owner/admin account.');const response=await fetch(`/api/public-scheduling/${path.split('&')[0]}?${path.includes('&')?path.slice(path.indexOf('&')+1)+'&':''}business=${encodeURIComponent(business)}${path==='intake'&&requestId?'&request='+encodeURIComponent(requestId):''}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed.');return result;},[business,requestId]);
 const workflowApi=useMemo(()=>({load:(id:string)=>api('workflow&request='+encodeURIComponent(id)),save:(change:WorkflowChange)=>api('workflow',{method:'POST',body:JSON.stringify(change)})}),[api]);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let current=true;Promise.all([api('intake'),api('settings')]).then(([inbox,settings])=>{if(current)setData({requests:inbox.requests,settings});}).catch(error=>{if(current)setMessage(error instanceof Error?error.message:'Unable to load.');}).finally(()=>{if(current)setBusy(false);});return()=>{current=false;};},[api,retry]);
 return <AppShell>{data?<OwnerWorkspace workflowApi={workflowApi} key={`${business}:${requestId??'inbox'}`} initialRequestId={requestId??undefined} production={data.settings.production} requests={data.requests} settings={data.settings} saveReview={async(change:ReviewChange)=>(await api('review',{method:'PATCH',body:JSON.stringify(change)})).request} saveSettings={async(settings:SchedulingSettings)=>api('settings',{method:'PUT',body:JSON.stringify({expectedRevision:settings.revision,business:settings.business})})}/>:<main className="p-8"><h1 className="text-3xl font-semibold">Service requests</h1><p role="status" className="my-5">{message}</p><button className="rounded bg-emerald-700 px-5 py-3 text-white" onClick={()=>{setBusy(true);setRetry(n=>n+1);}} disabled={busy}>{busy?'Loading…':'Load owner workspace'}</button></main>}</AppShell>;
}
