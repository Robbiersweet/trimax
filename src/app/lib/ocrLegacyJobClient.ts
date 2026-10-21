import { supabase } from './supabase';

/** Polling never creates attempts or jobs. Only the initial idempotent POST enqueues. */
export async function waitForLegacyJob(input:{attemptId:string;documentType:string;retryStrategy:string;diagnosticReplay?:boolean}, current:()=>boolean, status:(message:string)=>void, onQueued?:()=>void) {
 const deadline=performance.now()+90_000;
 const timeoutMessage="Trimax couldn't finish reading this remittance. Retry your saved scan or enter manually.";
 let lastJobStatus:string|null=null;
 function timeoutError(){return Object.assign(Error(timeoutMessage),{code:lastJobStatus&&['queued','running','completion_persistence_pending'].includes(lastJobStatus)?'OCR_JOB_PENDING':'OCR_STATUS_UNAVAILABLE',jobStatus:lastJobStatus});}
 async function request(enqueue:boolean){
  const {data}=await bounded(supabase.auth.getSession(),12000);
  if(!data.session)throw Error('Sign in to resume your saved scan.');
  return bounded(fetch('/api/payments/ocr-jobs'+(enqueue?'':'?attemptId='+encodeURIComponent(input.attemptId)),{method:enqueue?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},...(enqueue?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(12000),cache:'no-store'}),12000);
 }
 function bounded<T>(work:PromiseLike<T>,ms:number):Promise<T>{
  const remaining=deadline-performance.now();
  if(remaining<=0)return Promise.reject(timeoutError());
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(timeoutError()),Math.min(ms,remaining));Promise.resolve(work).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
 }
 const queuedAt=performance.now();
 const queued=await request(true);
 const enqueueMs=Math.round(performance.now()-queuedAt);
 if(!queued.ok)throw Error((await queued.json()).error??'Capture saved — processing pending.');
 onQueued?.();
 while(current()){
  if(performance.now()>=deadline)throw timeoutError();
  try{
   const response=await request(false);
   if(response.status===401)throw Error('Sign in to resume your saved scan.');
   if(response.ok){
    const job=await bounded(response.json(),12000);
    lastJobStatus=job.status;
    if(job.status==='review'||job.status==='failed'){
     const result=job.response??{error:job.error};
     // Keep network timing with the durable review payload, not only a transient UI header.
     const evidence={...result,diagnostics:{...result.diagnostics,backgroundJob:{timings:job.timings??{},enqueueRequestMs:enqueueMs,evidenceReference:job.summary?.evidenceReference??null}}};
     return new Response(JSON.stringify(evidence),{status:job.httpStatus??500,headers:{'Content-Type':'application/json','x-ocr-enqueue-ms':String(enqueueMs),'x-ocr-job-timings':JSON.stringify(job.timings??{})}});
    }
    status(job.status==='completion_persistence_pending'?'Preparing review':job.status==='queued'?'Waiting to read remittance':'Reading remittance');
   }else status('Capture saved — reconnecting to processing status…');
  }catch{status('Capture saved — reconnecting to processing status…');}
  await new Promise(resolve=>setTimeout(resolve,Math.min(2500,Math.max(0,deadline-performance.now()))));
 }
 throw Error('Scan view replaced; background processing continues.');
}
