/* eslint-disable @typescript-eslint/no-require-imports -- Shared restricted worker lifecycle. */
const crypto=require('node:crypto');
function startWorkerHealth(config,engine,{fetcher=fetch,interval=setInterval,clear=clearInterval}={}){
 const instance=crypto.randomUUID();let busy=false,stopped=false;
 async function beat(){
  if(busy||stopped)return;busy=true;
  try{
   const response=await fetcher(config.supabaseUrl+'/rest/v1/rpc/trimax_ocr_worker_heartbeat',{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_business:config.businessId,p_key:config.workerKey,p_engine:engine,p_instance:instance}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('OCR health persistence HTTP '+response.status);
   process.send?.({kind:'alive',engine,instance});
  }finally{busy=false;}
 }
 const timer=interval(()=>{beat().catch(error=>console.error(error.message));},30000);
 timer.unref?.();
 // A supervisor crash must not leave an untracked worker behind.
 const disconnected=()=>{process.exitCode=1;process.exit(1);};
 if(process.send)process.once('disconnect',disconnected);
 return {beat,stop(){stopped=true;clear(timer);process.removeListener('disconnect',disconnected);}};
}
module.exports={startWorkerHealth};
