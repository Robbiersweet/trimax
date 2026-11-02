/* eslint-disable @typescript-eslint/no-require-imports -- Worker-only evidence transport; recognition and terminal checkpoints are unchanged. */
const {encodeEvidence,saveEvidence}=require('./ocr-legacy-evidence.cjs');

// Each bounded batch retains every original observation and its original hash.
// The last observation's fields remain available to existing checkpoint readers.
// Recovery still uses only the unchanged ocr_complete/response_ready checkpoints.
function batchedProgress(update,{now=()=>performance.now()}={}){
 let pending=[],bytes=0,last=now();
 async function flush(){
  if(!pending.length)return;
  const batch=pending;
  await saveEvidence(update,'pass_complete',{...batch.at(-1).observation,passObservations:batch});
  pending=[];bytes=0;last=now();
 }
 async function persist(stage,evidence){
  if(stage!=='pass_complete'){
   await flush();
   await saveEvidence(update,stage,evidence);
   return;
  }
  const text=JSON.stringify(evidence),encoded=encodeEvidence(evidence);
  // A large individual observation keeps the existing bounded writer contract.
  if(encoded.bytes>192000){await flush();await saveEvidence(update,stage,evidence);last=now();return;}
  if(pending.length&&bytes+encoded.bytes>192000)await flush();
  pending.push({hash:encoded.hash,bytes:encoded.bytes,observation:JSON.parse(text)});
  bytes+=encoded.bytes;
  if(pending.length>=16||bytes>=192000||now()-last>=5000)await flush();
 }
 return {persist,flush};
}
module.exports={batchedProgress};
