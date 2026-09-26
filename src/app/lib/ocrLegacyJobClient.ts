import { supabase } from './supabase';

/** Polling never creates attempts or jobs. Only the initial idempotent POST enqueues. */
export async function waitForLegacyJob(input:{attemptId:string;documentType:string;retryStrategy:string;diagnosticReplay?:boolean}, current:()=>boolean, status:(message:string)=>void) {
 async function request(enqueue:boolean){
  const {data}=await supabase.auth.getSession();
  if(!data.session)throw Error('Sign in to resume your saved scan.');
  return fetch('/api/payments/ocr-jobs'+(enqueue?'':'?attemptId='+encodeURIComponent(input.attemptId)),{method:enqueue?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},...(enqueue?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(12000),cache:'no-store'});
 }
 const queuedAt=performance.now();
 const queued=await request(true);
 const enqueueMs=Math.round(performance.now()-queuedAt);
 if(!queued.ok)throw Error((await queued.json()).error??'Capture saved — processing pending.');
 while(current()){
  try{
   const response=await request(false);
   if(response.status===401)throw Error('Sign in to resume your saved scan.');
   if(response.ok){
    const job=await response.json();
    if(job.status==='review'||job.status==='failed'){
     const result=job.response??{error:job.error};
     // Keep network timing with the durable review payload, not only a transient UI header.
     const evidence={...result,diagnostics:{...result.diagnostics,backgroundJob:{timings:job.timings??{},enqueueRequestMs:enqueueMs,evidenceReference:job.summary?.evidenceReference??null}}};
     return new Response(JSON.stringify(evidence),{status:job.httpStatus??500,headers:{'Content-Type':'application/json','x-ocr-enqueue-ms':String(enqueueMs),'x-ocr-job-timings':JSON.stringify(job.timings??{})}});
    }
    status(job.status==='completion_persistence_pending'?'OCR completed — saving review result…':job.status==='queued'?'Capture saved — waiting for processing…':'Processing remittance… You can leave and return to this saved scan.');
   }else status('Capture saved — reconnecting to processing status…');
  }catch{status('Capture saved — reconnecting to processing status…');}
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
 throw Error('Scan view replaced; background processing continues.');
}
