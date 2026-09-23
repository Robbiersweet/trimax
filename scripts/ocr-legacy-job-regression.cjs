/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic transport/worker failure injection. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),ts=require('typescript');
const {runJob}=require('./ocr-legacy-worker.cjs');
async function workerTest(){
 const image=Buffer.from('test image'),hash=crypto.createHash('sha256').update(image).digest('hex');
 const job={attempt_id:crypto.randomUUID(),lease:crypto.randomUUID(),source_hash:hash,input:{documentType:'remittance_stub',retryStrategy:'standard'}};
 const calls=[];let release;const pending=new Promise(resolve=>{release=resolve;});let started=false;
 const engine={progress:{withLegacyProgress:async(sink,run)=>{await sink('orientation_complete',{rotation:270});return run();}},route:{POST:async req=>{started=true;const body=await req.json();assert.equal(body.attemptId,job.attempt_id);assert(!body.history,'Worker must not use browser credentials/checkpoint');await pending;return Response.json({structuredRowEvidence:[{rowId:'row-1'}],evidence:{unchanged:true},optical:{images:['private duplicate']}});}}};
 const rpc=async(name,args)=>{calls.push({name,args});return name==='trimax_claim_ocr_legacy'?{job,optical:{images:[{base64:image.toString('base64'),mime:'image/jpeg'}]}}:null;};
 const running=runJob({},rpc,engine);await new Promise(r=>setImmediate(r));assert(started);assert(!calls.some(c=>c.args.p_stage==='complete'));
 // The processor has no HTTP request or browser owner; arbitrarily delayed completion is valid.
 if(process.argv.includes("--long")){const start=performance.now();await new Promise(r=>setTimeout(r,65000));assert(performance.now()-start>=65000);console.log("PASS real wall-clock background lifetime exceeded 65 seconds");}
 release();await running;
 const done=calls.find(c=>c.args.p_stage==='complete');assert.equal(done.args.p_status,200);assert.equal(done.args.p_payload.optical,undefined);assert.deepEqual(done.args.p_payload.evidence,{unchanged:true});
 assert(calls.every(c=>['trimax_claim_ocr_legacy','trimax_update_ocr_legacy'].includes(c.name)),'No payment or shadow writes');
 calls.length=0;engine.route.POST=async()=>{throw Error('Injected OCR failure');};await runJob({},rpc,engine);assert.equal(calls.find(c=>c.args.p_stage==='failed').args.p_payload.error,'Injected OCR failure');
 calls.length=0;job.source_hash='0'.repeat(64);await runJob({},rpc,engine);assert.match(calls.find(c=>c.args.p_stage==='failed').args.p_payload.error,/hash mismatch/);
}
async function clientTest(){
 const source=fs.readFileSync('src/app/lib/ocrLegacyJobClient.ts','utf8'),mod={exports:{}};
 const calls=[];let polls=0,elapsed=0;
 const mockedFetch=async(url,options)=>{calls.push({url,options});if(options.method==='POST')return Response.json({status:'queued'},{status:202});polls++;elapsed+=2500;if(polls===2)throw Error('network interrupted');return Response.json(polls<30?{status:'running'}:{status:'review',httpStatus:200,response:{evidence:{rows:5}}});};
 new Function('require','module','exports','fetch','setTimeout',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}}}),mod,mod.exports,mockedFetch,fn=>{fn();});
 const response=await mod.exports.waitForLegacyJob({attemptId:crypto.randomUUID(),documentType:'remittance_stub',retryStrategy:'standard'},()=>true,()=>{});
 assert(elapsed>60000);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);const result=await response.json();assert.equal(result.evidence.rows,5);assert(Number.isFinite(result.diagnostics.backgroundJob.enqueueRequestMs));assert(calls.filter(c=>c.options.method==='GET').every(c=>!c.options.body));
 // Reload resumes the same identity; the database contract makes POST idempotent.
 const id=calls[0].options.body;await mod.exports.waitForLegacyJob(JSON.parse(id),()=>true,()=>{});assert.equal(calls.filter(c=>c.options.method==='POST')[1].options.body,id);
}
(async()=>{await workerTest();await clientTest();console.log('PASS: detached completion, >60s polling, network recovery, same-ID reload, per-stage checkpoint, hash validation, OCR failure, no payment/shadow writes');})().catch(e=>{console.error(e);process.exitCode=1;});
