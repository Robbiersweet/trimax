/* eslint-disable @typescript-eslint/no-require-imports -- Private offline production-pipeline replay. No DB/network payment client. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {hash}=require('./contract.cjs');
const input=JSON.parse(fs.readFileSync(process.argv[2])),out=process.argv[3];
// Only image identity and frozen business snapshot reach inference. No scoring labels or expected values.
if(Object.keys(input).some(k=>!['id','image','sha256','snapshot','engine'].includes(k)))throw Error('Scoring truth cannot enter inference');
fs.mkdirSync(out,{recursive:true});
(async()=>{const bytes=fs.readFileSync(input.image);if(hash(bytes)!==input.sha256)throw Error('Source image changed');let result;const start=performance.now();
 if(input.engine==='v2-shadow'){const {runShadowPipeline}=require('../../src/app/lib/ocrV2/shadow/pipeline.ts');result=await runShadowPipeline(bytes,{attemptId:input.id,captureSessionId:crypto.randomUUID(),sourceImageHash:input.sha256,build:'offline-release-gate',snapshot:input.snapshot},require('./recognizer-adapter.cjs')(out));}
 else {
  const {loadEngine}=require('../ocr-legacy-worker.cjs'),{createMatureOpticalAdapter}=require('../ocr-mature-optical-adapter.cjs');
  const engine=loadEngine(),checkpoints=[],manifest=require('../../release/trimax-release-manifest.json');
  // The worker-only optical capability receives no business records or scoring truth.
  const opticalConfig={matureFallbackEnabled:true,python:manifest.workerConfiguration.python,wslDistribution:manifest.workerConfiguration.wslDistribution,privateRoot:path.join(out,'mature-transient')};
  const runMature=(image,attemptId)=>engine.maturePipeline.runShadowPipeline(image,{attemptId,captureSessionId:crypto.randomUUID(),sourceImageHash:hash(image),build:'offline-release-gate',snapshot:{label:'Optical fallback without business records',provenance:[],invoices:[],activities:[],receivedDate:''}},createMatureOpticalAdapter(opticalConfig));
  const response=await engine.matureContext.withLegacyMatureFallback(runMature,()=>engine.progress.withLegacyProgress(async(stage,evidence)=>{checkpoints.push(stage);fs.writeFileSync(path.join(out,stage+'.json'),JSON.stringify(evidence));},()=>engine.route.POST(new Request('http://offline.invalid/extract',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-observation-scope':crypto.randomUUID()},body:JSON.stringify({attemptId:crypto.randomUUID(),imageDataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),documentType:'remittance_stub',retryStrategy:'standard'})}))));
  result={status:response.status,result:await response.json(),checkpoints};delete result.result.optical;
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({engine:input.engine,sourceImageHash:input.sha256,durationMs:performance.now()-start,result}));console.log(input.id,input.engine,'completed');})().catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.message}));console.error(e);process.exitCode=1;});
