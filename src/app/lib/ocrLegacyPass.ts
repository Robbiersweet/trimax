import sharp from 'sharp';
import type { Worker } from 'tesseract.js';

/** Disposable legacy bootstrap only. Callers map word boxes back to source bounds.
 * Full-resolution sources remain available to every later field/recovery pass. */
export async function legacyBootstrapImage(image: Buffer, first: boolean) {
  if (!first) return image;
  return sharp(image).resize({width:2600,height:2600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
}

/** Recognition owns this deadline; acquisition, preparation and extraction do not. */
export async function legacyRecognitionDeadline<T>(recognize:()=>Promise<T>, ms:number, message:string) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try { return await Promise.race([recognize(),new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(message)),ms);
  })]); } finally { clearTimeout(timer); }
}

type OpticalWorker=Worker;
/** A successful orientation release returns the healthy worker to this request.
 * A failed/in-flight call retires it; a timed-out worker is never reused. */
export function legacyWorkerSession(make:()=>Promise<OpticalWorker>) {
  let state:{worker:OpticalWorker;pending:boolean;failed:boolean}|undefined;
  let closed=false;
  const metrics={created:0,reused:false,acquisitionMs:0,cleanupMs:0};
  const retire=async()=>{const old=state;state=undefined;if(old){const t=performance.now();try{await old.worker.terminate();}catch{}finally{metrics.cleanupMs+=performance.now()-t;}}};
  const close=async()=>{closed=true;await retire();};
  const acquire=async()=>{if(closed)throw Error('Legacy worker session closed');if(state){metrics.reused=true;return state.worker;}const t=performance.now();try{const worker=await make();if(closed){await worker.terminate();throw Error('Legacy worker session closed during initialization');}state={worker,pending:false,failed:false};metrics.created++;return worker;}finally{metrics.acquisitionMs+=performance.now()-t;}};
  const direction=async()=>{const w=await acquire(),lease=state!;return {
    setParameters:async(...args:Parameters<Worker['setParameters']>)=>{try{return await w.setParameters(...args);}catch(e){lease.failed=true;throw e;}},
    recognize:async(...args:Parameters<Worker['recognize']>)=>{lease.pending=true;try{return await w.recognize(...args);}catch(e){lease.failed=true;throw e;}finally{lease.pending=false;}},
    terminate:async()=>{if(state===lease&&(lease.pending||lease.failed))await retire();return {jobId:'legacy-orientation-release',data:null};},
  };};
  return {acquire,direction,close,metrics};
}
