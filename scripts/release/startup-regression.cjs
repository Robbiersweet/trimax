/* eslint-disable @typescript-eslint/no-require-imports -- Never starts an operational worker; invalid configuration must exit before any claim. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');const {hash,verifyModels}=require('./contract.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-startup-denial-')),config=path.join(root,'invalid.json');fs.writeFileSync(config,JSON.stringify({supabaseUrl:'http://127.0.0.1:1',businessId:'wrong',privateRoot:root,anonKey:'not-a-service-role-key',workerKey:'synthetic',wslDistribution:'Ubuntu',python:'/invalid/python'}));
for(const worker of ['scripts/ocr-legacy-worker.cjs','scripts/ocr-v2/shadow-worker.cjs']){const result=cp.spawnSync(process.execPath,['--experimental-strip-types',worker,config,'--once'],{encoding:'utf8',timeout:60000,windowsHide:true});assert.notEqual(result.status,0);assert.match(result.stderr,/RUNTIME DRIFT DETECTED/);assert(!result.stdout.includes('completed'));}
const model=path.join(root,'model.bin');fs.writeFileSync(model,'frozen');const manifest={models:[{name:'fake',runtime:'node',path:model,engines:['legacy'],sha256:hash(Buffer.from('frozen'))}]};assert.deepEqual(verifyModels(manifest,'legacy',{}),[]);fs.writeFileSync(model,'changed');assert(verifyModels(manifest,'legacy',{}).some(x=>x.includes('mismatch')));console.log('Both workers refuse invalid release configuration before claim; changed model bytes rejected');
(async()=>{
 const {validatedWorker}=require('./worker-validation.cjs');
 const unavailable=()=>Object.assign(Error('HTTP 500'),{code:'ATTESTATION_TEMPORARILY_UNAVAILABLE'});
 let validations=0,claims=0;const waits=[];
 const attestation=await validatedWorker({},'legacy',{validate:async()=>{validations++;if(validations<4)throw unavailable();return {validated:true};},wait:async ms=>{waits.push(ms);assert.equal(claims,0);},warn:()=>{}});
 assert.equal(attestation.validated,true);claims++;assert.equal(validations,4);assert.deepEqual(waits,[5000,10000,20000]);
 for(const error of [Error('RUNTIME DRIFT DETECTED: model changed'),Object.assign(Error('Invalid credential'),{code:'401'}),Object.assign(Error('Missing RPC'),{code:'DEPLOYMENT_PREREQUISITE'})]){
  await assert.rejects(validatedWorker({},'legacy',{validate:async()=>{throw error;},wait:async()=>assert.fail('Permanent denial retried'),warn:()=>{}}),e=>e===error);
 }
 let checks=0;await assert.rejects(validatedWorker({},'legacy',{validate:async()=>{if(checks++===0)throw unavailable();throw Error('RUNTIME DRIFT DETECTED: changed during outage');},wait:async()=>{},warn:()=>{}}),/changed during outage/);
 console.log('PASS: transient HTTP500 pauses without claims, fresh validation recovers, actual drift and credential denial stay fatal');
})().catch(error=>{console.error(error);process.exitCode=1;});
(async()=>{
 const source=fs.readFileSync('scripts/release/contract.cjs','utf8');
 const fn=source.slice(source.indexOf('async function validateStartup('),source.indexOf('\nfunction scoreDocument('));
 const validate=new Function('validateLocalRuntime','compareDatabase','fetch',fn+';return validateStartup;');
 const invoke=fetcher=>validate(()=>({}),()=>[],fetcher)({},'legacy');
 for(const status of [408,429,500,502,503,504])await assert.rejects(invoke(async()=>Response.json({}, {status})),e=>e.code==='ATTESTATION_TEMPORARILY_UNAVAILABLE');
 for(const status of [400,401,403])await assert.rejects(invoke(async()=>Response.json({}, {status})),e=>!e.code);
 await assert.rejects(invoke(async()=>Response.json({code:'PGRST202'},{status:404})),e=>e.code==='DEPLOYMENT_PREREQUISITE');
 await assert.rejects(invoke(async()=>{throw Error('network failure');}),e=>e.code==='ATTESTATION_TEMPORARILY_UNAVAILABLE');
 await assert.rejects(validate(()=>({}),()=>['Database schema fingerprint mismatch'],async()=>Response.json({}))({},'legacy'),/fingerprint mismatch/);
 console.log('PASS: actual attestation transport classifies only temporary outages for retry; HTTP401/403 and fingerprint drift stay denied');
})().catch(error=>{console.error(error);process.exitCode=1;});
