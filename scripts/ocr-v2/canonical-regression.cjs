/* eslint-disable @typescript-eslint/no-require-imports -- Execute transport and actual terminal handler with isolated dependencies. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {canonicalRequest,transportFailure}=require('../../src/app/lib/ocrCanonical.ts');
(async()=>{
 const capture={reference:'reference',sha256:'hash',storedBytes:3611430,shadowQueued:true,uploadDurationMs:20};
 assert(JSON.stringify(canonicalRequest(capture)).length<200);assert.equal(transportFailure(413,'rejected').errorClass,'FUNCTION_PAYLOAD_TOO_LARGE');
 const source=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8'),a=source.indexOf('    const complete = '),b=source.indexOf('    const initialSave',a);
 const code=ts.transpileModule(source.slice(a,b)+';return complete;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const badSummary of [false,true]){
  let saved;const bindings={completed:false,history:{attemptId:'one'},finishScan:()=>{if(badSummary)throw Error('injected');return {result:'failed'};},performance:{now:()=>50},startedAt:0,failure:transportFailure(413,'rejected'),canonical:capture,attemptVersion:1,ocrAttemptVersion:{current:2},latestScan:{current:null},retainedResponse:{},captureSnapshot:{},prepDiagnosticLines:[],persist:(summary,payload,phase)=>{saved={summary,payload,phase};return Promise.resolve(true);}};
  const complete=new Function(...Object.keys(bindings),code)(...Object.values(bindings));complete('failed',null,['HTTP 413']);await Promise.resolve();
  assert.equal(saved.phase,2);assert.equal(saved.summary.result,'failed');assert.equal(saved.payload.transport.httpStatus,413);assert.equal(saved.payload.shadowHandoff,true);assert.equal(saved.payload.canonicalCapture.sha256,'hash');
 }
 const history=fs.readFileSync('src/app/lib/ocrHistoryClient.ts','utf8');const start=history.indexOf('async function send('),end=history.indexOf('let flushing',start);let calls=[];
 const send=new Function('supabase',ts.transpileModule(history.slice(start,end)+';return send;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)({rpc:async(name,args)=>{calls.push(args);return {error:calls.length===1?{message:'Optional payload rejected'}:null};}});
 await send({businessId:'b',phase:2,summary:{attemptId:'a',originalId:'a',parentId:null,result:'failed'},payload:{canonicalCapture:capture,transport:transportFailure(413,'rejected')}});
 assert.equal(calls.length,2);assert.equal(calls[1].p_phase,2);assert.equal(calls[1].p_payload.transport.httpStatus,413);
 assert(source.includes('if(retainedAttemptId)'));assert(!source.includes('JSON.stringify({ imageDataUrl, documentType, retryStrategy, attemptId'));
 console.log('PASS reference-only request, exact HTTP 413 evidence, terminal persistence despite summary failure, diagnostic fallback, no payment replay');
})().catch(e=>{console.error(e);process.exitCode=1;});
