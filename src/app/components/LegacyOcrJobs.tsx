"use client";
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import type {ScanSummary} from '../lib/ocrHistory';
export type SavedLegacyJob={attemptId:string;status:string;summary:ScanSummary;input:{documentType:'remittance_stub'|'full_check_stub'|'check_only';retryStrategy:'standard'|'alternate';diagnosticReplay?:boolean}};
export default function LegacyOcrJobs({businessId,onResume}:{businessId:string;onResume:(job:SavedLegacyJob)=>Promise<void>}){
 const [jobs,setJobs]=useState<SavedLegacyJob[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;const refresh=async()=>{const {data,error}=await supabase.rpc('trimax_recent_ocr_legacy',{p_business:businessId});if(active&&!error)setJobs(data??[]);};void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{active=false;clearInterval(timer);};},[businessId]);
 if(!jobs.length)return null;
 return <section aria-label="Saved remittance processing" className="my-3 rounded border p-3 text-sm"><p>Saved remittance scans</p>{jobs.map(job=><div key={job.attemptId} className="flex items-center justify-between gap-3 py-2"><span>{new Date(job.summary.timestamp).toLocaleString()} · {job.status==='review'?'Review ready':job.status==='failed'?'Processing failed':job.status==='queued'?'Capture saved — processing pending':'Processing remittance…'}</span><button type="button" disabled={busy} className="rounded border px-3 py-1" onClick={async()=>{setBusy(true);try{await onResume(job);}finally{setBusy(false);}}}>Open saved scan</button></div>)}</section>;
}
