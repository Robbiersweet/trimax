/* eslint-disable @typescript-eslint/no-require-imports -- Execute the real observer, review-status JSX and watchdog against retained production timings. */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const timing=require('./fixtures/late-remittance-job.json');
const compile=(source,tsx=false)=>ts.transpileModule(source,{fileName:tsx?'view.tsx':'test.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function flush(){for(let i=0;i<60;i++)await Promise.resolve();}
function clock(){let now=0,id=0;const timers=new Map();return {now:()=>now,timers,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:key=>timers.delete(key),async next(){await flush();assert(timers.size,'Awaited operations must have a deadline');now=Math.min(...[...timers.values()].map(t=>t.at));for(const [key,timer]of timers)if(timer.at<=now){timers.delete(key);timer.fn();}await flush();}};}
async function settle(work,time){let done=false,result,error;Promise.resolve(work).then(value=>{done=true;result=value;},reason=>{done=true;error=reason;});await flush();for(let i=0;!done&&i<2000;i++)await time.next();assert(done,'Observer must terminate');return {result,error};}
function loadClient(time,fetcher,session=async()=>({data:{session:{access_token:'isolated-test'}}})){
 const mod={exports:{}};
 new Function('require','module','exports','fetch','setTimeout','clearTimeout','performance',compile(fs.readFileSync('src/app/lib/ocrLegacyJobClient.ts','utf8')))(()=>({supabase:{auth:{getSession:session}}}),mod,mod.exports,fetcher,time.setTimeout,time.clearTimeout,{now:time.now});return mod.exports;
}
const source=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8'),ast=ts.createSourceFile('view.tsx',source,99,true,4);
let waitCall,watchdog;const views=[];
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='waitForLegacyJob')waitCall=n;if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.getText(ast).includes('processingDeadlineAt.current - Date.now()'))watchdog=n.getText(ast);if(ts.isJsxExpression(n)&&n.expression){const t=n.getText(ast).trim();if(t.startsWith('{checkOcrStatus === "reading" ?')&&t.includes('animate-spin')||t.startsWith('{checkOcrStatus === "background" ?')&&t.includes('role="status"'))views.push(t);}ts.forEachChild(n,visit);}visit(ast);
assert(waitCall?.arguments.length===5);assert(watchdog);assert.equal(views.length,2);
const jsx={exports:{}};new Function('require','module','exports',compile('exports.View=({checkOcrStatus,checkOcrMessage})=><>'+views.join('')+'</>;',true))(require,jsx,jsx.exports);
const render=state=>require('react-dom/server').renderToStaticMarkup(jsx.exports.View({checkOcrStatus:state.status,checkOcrMessage:state.message}));
function callback(node,bindings){const mod={exports:{}};new Function('module','exports',...Object.keys(bindings),compile('module.exports=('+node.getText(ast)+');'))(mod,mod.exports,...Object.values(bindings));return mod.exports;}
async function lateJob(){
 const time=clock(),version={current:7},observing={current:7},deadline={current:120000};const state={status:'reading',preparing:true,message:'Reading remittance'};let cleanup,backgroundAt,backgroundMarkup;
 const bindings={attemptVersion:7,ocrAttemptVersion:version,setIsPreparingCrop:value=>state.preparing=value,setCheckOcrStatus:value=>state.status=value,setCheckOcrMessage:value=>state.message=value,setScanSavedStatus:value=>state.scanStatus=value};
 const effect=()=>new Function('useEffect','checkOcrStatus','isPreparingCrop','processingEpoch','window','ocrAttemptVersion','processingDeadlineAt','observingLegacyVersion','Date','setIsPreparingCrop','setCheckOcrStatus','setCheckOcrMessage',compile(watchdog))(fn=>{cleanup=fn()},state.status,state.preparing,1,time,version,deadline,observing,{now:time.now},bindings.setIsPreparingCrop,bindings.setCheckOcrStatus,bindings.setCheckOcrMessage);
 effect();assert(render(state).includes('animate-spin'));
 const background=callback(waitCall.arguments[4],bindings),progress=callback(waitCall.arguments[2],bindings);const calls=[];
 const client=loadClient(time,async(url,options)=>{calls.push({url,method:options.method,body:options.body});assert(url.startsWith('/api/payments/ocr-jobs'));if(options.method==='POST')return Response.json({status:'queued'},{status:202});return Response.json(time.now()<timing.terminalMs?{status:'running',workerHealth:{healthy:true},claims:1}:{status:'review',httpStatus:200,response:{stubText:'Two observed rows; uncertain headers require review',checkNumber:null,checkDate:null,payor:null,totalEvidence:{payable:false}},timings:timing});});
 const outcome=await settle(client.waitForLegacyJob({attemptId:'same-retained-attempt',documentType:'remittance_stub',retryStrategy:'standard'},()=>version.current===7,progress,undefined,()=>{backgroundAt=time.now();background();cleanup?.();effect();backgroundMarkup=render(state);}),time);
 assert.equal(outcome.error,undefined);assert.equal(backgroundAt,45000);assert(!backgroundMarkup.includes('animate-spin'));assert(backgroundMarkup.includes('No payment has been applied'));assert.equal(version.current,7,'Late completion must not be invalidated by a foreground timeout');assert(time.now()>90000&&time.now()<=timing.terminalMs+5000);const result=await outcome.result.json();assert.equal(result.totalEvidence.payable,false,'Observer must never invent missing OCR authority');assert.equal(result.payor,null);assert(state.scanStatus.includes('Review ready'));assert.equal(calls.filter(x=>x.method==='POST').length,1);assert(calls.filter(x=>x.method==='GET').every(x=>x.url.endsWith('same-retained-attempt')&&!x.body));assert.equal(time.timers.size,0);
 // A suspended PWA can run its old foreground watchdog before a React cleanup.
 const resumed=clock(),state2={status:'reading',preparing:true},v={current:9};let clean;
 new Function('useEffect','checkOcrStatus','isPreparingCrop','processingEpoch','window','ocrAttemptVersion','processingDeadlineAt','observingLegacyVersion','Date','setIsPreparingCrop','setCheckOcrStatus','setCheckOcrMessage',compile(watchdog))(fn=>{clean=fn()},'reading',true,1,resumed,v,{current:120000},{current:9},{now:resumed.now},value=>state2.preparing=value,value=>state2.status=value,value=>state2.message=value);
 await resumed.next();assert.equal(v.current,9);assert.equal(state2.status,'background');assert.equal(state2.preparing,false);clean();
}
async function otherStates(){
 for(const mode of ['recovered','failed','lost-enqueue-ack','missing-result','cancelled']){
  const time=clock(),calls=[],messages=[];let current=true,backgrounds=0;
  if(mode==='cancelled')time.setTimeout(()=>{current=false},60000);
  const client=loadClient(time,async(url,options)=>{calls.push({url,method:options.method});if(options.method==='POST'){if(mode==='lost-enqueue-ack')throw Error('ack lost after durable enqueue');return Response.json({status:'queued'},{status:202});}if(mode==='missing-result')return Response.json({status:'review',httpStatus:200,response:null});if(mode==='lost-enqueue-ack'||time.now()>=160000)return Response.json(mode==='failed'?{status:'failed',httpStatus:503,response:{error:'Worker recovery exhausted; saved photo retained'}}:{status:'review',httpStatus:200,response:{stubText:'Retained result'}});return Response.json(time.now()<20000?{status:'running',workerHealth:{healthy:false}}:time.now()<60000?{status:'running',processingState:'recoverable_stalled'}:{status:'running',workerHealth:{healthy:true}});});
  const out=await settle(client.waitForLegacyJob({attemptId:'same-job',documentType:'remittance_stub',retryStrategy:'standard'},()=>current,m=>messages.push(m),undefined,()=>backgrounds++),time);
  if(mode==='cancelled'){assert.equal(out.error.code,'OCR_VIEW_REPLACED');assert.equal(backgrounds,1);}else if(mode==='missing-result'){assert.equal(out.error.code,'OCR_RESULT_UNAVAILABLE');assert.equal(backgrounds,0);}else{assert.equal(out.error,undefined);assert.equal(out.result.status,mode==='failed'?503:200);if(mode==='recovered'){assert(messages.some(m=>m.includes('recovering the same saved scan')));assert(messages.some(m=>m.includes('worker unavailable')));}}
  assert.equal(calls.filter(x=>x.method==='POST').length,1,'Recovery observes the same job without creating another capture');
 }
}
async function historyBodyDeadline(){
 const time=clock(),deadline={exports:{}},mod={exports:{}};
 new Function('module','exports','setTimeout','clearTimeout',compile(fs.readFileSync('src/app/lib/remittanceDeadline.ts','utf8')))(deadline,deadline.exports,time.setTimeout,time.clearTimeout);
 new Function('require','module','exports','fetch',compile(fs.readFileSync('src/app/lib/savedRemittancePaymentClient.ts','utf8')))(name=>name.includes('remittanceDeadline')?deadline.exports:{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}}},mod,mod.exports,async()=>({ok:true,json:()=>new Promise(()=>{})}));
 const out=await settle(mod.exports.savedRemittancePayment('business','retained'),time);assert.equal(time.now(),30000);assert.match(out.error.message,/history lookup timed out/);
}
(async()=>{await lateJob();await otherStates();await historyBodyDeadline();console.log('PASS actual 96.9s retained-job timing: 45s finite spinner, automatic late review, suspended-PWA watchdog, same-ID recovery/reopen, worker offline/stalled/failure, cancellation, lost enqueue acknowledgement, missing terminal result, bounded history body, no invented authority or payment requests.');})().catch(error=>{console.error(error);process.exitCode=1});
