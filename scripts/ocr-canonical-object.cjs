/* eslint-disable @typescript-eslint/no-require-imports -- Private worker canonical image transport, not recognition. */
const crypto=require('node:crypto');
async function readWorkerCanonical(config,job,optical,engine){
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 for(const image of optical?.images??[]){
  if(image.base64 && hash(Buffer.from(image.base64,'base64'))===job.source_hash)return image;
  if(image.sha256!==job.source_hash||image.storageBucket!=='trimax-ocr-captures'||!image.objectPath)continue;
  // Existing credential plus current lease allows only this claimed job's canonical object.
  const response=await fetch(config.supabaseUrl+'/storage/v1/object/authenticated/'+image.storageBucket+'/'+image.objectPath.split('/').map(encodeURIComponent).join('/'),{
   headers:{apikey:config.anonKey,Authorization:'Bearer '+config.anonKey,'x-trimax-worker':config.workerKey,'x-trimax-lease':job.lease,'x-trimax-engine':engine},signal:AbortSignal.timeout(30000),
  });
  if(!response.ok)throw Error('Canonical object retrieval failed: '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(hash(bytes)!==job.source_hash)throw Error('Canonical object hash mismatch');
  return {...image,base64:bytes.toString('base64')};
 }
 throw Error('Canonical image unavailable or hash mismatch');
}
module.exports={readWorkerCanonical};
