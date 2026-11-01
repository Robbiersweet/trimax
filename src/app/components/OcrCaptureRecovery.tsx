"use client";
import {useEffect,useState} from 'react';
import type {ScanSummary} from '../lib/ocrHistory';
import {completedPairedShadow} from '../lib/ocrDiagnosticDisplay.ts';
import {diagnosticPairedSummary} from '../lib/ocrDiagnosticDisplayClient';


/** Diagnostics only: retry the saved handoff, never payment or inference results. */
export default function OcrCaptureRecovery({summary,businessSlug,businessId}:{summary:ScanSummary;businessSlug:string;businessId?:string}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [paired,setPaired]=useState<{key:string;summary:ScanSummary|null;loading:boolean}>({key:'',summary:null,loading:false});
 const pairKey=`${businessId}:${summary.attemptId}:${summary.shadowAttemptId}:${summary.sourceImageHash}`;
 const needsStatus=Boolean(businessId&&summary.shadowAttemptId&&summary.canonicalReference&&summary.ocrEngine!=='v2-shadow'&&summary.shadowHandoffState==='handoff_pending');
 useEffect(()=>{
  if(!needsStatus||!businessId||!summary.shadowAttemptId)return;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=async()=>{const other=await diagnosticPairedSummary(businessId,summary.shadowAttemptId!).catch(()=>null);if(!active)return;setPaired({key:pairKey,summary:other,loading:false});if(!completedPairedShadow(summary,other))timer=setTimeout(()=>void refresh(),5000);};
  void refresh();return()=>{active=false;if(timer)clearTimeout(timer);};
 },[needsStatus,businessId,pairKey,summary]);
 if(!summary.canonicalReference || summary.ocrEngine==='v2-shadow')return null;
 const other=paired.key===pairKey?paired.summary:null;
 const completed=completedPairedShadow(summary,other);
 const checking=needsStatus&&paired.key!==pairKey;
 const pending=summary.shadowHandoffState==='handoff_pending'&&!completed;
 const stored=['image_stored','processing','completion_persistence_pending'].includes(summary.captureState??'');
 if(completed&&!stored)return <div role="status" className="my-2 rounded border border-white/15 p-3 text-sm">{completed==='failed'?'Shadow processing failed — see diagnostic comparison.':'Shadow processing complete — diagnostic only.'}</div>;
 if(!pending&&!stored)return null;
 return <div className="my-2 rounded-lg border border-amber-300/30 p-3 text-sm">
  <p>{checking&&!stored?'Checking shadow processing status…':summary.captureState==='completion_persistence_pending'?'OCR completed — saving review result':`Capture saved — ${stored?'processing':'shadow processing'} pending`}</p>
  {pending&&<button type="button" disabled={busy||checking} className="mt-2 rounded border px-3 py-2" onClick={async()=>{
   setBusy(true);
   try {const {resumeCaptureHandoff}=await import('../lib/ocrCanonicalClient');const result=await resumeCaptureHandoff(summary.attemptId);setMessage(result.queued?'Shadow processing queued. The saved photo was reused.':'Shadow processing is disabled; capture remains saved.');}
   catch(error){setMessage('Capture remains saved. Retry handoff when service is available. '+String(error));}
   finally{setBusy(false);}
  }}>Retry shadow handoff</button>}
  {stored&&<a className="ml-3 underline" href={`/payments?business=${encodeURIComponent(businessSlug)}&replayAttempt=${summary.attemptId}`}>Resume saved capture</a>}
  {message&&<p role="status">{message}</p>}
 </div>;
}
