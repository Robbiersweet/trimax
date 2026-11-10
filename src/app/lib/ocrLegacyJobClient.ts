import { supabase } from './supabase';

export const LEGACY_FOREGROUND_WAIT_MS = 45_000;
// The database reaper has a 30-minute absolute job deadline. Observation gets a
// small margin to read its terminal decision; this is NOT a spinner deadline.
export const LEGACY_JOB_OBSERVATION_LIMIT_MS = 32 * 60_000;

/** One durable job, finite foreground UI, continuing observation and no financial writes. */
export async function waitForLegacyJob(
 input: {attemptId:string;documentType:string;retryStrategy:string;diagnosticReplay?:boolean},
 current: () => boolean,
 status: (message:string) => void,
 onQueued?: () => void,
 onBackground?: () => void,
) {
 const started = performance.now(), deadline = started + LEGACY_JOB_OBSERVATION_LIMIT_MS;
 let enqueueMs=0;
 let lastJobStatus:string|null = null, workerUnavailable = false, background = false;
 let lastMessage = 'Checking saved processing status', failures = 0, enqueueAttempts = 0, acknowledged = false;
 const cancelled = () => Object.assign(Error('Scan view replaced; the saved job is retained.'), {code:'OCR_VIEW_REPLACED'});
 const unavailable = (message = 'Processing status connection timed out. Your photo is saved; open this saved scan to reconnect.') => Object.assign(Error(message), {code:'OCR_STATUS_UNAVAILABLE',jobStatus:lastJobStatus});
 const timeoutError = () => Object.assign(Error(workerUnavailable
  ? 'Capture saved - OCR worker unavailable. Open this saved scan to check recovery or review manually.'
  : lastJobStatus === 'recoverable_stalled'
   ? 'Capture saved - processing was interrupted. Open this saved scan to check recovery.'
   : "Trimax couldn't finish observing this saved remittance. Open the saved scan to check its result; no new photo is needed."),
  {code:lastJobStatus ? 'OCR_JOB_PENDING' : 'OCR_STATUS_UNAVAILABLE',jobStatus:lastJobStatus,workerUnavailable});
 const emit = (message:string) => {
  lastMessage = message;
  if(current()) status(background ? message + '. Your photo is saved; review will open here automatically.' : message);
 };
 const foreground = setTimeout(() => {
  if(!current()) return;
  background = true;
  onBackground?.();
  emit(lastMessage);
 }, LEGACY_FOREGROUND_WAIT_MS);
 function bounded<T>(work:PromiseLike<T>, ms=12000):Promise<T> {
  const remaining = deadline-performance.now();
  if(remaining<=0) return Promise.reject(timeoutError());
  return new Promise((resolve,reject) => {
   const timer=setTimeout(() => reject(remaining<=ms ? timeoutError() : unavailable()),Math.min(ms,remaining));
   Promise.resolve(work).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
 }
 async function request(enqueue:boolean) {
  if(!current()) throw cancelled();
  const {data}=await bounded(supabase.auth.getSession());
  if(!data.session) throw Object.assign(Error('Your session needs attention. The saved scan is retained; sign in to resume it.'),{code:'OCR_AUTH_REQUIRED'});
  const response=await bounded(fetch('/api/payments/ocr-jobs'+(enqueue?'':'?attemptId='+encodeURIComponent(input.attemptId)),{
   method:enqueue?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},
   ...(enqueue?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(12000),cache:'no-store',
  }));
  if(response.status===401||response.status===403) throw Object.assign(Error('Your session cannot read this saved scan. Reopen it in the authorized workspace.'),{code:'OCR_AUTH_REQUIRED'});
  const body=await bounded(response.json());
  if(!response.ok) throw unavailable(body.error ?? 'Saved scan status is temporarily unavailable. Open this saved scan to reconnect.');
  if(!current()) throw cancelled();
  return body;
 }
 async function enqueue() {
  if(++enqueueAttempts>3) throw unavailable('This saved scan could not be queued. Open it to retry the same photo.');
  const start=performance.now();
  try {await request(true);} finally {enqueueMs=Math.round(performance.now()-start);}
  if(!acknowledged){acknowledged=true;onQueued?.();}
 }
 const isFinalError = (error:unknown) => error instanceof Error && 'code' in error && ['OCR_AUTH_REQUIRED','OCR_VIEW_REPLACED','OCR_RESULT_UNAVAILABLE'].includes(String(error.code));
 try {
  // A lost POST acknowledgement is followed by GET, not a replacement capture.
  try {await enqueue();} catch(error) {if(isFinalError(error))throw error;failures++;emit('Photo saved - checking whether processing was queued');}
  while(current()) {
   if(performance.now()>=deadline) throw timeoutError();
   try {
    const job=await request(false);
    lastJobStatus=job.processingState??job.status;
    workerUnavailable=job.workerHealth?.healthy===false;
    if(job.status==='review'||job.status==='failed') {
     if(job.status==='review'&&(!job.response||typeof job.response!=='object'))
      throw Object.assign(Error('Processing completed but its saved result could not be loaded. Reopen this saved scan; no new photo is needed.'),{code:'OCR_RESULT_UNAVAILABLE'});
     status(job.status==='review'?'Review ready - no payment has been applied.':'Processing failed - saved photo retained for review.');
     const result=job.response??{error:job.error??'Processing failed. Your saved photo is retained for review.'};
     const evidence={...result,diagnostics:{...result.diagnostics,backgroundJob:{timings:job.timings??{},enqueueRequestMs:enqueueMs,evidenceReference:job.summary?.evidenceReference??null}}};
     return new Response(JSON.stringify(evidence),{status:job.httpStatus??500,headers:{'Content-Type':'application/json','x-ocr-enqueue-ms':String(enqueueMs),'x-ocr-job-timings':JSON.stringify(job.timings??{})}});
    }
    if(job.status==='not_enqueued'){await enqueue();emit('Saved photo queued for processing');}
    else if(['queued','running','completion_persistence_pending','recoverable_stalled'].includes(String(lastJobStatus))) {
     emit(lastJobStatus==='recoverable_stalled'?'Processing interrupted - recovering the same saved scan':workerUnavailable?'OCR worker unavailable - waiting for recovery':lastJobStatus==='completion_persistence_pending'?'Preparing saved review':lastJobStatus==='queued'?'Waiting to read remittance':job.timings?.ocr_complete?'Preparing review':'Reading remittance');
    } else throw unavailable('Saved processing returned an unknown state. Reopen this saved scan to reconnect.');
    failures=0;
   } catch(error) {
    if(isFinalError(error))throw error;
    if(++failures>=3) throw unavailable('Cannot check processing after repeated connection failures. Your photo and job are saved; open this saved scan to reconnect.');
    emit('Photo saved - reconnecting to processing status');
   }
   await new Promise(resolve=>setTimeout(resolve,Math.min(background?5000:2500,Math.max(0,deadline-performance.now()))));
  }
  throw cancelled();
 } finally {clearTimeout(foreground);}
}
