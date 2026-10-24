/* eslint-disable @typescript-eslint/no-require-imports -- Execute real loader, route, reopen handler and render with isolated read-only adapters. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
process.env.NEXT_PUBLIC_SUPABASE_URL='https://isolated.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='isolated-test';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-server-test';
const business = '11111111-1111-1111-1111-111111111111', original = '22222222-2222-2222-2222-222222222222', replay = '33333333-3333-3333-3333-333333333333';
const audits = ['a','b','c'].map((id,i)=>({id:`audit${i}`,business_id:business,action:'invoice.batch_payment_applied',entity_id:id,entity_label:`INV-053${i+6}`,created_at:'2026-10-22T10:00:00Z',details:{businessId:business,sourceOcrAttemptId:original,paymentAttachmentId:'attachment',paymentReference:'717',checkDate:'2026-10-01',receivedDate:'2026-10-22',payor:'Glen at North Creek',checkAmount:4286.1,amountApplied:1428.7,batchInvoiceCount:3,paymentOutcome:'paid'}}));
let scenario = {}, reads = [], clientRoles = [];
function query(table) {
  const filters = []; let selection = '', bounds, cap;
  const q = {select(s){selection=s;return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},range(a,b){bounds=[a,b];return q;},limit(n){cap=n;return q;},
    result(single=false){
      reads.push({table,selection,filters:[...filters],bounds});
      if(scenario.errorTable===table || (table==='activity_logs'&&bounds?.[0]===scenario.errorOffset))return {data:null,error:{message:'isolated lookup failure'}};
      let data;
      if(table==='ocr_attempts')data=selection==='id,summary'?[{id:original,summary:{canonicalReference:original,sourceImageHash:scenario.sourceMismatch?'different-hash':'same-image-hash'}}]:[{id:replay,business_id:business,original_id:original,parent_id:original,summary:{canonicalReference:'new-object',sourceImageHash:'new-hash'}}];
      else if(table==='ocr_legacy_jobs')data=selection==='attempt_id'?(scenario.familyOverflow?Array.from({length:101},(_,i)=>({attempt_id:`family${i}`})):scenario.fresh?[{attempt_id:replay}]:[{attempt_id:original},{attempt_id:replay}]):scenario.noJob?[]:[{attempt_id:replay,source_reference:scenario.fresh?'new-object':original,source_hash:scenario.fresh?'new-hash':'same-image-hash'}];
      else if(table==='activity_logs')data=scenario.activities??audits;
      else if(table==='ocr_attempt_diagnostics')data=[];
      else throw Error(`Unexpected table ${table}; historical lookup must not read invoice balances`);
      if(table==='ocr_attempts'&&selection==='id,summary'&&scenario.fresh)data=[];
      if(table==='activity_logs')data=data.filter(row=>filters.every(([key,value])=>row[key]===value));
      if(bounds)data=data.slice(bounds[0],bounds[1]+1);if(cap)data=data.slice(0,cap);
      return {data:single?(data[0]??null):data,error:null};
    },maybeSingle(){return Promise.resolve(q.result(true));},then(resolve,reject){return Promise.resolve(q.result()).then(resolve,reject);},
    insert(){throw Error('No writes allowed');},update(){throw Error('No writes allowed');},delete(){throw Error('No writes allowed');}};
  return q;
}
const fake = {from:query,auth:{getUser:async()=>({data:{user:scenario.signedOut?null:{id:'owner'}},error:null})},rpc:async(name,args)=>{assert.equal(name,'trimax_is_business_admin');assert.equal(args.target_business_id,business);return {data:scenario.denied?false:true,error:null};}};
function modules() {
  const cache=new Map();
  function load(file){if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const req=spec=>{if(spec==='@supabase/supabase-js')return {createClient:(_url,key)=>{clientRoles.push(key);return key==='isolated-server-test'?fake:{...fake,from(){throw Error('Authenticated role has no durable-job SELECT grant');}};}};if(!spec.startsWith('.'))return require(spec);const base=path.resolve(path.dirname(file),spec);const target=[base,base+'.ts',base+'.tsx',base+'/index.ts'].find(x=>fs.existsSync(x)&&fs.statSync(x).isFile());assert(target,spec);return load(target);};new Function('require','module','exports',js)(req,m,m.exports);return m.exports;}
  return load;
}
const load=modules(), loader=load(path.resolve('src/app/lib/savedRemittancePaymentServer.ts')).loadSavedRemittancePayment;
const get=load(path.resolve('src/app/api/payments/saved-remittance/route.ts')).GET;
const screen=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8'), ast=ts.createSourceFile('screen.tsx',screen,99,true,4);
const functions={};function visit(n){if(ts.isFunctionDeclaration(n)&&['openSavedRemittance','resetCheckCaptureState','clearNewRemittanceReviewState','clearCurrentRemittanceReviewState'].includes(n.name?.text))functions[n.name.text]=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
function reopen(overrides={}){
  const state={setSelectedIds:['stale-selection']}, opticalCalls=[], ocrCalls=[];
  const bindings={businessId:business,ocrAttemptVersion:{current:0},resumedDiagnosticReplay:{current:false},scanLineage:{current:null},latestScan:{current:null},preparedCaptureRef:{current:null},sourceSelectionRef:{current:[]},observationScopeRef:{current:''},opticalRef:{current:{}},checkImagePreview:'',crypto:require('node:crypto').webcrypto,URL,
    savedRemittancePayment:async()=>({status:'applied',attemptId:replay}),scanOptical:async(reference)=>{opticalCalls.push(reference);return {images:[{sha256:'hash',base64:'YWJj',mime:'image/jpeg'}]};},remittanceDeadline:promise=>promise,extractCheckStubFromPhoto:async(...args)=>ocrCalls.push(args),...overrides};
  const source=Object.values(functions).join('\n');
  for(const name of new Set(source.match(/set[A-Z][A-Za-z]+/g)))bindings[name]=v=>{state[name]=typeof v==='function'?v(state[name]):v;};
  const js=ts.transpileModule(source+'\nreturn openSavedRemittance;',{compilerOptions:{target:99}}).outputText;
  return {run:new Function(...Object.keys(bindings),js)(...Object.values(bindings)),state,bindings,opticalCalls,ocrCalls};
}
const job={attemptId:replay,input:{diagnosticReplay:true,documentType:'remittance_stub',retryStrategy:'standard'},summary:{canonicalReference:original,sourceImageHash:'hash'}};
async function main(){
  scenario={};reads=[];const result=await loader(fake,business,replay);assert.equal(result.status,'applied');assert.equal(result.match,'source_attempt');assert.equal(result.payment.allocations.length,3);assert.equal(result.payment.amount,4286.1);
  assert(reads.every(r=>r.table==='ocr_attempt_diagnostics'||r.filters.some(([k,v])=>k==='business_id'&&v===business)));
  const family=reads.find(r=>r.table==='ocr_legacy_jobs'&&r.selection==='attempt_id');assert(family.filters.some(([k,v])=>k==='source_reference'&&v===original));assert(family.filters.some(([k,v])=>k==='source_hash'&&v==='same-image-hash'));
  scenario={fresh:true};reads=[];assert.equal((await loader(fake,business,replay)).status,'none','Fresh photo original_id/parent_id cannot inherit a payment.');
  scenario={noJob:true};assert.equal((await loader(fake,business,replay)).status,'none','Summary canonical identity without durable same-hash family cannot establish lineage.');
  const fillers=Array.from({length:500},(_,i)=>({...audits[0],id:`unrelated${i}`,details:{...audits[0].details,sourceOcrAttemptId:'unrelated',paymentAttachmentId:`unrelated${i}`}}));
  scenario={activities:[...fillers,...audits]};reads=[];assert.equal((await loader(fake,business,replay)).status,'applied');assert.deepEqual(reads.filter(r=>r.table==='activity_logs').map(r=>r.bounds),[[0,499],[500,999]],'Complete stable pagination finds history beyond first page.');
  scenario={activities:[...fillers,...audits],errorOffset:500};await assert.rejects(()=>loader(fake,business,replay),'A failed later audit page cannot promote incomplete payment history.');
  scenario={activities:Array.from({length:10000},(_,i)=>({...fillers[0],id:`long${i}`}))};await assert.rejects(()=>loader(fake,business,replay),/too large/,'History lookup cap fails closed instead of silently truncating.');
  scenario={activities:audits.map(r=>({...r,business_id:'foreign-business'}))};assert.equal((await loader(fake,business,replay)).status,'none');
  for(const errorTable of ['ocr_attempts','ocr_legacy_jobs','activity_logs','ocr_attempt_diagnostics']){scenario={errorTable,activities:[]};await assert.rejects(()=>loader(fake,business,replay));}
  scenario={familyOverflow:true};await assert.rejects(()=>loader(fake,business,replay));
  scenario={sourceMismatch:true};await assert.rejects(()=>loader(fake,business,replay),/canonical source/);
  async function request(options={},auth=true,search=`businessId=${business}&attemptId=${replay}`){scenario=options;reads=[];clientRoles=[];return get(new Request('https://production.invalid/api/payments/saved-remittance?'+search,{headers:auth?{authorization:'Bearer isolated'}:{}}));}
  let res=await request({},false);assert.equal(res.status,401);assert.equal(reads.length,0);
  res=await request({},true,'businessId=bad&attemptId=bad');assert.equal(res.status,400);
  res=await request({signedOut:true});assert.equal(res.status,401);assert.equal(reads.length,0);
  res=await request({denied:true});assert.equal(res.status,403);assert.equal(reads.length,0);
  assert.deepEqual(clientRoles,['isolated-test'],'Denied users cannot construct the privileged history reader.');
  res=await request();assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).status,'applied');
  assert.deepEqual(clientRoles,['isolated-test','isolated-server-test'],'Verified owner lookup uses the existing server credential for worker-only ancestry, without expanding table grants.');
  res=await request({errorTable:'activity_logs'});assert.equal(res.status,503);assert.match((await res.json()).error,/retained/);
  for(const status of ['applied','ambiguous']){const ui=reopen({savedRemittancePayment:async()=>({status,attemptId:replay})});await ui.run(job);assert.equal(ui.state.setSavedPaymentHistory.status,status);assert.deepEqual(ui.state.setSelectedIds,[]);assert.equal(ui.opticalCalls.length,0);assert.equal(ui.ocrCalls.length,0);assert.equal(ui.state.setPaymentConfirmation,null);}
  for(const status of ['none','reversed']){const ui=reopen({savedRemittancePayment:async()=>({status,attemptId:replay})});await ui.run(job);assert.equal(ui.opticalCalls.length,1);assert.equal(ui.ocrCalls.length,1);assert.equal(ui.ocrCalls[0][7].history,job.summary);}
  const failed=reopen({savedRemittancePayment:async()=>{throw Error('History offline');}});await failed.run(job);assert.equal(failed.opticalCalls.length,0);assert.equal(failed.ocrCalls.length,0);assert.deepEqual(failed.state.setSelectedIds,[]);assert.equal(failed.state.setToast.type,'error');
  let release;const stale=reopen({savedRemittancePayment:()=>new Promise(r=>{release=r;})});const pending=stale.run(job);stale.bindings.ocrAttemptVersion.current++;release({status:'applied'});await pending;assert.equal(stale.state.setSavedPaymentHistory,null);assert.equal(stale.opticalCalls.length,0);
  let failLater;const staleFailure=reopen({savedRemittancePayment:()=>new Promise((_,reject)=>{failLater=reject;})});const failurePending=staleFailure.run(job);staleFailure.bindings.ocrAttemptVersion.current++;failLater(Error('Old request failed'));await failurePending;assert.equal(staleFailure.state.setToast,undefined,'Old lookup failures cannot overwrite the newer scan.');
  let finishImage;const staleImage=reopen({savedRemittancePayment:async()=>({status:'none'}),scanOptical:()=>new Promise(r=>{finishImage=r;})});const imagePending=staleImage.run(job);await new Promise(r=>setImmediate(r));staleImage.bindings.ocrAttemptVersion.current++;finishImage({images:[{sha256:'hash',base64:'YWJj',mime:'image/jpeg'}]});await imagePending;assert.equal(staleImage.ocrCalls.length,0);
  const React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
  const {SavedRemittancePaymentView:View}=load(path.resolve('src/app/components/SavedRemittancePaymentView.tsx'));
  const html=renderToStaticMarkup(React.createElement(View,{history:{...result,reasons:[],canonicalReference:original,sourceImageHash:'hash'}}));
  assert.match(html,/Payment already applied/);assert.match(html,/4,?286\.10|4286\.10/);for(const inv of ['INV-0536','INV-0537','INV-0538'])assert(html.includes(inv));assert(!/<button|Confirm and Apply|applyBatchPayment/.test(html),'Historical view has no apply control');assert.match(html,/audit0/);
  console.log('PASS actual saved-remittance loader/API/reopen handler/history render: scoped exact canonical lineage, complete pagination, fail-closed reads, auth, immutable historical allocations, no OCR on applied, safe normal resume and stale completions; no writes');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
