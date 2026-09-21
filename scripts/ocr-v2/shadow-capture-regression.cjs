/* eslint-disable @typescript-eslint/no-require-imports -- Execute real capture handlers with browser stubs. */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8');
const start=source.indexOf('  function captureCheckImage('),end=source.indexOf('  async function applyBatchPayment()',start),handler=source.slice(start,end);
function setup(){const state={},frames=[],calls=[],bindings={file:undefined,shadowFlags:{enabled:true,nativeStill:true,businessId:'business'},businessId:'business',workspaceRole:'owner',shadowAllowed:(flags,role)=>flags.enabled&&role==='owner',captureTimings:{current:{}},opticalRef:{current:{}},scanLineage:{current:null},latestScan:{current:null},ocrAttemptVersion:{current:0},checkImagePreview:'',captureDocumentType:'remittance_stub',captureIntent:'primary',URL:{createObjectURL:()=> 'blob:returned-still',revokeObjectURL:()=>{}},clearCurrentRemittanceReviewState:()=>{},requestAnimationFrame:fn=>frames.push(fn),readPreparedRemittanceFromFile:(...args)=>calls.push(args),nativeStillInput:{current:{click:()=>calls.push('native-open')}},Date};
for(const setter of new Set(handler.match(/set[A-Z][A-Za-z]+/g)))bindings[setter]=value=>{state[setter.slice(3)]=value;};
const code=ts.transpileModule(handler+'\nreturn {captureCheckImage,openCameraCapture};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
return {handlers:new Function(...Object.keys(bindings),code)(...Object.values(bindings)),bindings,state,frames,calls};}
for(const sourceKind of ['camera','existing']){
 const x=setup(),file={name:'still.jpg',size:1024,type:'image/jpeg'};
 x.handlers.captureCheckImage(file,sourceKind,'remittance_stub','primary');
 assert.equal(x.state.CheckImagePreview,'blob:returned-still');assert.equal(x.state.PaymentEntryMode,'photo');assert.equal(x.state.CheckOcrMessage,'Processing remittance…');assert.equal(x.calls.length,0);
 x.frames.shift()();assert.equal(x.calls.length,0);x.frames.shift()();assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],file);assert.deepEqual(x.calls[0][1],{left:0,top:0,right:100,bottom:100});assert.equal(x.calls[0][7],sourceKind);
}
const native=setup();native.handlers.openCameraCapture('remittance_stub','primary');assert.deepEqual(native.calls,['native-open']);assert.notEqual(native.state.PaymentEntryMode,'camera');
const stale=setup();stale.handlers.captureCheckImage({name:'first.jpg'},'existing','remittance_stub','primary');stale.bindings.ocrAttemptVersion.current++;stale.frames.shift()();stale.frames.shift()();assert.equal(stale.calls.length,0);
const cancelled=setup();cancelled.handlers.captureCheckImage(undefined);assert.deepEqual(cancelled.state,{});
console.log('PASS actual native capture handlers: no custom overlay, immediate preview before preparation, shared Take Photo/existing intake, stale capture rejection, cancellation preservation');
