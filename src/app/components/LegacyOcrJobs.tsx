"use client";
import {useEffect,useRef,useState} from 'react';
import {remittanceDeadline} from '../lib/remittanceDeadline';
import {supabase} from '../lib/supabase';
import type {ScanSummary} from '../lib/ocrHistory';
import {diagnosticDate} from '../lib/ocrDiagnosticDisplay.ts';
import {diagnosticSavedDates} from '../lib/ocrDiagnosticDisplayClient';
export type SavedLegacyJob={attemptId:string;status:string;summary:ScanSummary;createdAt?:string;input:{documentType:'remittance_stub'|'full_check_stub'|'check_only';retryStrategy:'standard'|'alternate';diagnosticReplay?:boolean}};
export default function LegacyOcrJobs({businessId,onResume}:{businessId:string;onResume:(job:SavedLegacyJob)=>Promise<void>}) {
 const [jobs,setJobs]=useState<SavedLegacyJob[]>([]),[busy,setBusy]=useState<string|null>(null);
 const [refreshError,setRefreshError]=useState(''),[refreshEpoch,setRefreshEpoch]=useState(0);
 const dates=useRef(new Map<string,string>());
 useEffect(()=>{
  let active=true,inFlight=false;
  const refresh=async()=>{
   if(inFlight)return;
   inFlight=true;
   try {
    const {data,error}=await remittanceDeadline(Promise.resolve(supabase.rpc('trimax_recent_ocr_legacy',{p_business:businessId}).abortSignal(AbortSignal.timeout(12000))),12000,'Saved scan status lookup timed out.');
    if(!active)return;
    if(error)throw Error('Saved scan status unavailable');
    const recent=(data??[]) as SavedLegacyJob[];
    // Status must not wait for optional display-date metadata.
    setJobs(recent.map(job=>({...job,createdAt:dates.current.get(`${businessId}:${job.attemptId}`)})));
    setRefreshError('');
    const missing=recent.filter(job=>!dates.current.has(`${businessId}:${job.attemptId}`)).map(job=>job.attemptId);
    if(missing.length){
     const saved=await remittanceDeadline(diagnosticSavedDates(businessId,missing),12000,'Saved date lookup timed out.').catch(()=>({}));
     if(!active)return;
     for(const [id,date]of Object.entries(saved))dates.current.set(`${businessId}:${id}`,date);
     setJobs(recent.map(job=>({...job,createdAt:dates.current.get(`${businessId}:${job.attemptId}`)})));
    }
   } catch {
    if(active)setRefreshError('Saved scan list could not refresh. Your photos are retained; retry status without taking another photo.');
   } finally {inFlight=false;}
  };
  void refresh();
  const timer=setInterval(()=>void refresh(),5000);
  return()=>{active=false;clearInterval(timer);};
 },[businessId,refreshEpoch]);
 if(!jobs.length&&!refreshError)return null;
 return <section aria-label="Saved remittance processing" className="my-3 rounded border p-3 text-sm">
  <p>Saved remittance scans</p>
  {refreshError&&<p role="alert">{refreshError} <button type="button" className="underline" onClick={()=>setRefreshEpoch(value=>value+1)}>Retry saved-scan status</button></p>}
  {jobs.map(job=>{const date=diagnosticDate(job.summary,job.createdAt);return <div key={job.attemptId} className="flex items-center justify-between gap-3 py-2">
   <span>{date.label==='Saved'?'Saved ':''}{date.value} - {job.status==='review'?'Review ready':job.status==='failed'?'Processing failed':job.status==='recoverable_stalled'?'Processing interrupted - recovering saved scan':job.status==='completion_persistence_pending'?'Preparing saved review':job.status==='queued'?'Capture saved - queued':'Processing remittance'}</span>
   <button type="button" disabled={busy===job.attemptId} className="rounded border px-3 py-1" onClick={async()=>{setBusy(job.attemptId);try{await onResume(job);}finally{setBusy(value=>value===job.attemptId?null:value);}}}>Open saved scan</button>
  </div>;})}
 </section>;
}
