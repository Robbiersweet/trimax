/* eslint-disable @typescript-eslint/no-require-imports -- Fail closed while transient attestation transport recovers. */
async function validatedWorker(config,engine,{validate=require('./contract.cjs').validateStartup,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),warn=message=>console.error(message)}={}) {
 let failures=0;
 for(;;){
  try{return await validate(config,engine);}
  catch(error){
   // Actual drift, credential denial and missing deployment RPCs remain fatal.
   if(error.code!=='ATTESTATION_TEMPORARILY_UNAVAILABLE')throw error;
   failures++;
   const delay=Math.min(30000,5000*2**Math.min(failures-1,3));
   warn('OCR worker paused: attestation temporarily unavailable; no job claimed. Revalidating in '+delay+'ms.');
   await wait(delay);
  }
 }
}
module.exports={validatedWorker};
