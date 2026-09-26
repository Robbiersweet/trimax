/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node worker loads the unchanged TypeScript extraction route. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const {saveEvidence,terminalSummary}=require('./ocr-legacy-evidence.cjs');
const {readWorkerCanonical}=require('./ocr-canonical-object.cjs');
function loadEngine(){
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const req=spec=>{if(!spec.startsWith('.')&&!spec.startsWith('@/'))return require(spec);const base=spec.startsWith('@/')?path.resolve('src',spec.slice(2)):path.resolve(path.dirname(file),spec);return load([base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)));};
  new Function('require','module','exports',js)(req,mod,mod.exports);return mod.exports;
 }
 return {route:load(path.resolve('src/app/api/payments/extract-check-stub/route.ts')),progress:load(path.resolve('src/app/lib/ocrLegacyProgress.ts'))};
}
async function runJob(config,rpc,engine){
 const claim=await rpc('trimax_claim_ocr_legacy',{});if(!claim)return false;
 const j=claim.job;
 const update=(stage,payload={},status=null)=>rpc('trimax_update_ocr_legacy',{p_attempt:j.attempt_id,p_lease:j.lease,p_stage:stage,p_payload:payload,p_status:status});
 let lostLease=false;
 const heartbeat=setInterval(()=>{update('heartbeat').catch(()=>{lostLease=true;});},30000);
 try{
  // A durable response needs only its bounded terminal acknowledgement after restart.
  if(claim.recovery && j.evidence_manifest?.response_ready){
   await update('complete',terminalSummary(claim.recovery.result,j.evidence_manifest.response_ready.hash),claim.recovery.status);
   return true;
  }
  const image=await readWorkerCanonical(config,j,claim.optical,'legacy');
  if(!image||!['image/jpeg','image/png','image/webp'].includes(image.mime))throw Error('Canonical image unavailable or hash mismatch');
  if(claim.recovery && typeof claim.recovery.text!=='string')throw Error('Completed checkpoint lacks selected text; preserve evidence for recovery without repeating OCR');
  const response=await engine.progress.withLegacyProgress(async(stage,evidence)=>{if(lostLease)throw Error('Legacy lease heartbeat failed');await saveEvidence(update,stage,evidence);},()=>engine.route.POST(new Request('http://legacy-worker/extract',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-observation-scope':crypto.randomUUID()},body:JSON.stringify({...j.input,attemptId:j.attempt_id,imageDataUrl:'data:'+image.mime+';base64,'+image.base64})})),claim.recovery??undefined);
  const result=await response.json();delete result.optical; // Canonical image is already retained; never duplicate image bytes.
  if(lostLease)throw Error('Legacy lease lost before completion');
  const reference=await saveEvidence(update,'response_ready',{result,status:response.status});
  await update('complete',terminalSummary(result,reference),response.status);
  console.log(JSON.stringify({attemptId:j.attempt_id,status:response.status,completedAt:new Date().toISOString()}));
 }catch(error){
  // A stale lease cannot overwrite the new owner's result. Persistence failure leaves the lease reclaimable.
  if(!lostLease)await update('failed',{error:error.message},500).catch(()=>{});
  console.error(JSON.stringify({attemptId:j.attempt_id,error:error.message}));
 }finally{clearInterval(heartbeat);}
 return true;
}
module.exports={loadEngine,runJob};
if(require.main===module)(async()=>{
 const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const rpc=async(name,args)=>{const r=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_business:config.businessId,p_key:config.workerKey,...args}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Legacy queue '+r.status+': '+(await r.text()).slice(0,500));return r.status===204?null:r.json();};
 const engine=loadEngine();
 do{try{await runJob(config,rpc,engine);}catch(e){console.error(e.message);}if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,5000));}while(true);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
