/* eslint-disable @typescript-eslint/no-require-imports -- Execute real capture handlers with browser stubs. */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8');
const start=source.indexOf('  function captureCheckImage('),end=source.indexOf('  async function applyBatchPayment()',start),handler=source.slice(start,end);
function setup(overrides={}){const state={},frames=[],calls=[],bindings={Image:class {set src(_value){this.onload();}},file:undefined,shadowFlags:{enabled:true,nativeStill:true,businessId:'business'},businessId:'business',workspaceRole:'owner',shadowAllowed:(flags,role)=>flags.enabled&&role==='owner',captureTimings:{current:{}},captureUi:{current:null},selectCapture:require('../../src/app/lib/captureRouting.ts').selectCapture,process:{env:{NEXT_PUBLIC_TRIMAX_BUILD:'test'}},stopCameraCapture:()=>calls.push('stop-camera'),opticalRef:{current:{}},scanLineage:{current:null},latestScan:{current:null},ocrAttemptVersion:{current:0},checkImagePreview:'',captureDocumentType:'remittance_stub',captureIntent:'primary',URL:{createObjectURL:()=> 'blob:returned-still',revokeObjectURL:()=>{}},clearCurrentRemittanceReviewState:()=>{},requestAnimationFrame:fn=>frames.push(fn),readPreparedRemittanceFromFile:(...args)=>calls.push(args),nativeStillInput:{current:{click:()=>calls.push('native-open')}},Date};
for(const setter of new Set(handler.match(/set[A-Z][A-Za-z]+/g)))bindings[setter]=value=>{state[setter.slice(3)]=value;};
Object.assign(bindings,overrides);
const code=ts.transpileModule(handler+'\nreturn {captureCheckImage,openCameraCapture};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
return {handlers:new Function(...Object.keys(bindings),code)(...Object.values(bindings)),bindings,state,frames,calls};}
for(const sourceKind of ['camera','existing']){
 const x=setup(),file={name:'still.jpg',size:1024,type:'image/jpeg'};
 x.handlers.captureCheckImage(file,sourceKind,'remittance_stub','primary');
 assert.equal(x.state.CheckImagePreview,'blob:returned-still');assert.equal(x.state.PaymentEntryMode,'photo');assert.equal(x.state.CheckOcrMessage,'Processing remittance…');assert.equal(x.calls.length,1);
 x.frames.shift()();assert.equal(x.calls.length,1);x.frames.shift()();assert.equal(x.calls.length,2);assert.equal(x.calls[1][0],file);assert.deepEqual(x.calls[1][1],{left:0,top:0,right:100,bottom:100});assert.equal(x.calls[1][7],sourceKind);
}
const native=setup();native.handlers.openCameraCapture('remittance_stub','primary');assert.deepEqual(native.calls,['native-open']);assert.notEqual(native.state.PaymentEntryMode,'camera');
const stale=setup();stale.handlers.captureCheckImage({name:'first.jpg'},'existing','remittance_stub','primary');stale.bindings.ocrAttemptVersion.current++;stale.frames.shift()();stale.frames.shift()();assert.deepEqual(stale.calls,['stop-camera']);
const cancelled=setup();cancelled.handlers.captureCheckImage(undefined);assert.deepEqual(cancelled.state,{});
console.log('PASS actual native capture handlers: no custom overlay, immediate preview before preparation, shared Take Photo/existing intake, stale capture rejection, cancellation preservation');

for(const [name,overrides] of Object.entries({loading:{shadowFlags:{enabled:false,nativeStill:false,businessId:''}},failed:{shadowFlags:{enabled:false,nativeStill:false,businessId:'business',readError:'offline'}},roleLoading:{workspaceRole:undefined},workspaceLoading:{businessId:undefined},disabled:{shadowFlags:{enabled:false,nativeStill:false,businessId:'business'}},workerOffline:{workerAvailable:false}})){
 const x=setup(overrides);x.handlers.openCameraCapture();assert.deepEqual(x.calls,['native-open'],name);assert.equal(x.bindings.captureUi.current.selection.implementation,'native-still');assert.notEqual(x.state.PaymentEntryMode,'camera');
 const selected=x.bindings.captureUi.current.selection;x.bindings.shadowFlags.enabled=!x.bindings.shadowFlags.enabled;
 x.handlers.captureCheckImage({name:'still.jpg'},'camera');assert.strictEqual(x.bindings.captureUi.current.selection,selected);assert(Object.isFrozen(selected));assert(Object.isFrozen(selected.openingState));assert.equal(x.state.PaymentEntryMode,'photo');assert.equal(x.state.IsCapturingFrame,false);
}
const missing=setup({nativeStillInput:{current:null}});missing.handlers.openCameraCapture();assert.equal(missing.state.CheckOcrStatus,'error');assert(!missing.calls.includes('native-open'));assert.notEqual(missing.state.PaymentEntryMode,'camera');assert(missing.bindings.captureUi.current.fallbackReason);
const switchToFile=setup();switchToFile.handlers.openCameraCapture();switchToFile.handlers.captureCheckImage({name:'saved.jpg'},'existing');assert.equal(switchToFile.bindings.captureUi.current.selection.implementation,'existing-photo');
const stop=source.slice(source.indexOf('  function stopCameraCapture('),source.indexOf('  function handleCameraModeSelection('));assert(stop.includes("if(keepProcessing)setPaymentEntryMode('photo')"));assert(stop.includes('setIsCapturingFrame(false)'));assert(!stop.includes('if (!keepProcessing) setIsCapturingFrame'));
assert(!handler.includes('setPaymentEntryMode("camera")'));assert(!handler.includes('shadowFlags.nativeStill)'));assert(!handler.includes('Owner/admin native still intake'));assert(source.includes('Remittance composition guide'));
console.log('PASS loaded/loading/failed flags, missing role/workspace, worker offline, shadow disabled, immutable selection, explicit picker failure, custom stop dismissal and advisory guide');
