/* eslint-disable @typescript-eslint/no-require-imports -- Isolated private worker CLI, not Vercel. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {runShadowPipeline}=require('../../src/app/lib/ocrV2/shadow/pipeline.ts');
const configFile=process.argv[2];
if(!configFile)throw Error('Usage: node --experimental-strip-types scripts/ocr-v2/shadow-worker.cjs PRIVATE_CONFIG [--once]');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const repository=path.resolve(__dirname,'../..');
for(const file of [configFile,config.privateRoot])if(path.resolve(file).toLowerCase().startsWith(repository.toLowerCase()+path.sep))throw Error('Worker credentials/data must be outside repository');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const toWSL=file=>{const full=fs.realpathSync.native(file);if(!/^[A-Za-z]:\\/.test(full))throw Error('Expected Windows path');return '/mnt/'+full[0].toLowerCase()+'/'+full.slice(3).replaceAll('\\','/');};
async function rpc(name,args){
 const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_business:config.businessId,p_key:config.workerKey,...args}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Shadow RPC '+name+' failed (HTTP '+response.status+')');return response.status===204?null:response.json();
}
async function once(){
 const claim=await rpc('trimax_claim_ocr_shadow',{});if(!claim)return false;
 const job=claim.job,id=job.shadow_attempt_id;
 if(![id,job.lease].every(value=>/^[0-9a-f-]{36}$/i.test(value)))throw Error('Invalid queue identity');
 // Fresh directory per lease prevents cached observations from masquerading as fresh inference.
 const dir=path.join(config.privateRoot,id,job.lease);fs.mkdirSync(dir,{recursive:true});
 try{
  const optical=claim.optical?.images?.find(i=>i.base64&&hash(Buffer.from(i.base64,'base64'))===job.source_hash);
  if(!optical)throw Error('Canonical capture unavailable or hash mismatch');
  const original=Buffer.from(optical.base64,'base64');
  const result=await runShadowPipeline(original,{attemptId:id,captureSessionId:job.capture_session_id,sourceImageHash:job.source_hash,build:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim(),snapshot:claim.input.snapshot},async(crops,documentId,sourceHash)=>{
   const inputs=crops.map((crop,i)=>{const file='crop-'+i+'.png';fs.writeFileSync(path.join(dir,file),crop.bytes);return{id:crop.rowId,documentId,file,sha256:crop.sha256};});
   fs.writeFileSync(path.join(dir,'inputs.json'),JSON.stringify(inputs));
   await new Promise((resolve,reject)=>{const child=cp.spawn('wsl',['-d',config.wslDistribution||'Ubuntu','--','env','HF_HUB_OFFLINE=1',config.python,toWSL(path.join(__dirname,'dataset/recognize.py')),toWSL(dir)],{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>{error=(error+b.toString()).slice(-8000);});const timeout=setTimeout(()=>{child.kill();reject(Error('Recognizer exceeded worker budget'));},600000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);if(code===0)resolve();else{fs.writeFileSync(path.join(dir,'worker-error.txt'),error);reject(Error('WSL model worker exited '+code+': '+error.slice(-1700)));}});});
   const data=JSON.parse(fs.readFileSync(path.join(dir,'recognition.json'),'utf8'));
   return{versions:data.versions,observations:data.observations.filter(o=>['svtr','parseq','ppocr'].includes(o.recognizer)).map(o=>({id:o.recognizer+':'+o.id,fieldType:'invoice',scope:'row',rowId:o.id,recognizer:{svtr:'svtrv2',parseq:'parseq',ppocr:'ppocrv5'}[o.recognizer],rawText:o.raw,sequenceConfidence:null,characterConfidences:null,confidenceCalibrated:false,cropReference:{documentId,rowId:o.id,sourceImageSha256:sourceHash,baseCropSha256:o.sha256,sha256:o.sha256,path:o.file,variant:'native'},durationMs:o.ms,visualWarnings:[]}))};
  });
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result));
  await rpc('trimax_complete_ocr_shadow',{p_legacy:job.legacy_attempt_id,p_lease:job.lease,p_result:result,p_error:null});
  console.log(new Date().toISOString(),id,'shadow completed');
 }catch(error){await rpc('trimax_complete_ocr_shadow',{p_legacy:job.legacy_attempt_id,p_lease:job.lease,p_result:null,p_error:error.message});console.error(new Date().toISOString(),id,'shadow failed');}
 finally {
  // Local crops are transient. Durable diagnostics/pinning use the existing DB retention.
  const privateRoot=fs.realpathSync(config.privateRoot),target=fs.realpathSync(dir);
  const relative=path.relative(privateRoot,target);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unsafe temporary cleanup path');
  fs.rmSync(target,{recursive:true});
 }
 return true;
}
(async()=>{do{try{await once();}catch(error){console.error(error.message);}if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,10000));}while(true);})().catch(()=>{process.exitCode=1;});
