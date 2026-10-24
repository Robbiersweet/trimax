/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic deadlines; no network or production state. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function clock(){let now=0,id=0;const timers=new Map();return {now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),async next(){await flush();assert(timers.size,'Pending operation needs a bounded timer');now=Math.min(...[...timers.values()].map(t=>t.at));for(const [key,timer]of timers)if(timer.at<=now){timers.delete(key);timer.fn();}await flush();}};}
async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
async function settle(work,c){let done=false,result,error;Promise.resolve(work).then(value=>{result=value;done=true;},reason=>{error=reason;done=true;});await flush();for(let i=0;!done&&i<100;i++)await c.next();assert(done,'Operation must terminate');return {result,error};}
async function main(){
 const c=clock(),deadline={exports:{}};new Function('module','exports','setTimeout','clearTimeout',compile(fs.readFileSync('src/app/lib/remittanceDeadline.ts','utf8')))(deadline,deadline.exports,c.setTimeout,c.clearTimeout);
 assert.equal((await settle(deadline.exports.remittanceDeadline(Promise.resolve(7),12,'timeout'),c)).result,7);
 assert.match((await settle(deadline.exports.remittanceDeadline(new Promise(()=>{}),12,'actionable timeout'),c)).error.message,/actionable timeout/);
 for(const mode of ['success','auth-hang','request-hang','body-hang','queued-forever','worker-unavailable','stalled','failed']){
  const time=clock(),mod={exports:{}};let posts=0,polls=0;
  const session=()=>mode==='auth-hang'?new Promise(()=>{}):Promise.resolve({data:{session:{access_token:'synthetic'}}});
  const fetcher=async(_url,options)=>{if(mode==='request-hang')return new Promise(()=>{});if(options.method==='POST'){posts++;return Response.json({status:'queued'},{status:202});}polls++;if(mode==='body-hang')return {ok:true,status:200,json:()=>new Promise(()=>{})};return Response.json(mode==='worker-unavailable'?{status:'queued',processingState:'queued',workerHealth:{healthy:false}}:mode==='stalled'?{status:'running',processingState:'recoverable_stalled',workerHealth:{healthy:true}}:mode==='failed'?{status:'failed',httpStatus:422,response:{error:'Retake or enter manually'}}:mode==='queued-forever'||polls<3?{status:'running'}:{status:'review',httpStatus:200,response:{stubText:'recognized values'}});};
  new Function('require','module','exports','fetch','setTimeout','clearTimeout','performance',compile(fs.readFileSync('src/app/lib/ocrLegacyJobClient.ts','utf8')))(()=>({supabase:{auth:{getSession:session}}}),mod,mod.exports,fetcher,time.setTimeout,time.clearTimeout,{now:time.now});
  const outcome=await settle(mod.exports.waitForLegacyJob({attemptId:'synthetic',documentType:'remittance_stub',retryStrategy:'standard'},()=>true,()=>{}),time);
  if(['success','failed'].includes(mode)){assert.equal(outcome.error,undefined);assert.equal(outcome.result.status,mode==='success'?200:422);}else{assert.match(outcome.error.message,mode==='worker-unavailable'?/worker unavailable/:mode==='stalled'?/processing was interrupted/:/couldn't finish/);assert(time.now()<=90000);}
  if(mode==='queued-forever'){assert.equal(outcome.error.code,'OCR_JOB_PENDING');assert.equal(outcome.error.jobStatus,'running');}
  if(['auth-hang','request-hang','body-hang'].includes(mode))assert.equal(outcome.error.code,'OCR_STATUS_UNAVAILABLE');
  assert(posts<=1,'Polling cannot create more attempts/jobs');
 }
 const source=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8');
 const ast=ts.createSourceFile('screen.tsx',source,99,true,4);let effect;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.getText(ast).includes('processingDeadlineAt.current - Date.now()'))effect=n.getText(ast);else ts.forEachChild(n,visit);}visit(ast);assert(effect);
 const state={},version={current:3},viewClock=clock(),deadlineAt={current:120000};let cleanup;
 const render=preparing=>new Function('useEffect','checkOcrStatus','isPreparingCrop','processingEpoch','window','ocrAttemptVersion','processingDeadlineAt','Date','setIsPreparingCrop','setCheckOcrStatus','setCheckOcrMessage',compile(effect))(fn=>{cleanup=fn()},'reading',preparing,1,viewClock,version,deadlineAt,{now:viewClock.now},value=>state.preparing=value,value=>state.status=value,value=>state.message=value);
 render(true);viewClock.setTimeout(()=>{},30000);await viewClock.next();assert.equal(viewClock.now(),30000);
 cleanup();render(false);await viewClock.next();assert.equal(viewClock.now(),120000,'Preparation completion must not extend the overall deadline');assert.equal(version.current,4);assert.equal(state.preparing,false);assert.equal(state.status,'error');assert(state.message.includes('Retry'));cleanup();
 const {validate}=require('./release/physical-acceptance.cjs');
 const manifest={releaseId:'synthetic-validator-test',captureWorkflow:'guided-live-camera-v1',components:{web:{commit:'test'}},modelBundle:{sha256:'test'},database:{fingerprints:{schema:{sha256:'test'}}}};
 const evidence={kind:'installed-iphone-production',releaseId:manifest.releaseId,sourceCommit:'test',modelBundle:'test',databaseFingerprint:'test',verifiedByHuman:true,verifiedBy:'synthetic unit test',verifiedAt:'2026-01-01',productionDeploymentId:'test',attemptId:'test',captureSessionId:'test',artifacts:[{reference:'synthetic',sha256:'0'.repeat(64)}],checks:Object.fromEntries(['guidedLiveCamera','landscapeGuidance','allPaperEdgesPreserved','boundedTerminalState','installedPwa','previewBeforeProcessing','noBlackOverlay','loginStable','legacyReviewAvailable','v2DiagnosticOnly','noWrongAutomaticResult','noPaymentApplied'].map(key=>[key,true]))};
 assert.equal(validate(manifest,evidence).state,'PHYSICAL_ACCEPTANCE_PASSED');
 for(const key of Object.keys(evidence.checks)){const missing=structuredClone(evidence);delete missing.checks[key];assert.throws(()=>validate(manifest,missing),undefined,'Missing physical check '+key);}
 assert.throws(()=>validate({...manifest,captureWorkflow:undefined},evidence),/nativeStill/,'Legacy physical contracts still require native still evidence');
 console.log('PASS bounded success/failure, hung auth/fetch/body, queued OCR deadline, single enqueue, overall UI watchdog and stale attempt invalidation');
}
main().catch(error=>{console.error(error);process.exitCode=1});
