"use client";
import {useState} from 'react';
import type {ScanSummary} from '../lib/ocrHistory';


/** Diagnostics only: retry the saved handoff, never payment or inference results. */
export default function OcrCaptureRecovery({summary,businessSlug}:{summary:ScanSummary;businessSlug:string}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(!summary.canonicalReference || summary.ocrEngine==='v2-shadow')return null;
 const pending=summary.shadowHandoffState==='handoff_pending';
 const stored=['image_stored','processing','completion_persistence_pending'].includes(summary.captureState??'');
 if(!pending&&!stored)return null;
 return <div className="my-2 rounded-lg border border-amber-300/30 p-3 text-sm">
  <p>{summary.captureState==='completion_persistence_pending'?'OCR completed — saving review result':`Capture saved — ${stored?'processing':'shadow processing'} pending`}</p>
  {pending&&<button type="button" disabled={busy} className="mt-2 rounded border px-3 py-2" onClick={async()=>{
   setBusy(true);
   try {const {resumeCaptureHandoff}=await import('../lib/ocrCanonicalClient');const result=await resumeCaptureHandoff(summary.attemptId);setMessage(result.queued?'Shadow processing queued. The saved photo was reused.':'Shadow processing is disabled; capture remains saved.');}
   catch(error){setMessage('Capture remains saved. Retry handoff when service is available. '+String(error));}
   finally{setBusy(false);}
  }}>Retry shadow handoff</button>}
  {stored&&<a className="ml-3 underline" href={`/payments?business=${encodeURIComponent(businessSlug)}&replayAttempt=${summary.attemptId}`}>Resume saved capture</a>}
  {message&&<p role="status">{message}</p>}
 </div>;
}
