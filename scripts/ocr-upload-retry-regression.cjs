/* eslint-disable @typescript-eslint/no-require-imports -- Execute production handlers with isolated transport fault injection; no live requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),cp=require('node:child_process');
function load(file,deps={},source=fs.readFileSync(file,'utf8')){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99}}).outputText)(n=>deps[n]??require(n),m,m.exports);return m.exports;}
const canonical=load('src/app/lib/ocrCanonical.ts'),history=require('../src/app/lib/ocrHistory.ts');
const screen=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8');
const baseline=cp.execFileSync('git',['show','52dfc56445229c055a6b9fa90727b1be7116798f:src/app/components/BatchInvoicePayments.tsx'],{encoding:'utf8',windowsHide:true});
function handler(source,options={}){
 const start=source.indexOf('async function extractCheckStubFromPhotoEvent('),end=source.indexOf('\n  });',start);
 assert(start>0&&end>start);const fn=source.slice(start,end)+'\n}';
 const state={},messages=[],saves=[],uploads=[],jobs=[],jobIds=new Set();
 const b={...canonical,...history,checkOcrStatus:'error',processingDeadlineAt:{current:0},beginProcessingWindow(){b.processingDeadlineAt.current=1;},ocrAttemptVersion:{current:0},captureDocumentType:'remittance',captureIntent:'full_remittance',lastOcrPrepDiagnosticLines:[],remittanceDocumentFingerprint:'',scanLineage:{current:null},observationScopeRef:{current:null},preparedCaptureRef:{current:null},lastOcrSourceType:'camera',captureUi:{current:null},latestScan:{current:null},shadowFlags:{businessId:'',enabled:false},businessId:'business',workspaceRole:'owner',captureTimings:{current:{}},invoiceRecords:[],paymentActivities:[],receivedDate:'2026-11-02',immutableSnapshot:structuredClone,shadowAllowed:()=>false,captureRetryBusy:{current:false},resumedDiagnosticReplay:{current:false},emptyRemittanceEvidence:()=>({}),resolveRemittanceAttempt:()=>({paymentCanApply:false}),remittanceDeadline:async promise=>promise,appendCameraStage(){},
  saveScan:async(write,onFailure)=>{saves.push(structuredClone(write));if(options.registrationFailure){onFailure?.(Object.assign(Error('isolated RPC rejection'),{code:'PGRST301',status:401}));return 'device';}return 'saved';},
  storeCanonicalCapture:async input=>{uploads.push(input);input.onProgress?.('Uploading photo');if(options.uploadFailure)throw Object.assign(Error('isolated network failure'),{stage:'object-upload',status:503});return{reference:input.attemptId,sha256:'a'.repeat(64),storedBytes:5,shadowQueued:false};},
  waitForLegacyJob:async input=>{jobs.push(input);jobIds.add(input.attemptId);if(options.pending)throw Object.assign(Error('isolated pending'),{code:'OCR_JOB_PENDING'});b.ocrAttemptVersion.current++;return Response.json({});},...options.bindings};
 for(const name of new Set(fn.match(/set[A-Z][A-Za-z]+/g)))b[name]=value=>{state[name]=value;if(name==='setCheckOcrMessage')messages.push(value);};
 const run=new Function(...Object.keys(b),ts.transpileModule(fn+'\nreturn extractCheckStubFromPhotoEvent;',{compilerOptions:{target:99}}).outputText)(...Object.values(b));
 return{run,state,messages,saves,uploads,jobs,jobIds,b,options};
}
async function handlers(){
 const original=handler(baseline,{registrationFailure:true});await original.run('data:image/jpeg;base64,aW1hZ2U=');await original.state.setCaptureRetry.run();
 assert.equal(original.uploads.length,0);assert.equal(original.jobs.length,0);assert.match(original.state.setCheckOcrMessage,/upload interrupted/,'Reproduce misleading production message before any upload');
 const t=handler(screen,{registrationFailure:true});await t.run('data:image/jpeg;base64,aW1hZ2U=');const id=t.b.latestScan.current.attemptId;
 assert.equal(t.b.latestScan.current.captureTransport.stage,'capture-registration');assert.equal(t.b.latestScan.current.captureTransport.httpStatus,401);assert.match(t.state.setCheckOcrMessage,/session could not be verified/);
 await t.state.setCaptureRetry.run();assert.equal(t.b.latestScan.current.attemptId,id);assert.equal(t.b.latestScan.current.captureTransport.retryCount,1);assert.equal(t.uploads.length,0);assert.equal(t.jobs.length,0);
 assert(t.messages.filter(x=>x==='Registering scan before photo upload').length===2);assert(t.state.setLastOcrDiagnosticLines.join('').includes('PGRST301'));
 t.options.registrationFailure=false;await t.state.setCaptureRetry.run();assert.equal(t.uploads.length,1);assert.equal(t.jobs.length,1);assert.equal(t.jobs[0].attemptId,id);assert.equal(t.uploads[0].imageDataUrl,'data:image/jpeg;base64,aW1hZ2U=');
 const missing=handler(screen,{bindings:{businessId:null}});await missing.run('data:image/jpeg;base64,aW1hZ2U=');assert.match(missing.state.setCheckOcrMessage,/workspace is not ready/);assert.equal(missing.uploads.length,0);
 const u=handler(screen,{uploadFailure:true});await u.run('data:image/jpeg;base64,aW1hZ2U=');assert.match(u.state.setCheckOcrMessage,/Photo upload could not be confirmed/);assert.equal(u.b.latestScan.current.captureTransport.httpStatus,503);assert.equal(u.jobs.length,0);
 u.options.uploadFailure=false;const retry=u.state.setCaptureRetry;await Promise.all([retry.run(),retry.run()]);assert.equal(u.uploads.length,2,'Only one retry upload runs');assert.equal(u.jobs.length,1);
 const p=handler(screen,{pending:true});await p.run('data:image/jpeg;base64,aW1hZ2U=');await p.state.setCaptureRetry.run();assert.equal(p.uploads.length,1,'Stored photo is not uploaded again');assert.equal(p.jobIds.size,1,'Resume retains same job identity');assert.match(p.state.setCheckOcrMessage,/processing is still pending/);
}
async function outbox(){
 const stores={attempts:new Map(),diagnostics:new Map()};
 global.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx={objectStore(name){return{getAll:()=>({result:[...stores[name].values()].map(x=>structuredClone(x))}),get:key=>({result:stores[name].get(key)}),put:record=>{stores[name].set(record.key,structuredClone(record));return{result:record.key};},delete:key=>{stores[name].delete(key);return{result:undefined};}};}};queueMicrotask(()=>tx.oncomplete());return tx;}};request.onsuccess();});return request;}};
 let reject=true;const calls=[];
 const client=load('src/app/lib/ocrHistoryClient.ts',{'./ocrDebug':{safeDiagnosticView:x=>x},'./ocrCanonical':canonical,'./ocrHistory':history,'./supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return reject?{error:{message:'isolated unauthorized',code:'PGRST301'},status:401}:{error:null,status:200};}}}});
 const errors=[],write={businessId:'business',phase:0,summary:history.scanSummary('attempt','attempt',null,'camera','test'),payload:{stage:'test'}};
 assert.equal(await client.saveScan(write,error=>errors.push(error)),'device');assert.equal(errors[0].code,'PGRST301');assert.equal(errors[0].status,401);assert.equal((await client.pendingScans('business')).length,1);
 reject=false;assert.equal(await client.saveScan(write),'saved');assert.equal((await client.pendingScans('business')).length,0);assert(calls.every(x=>x.name==='trimax_save_ocr_attempt'&&x.args.p_id==='attempt'));
 reject=true;write.summary.captureState='transport_failed';write.payload={stage:'transport_failed',transport:{stage:'capture-registration',message:'Attempt identity could not be saved'}};await client.saveScan(write);
 await existingRecentScans(client,calls);
 // Reproduce the screenshot's missing-timestamp local record in the real outbox and both deployed consumers.
 stores.attempts.clear();stores.diagnostics.clear();calls.length=0;reject=false;
 const good={...write,key:'business:older:0',payloadBytes:1,summary:{...write.summary,attemptId:'older',originalId:'older'}},bad={...good,key:'business:missing-time:0',summary:{...good.summary,attemptId:'missing-time',originalId:'missing-time'}};delete bad.summary.timestamp;
 stores.attempts.set(good.key,structuredClone(good));stores.attempts.set(bad.key,structuredClone(bad));const originalBad=structuredClone(bad);
 const deps={'./ocrDebug':{safeDiagnosticView:x=>x},'./ocrCanonical':canonical,'./ocrHistory':history,'./supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return{error:null,status:200};}}}};
 const baselineClient=load('src/app/lib/ocrHistoryClient.ts',deps,cp.execFileSync('git',['show','52dfc56445229c055a6b9fa90727b1be7116798f:src/app/lib/ocrHistoryClient.ts'],{encoding:'utf8',windowsHide:true}));
 await assert.rejects(baselineClient.flushScans('business'),/localeCompare/);assert.equal(calls.length,0,'Malformed local row blocks every original registration before any RPC');
 const originalHandler=handler(baseline,{bindings:{saveScan:baselineClient.saveScan}});await originalHandler.run('data:image/jpeg;base64,aW1hZ2U=');await originalHandler.state.setCaptureRetry.run();assert.equal(calls.length,0);assert.equal(originalHandler.uploads.length,0);assert.match(originalHandler.state.setCheckOcrMessage,/upload interrupted/);
 await existingRecentScans(baselineClient,calls,'baseline');
 const repairedClient=load('src/app/lib/ocrHistoryClient.ts',deps),repaired=handler(screen,{bindings:{saveScan:repairedClient.saveScan}});await repaired.run('data:image/jpeg;base64,aW1hZ2U=');assert.equal(repaired.uploads.length,1);assert.equal(repaired.jobs.length,1);assert(calls.every(call=>call.args.p_id!=='missing-time'));
 assert.deepEqual(stores.attempts.get(bad.key),originalBad,'Malformed original metadata must remain byte-for-byte unchanged');
 await existingRecentScans(repairedClient,calls,true);
 delete global.indexedDB;
}
async function existingRecentScans(client,calls,missingTime=false){
 const React=require('react'),renderer=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;global.window={addEventListener(){},removeEventListener(){}};
 const filename='src/app/components/RecentScans.tsx',m={exports:{}},empty={default:()=>null};
 const deps={'../lib/money.ts':{moneyFixed:()=>''},'./OcrCaptureRecovery':empty,'./SavedRemittancePaymentView':empty,'./OcrDiagnosticBuild':empty,'./OpticalEvidenceView':empty,'./OcrShadowComparison':empty,'./OcrDerivedAmountView':empty,'../lib/ocrDiagnosticDisplay.ts':require('../src/app/lib/ocrDiagnosticDisplay.ts'),'../lib/ocrDebug':{attemptPath:()=>'',debugTimestamp:()=>'',debugQueuePath:()=>'',diagnosticsAvailable:()=>true},'../lib/ocrHistory':history,'../lib/ocrHistoryClient':{...client,flushScans:async()=>{},recentScans:async()=>[]}};
 const source=missingTime==='baseline'?cp.execFileSync('git',['show','52dfc56445229c055a6b9fa90727b1be7116798f:'+filename],{encoding:'utf8',windowsHide:true}):fs.readFileSync(filename,'utf8');
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:99,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>deps[name]??require(name),m,m.exports);
 let tree;const before=calls.length;
 await renderer.act(async()=>{tree=renderer.create(React.createElement(m.exports.default,{businessId:'business',role:'owner',savedStatus:'Saved on this device'}));});
 const button=text=>tree.root.findAllByType('button').find(node=>node.children.join('').includes(text));
 await renderer.act(async()=>{button('Recent Scans').props.onClick();});
 if(missingTime==='baseline'){assert(JSON.stringify(tree.toJSON()).includes('localeCompare'),'Reproduce the deployed list crash from the same malformed outbox fixture');await renderer.act(async()=>tree.unmount());delete global.window;return;}
 if(missingTime){assert(JSON.stringify(tree.toJSON()).includes('Date unavailable'));assert(!JSON.stringify(tree.toJSON()).includes('localeCompare'));assert.equal(calls.length,before);await renderer.act(async()=>tree.unmount());delete global.window;return;}
 await renderer.act(async()=>{tree.root.findAllByType('button').find(node=>node.findAllByType('span').some(span=>span.children.join('').includes('Original Scan'))).props.onClick();});
 const raw=tree.root.findAllByType('details').find(node=>node.findAllByType('summary').some(s=>s.children.join('')==='Raw diagnostics'));
 await renderer.act(async()=>{raw.props.onToggle({currentTarget:{open:true}});});
 assert(JSON.stringify(tree.toJSON()).includes('capture-registration'),'Existing deployed Recent Scans reads the actual local-only failure payload');
 assert.equal(calls.length,before,'Opening local raw diagnostics sends no RPC, upload or job request');
 await renderer.act(async()=>tree.unmount());delete global.window;
}
async function storage(){
 const objects=load('src/app/lib/ocrCanonicalObject.ts',{'./ocrCanonical':canonical});
 const blob=new Blob(['synthetic image']),hash=await canonical.imageSha256(await blob.arrayBuffer());let value=null,writes=0;
 const storage={upload:async(_path,body,options)=>{assert.equal(options.upsert,false);if(!value){value=body;writes++;}return{error:{statusCode:'409',message:'acknowledgement lost'}};},download:async()=>({data:value,error:null})};
 await objects.uploadCanonicalObject(storage,'same-object',blob,hash);await objects.uploadCanonicalObject(storage,'same-object',blob,hash);assert.equal(writes,1);
 await assert.rejects(objects.uploadCanonicalObject({upload:async()=>({error:{statusCode:'403',code:'42501'}}),download:async()=>({data:null,error:Error('not authorized')})},'same-object',blob,hash),error=>canonical.captureFailure(error,'canonical-upload').httpStatus===403&&error.stage==='object-upload');
 value=new Blob(['corrupted']);await assert.rejects(objects.uploadCanonicalObject(storage,'same-object',blob,hash),/integrity mismatch/);
}
async function canonicalRegistration(){
 const objects=load('src/app/lib/ocrCanonicalObject.ts',{'./ocrCanonical':canonical}),progress=[],paths=[];let stored=null,writes=0,reject=true;
 const business='11111111-1111-1111-1111-111111111111',attempt='22222222-2222-2222-2222-222222222222';
 const client=load('src/app/lib/ocrCanonicalClient.ts',{'./ocrCanonical':canonical,'./ocrCanonicalObject':objects,'./supabase':{supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{business_id:business},error:null,status:200})})})}),storage:{from:bucket=>{assert.equal(bucket,'trimax-ocr-captures');return{upload:async(path,blob,options)=>{paths.push(path);assert.equal(options.upsert,false);if(stored)return{error:{statusCode:'409'}};writes++;stored=blob;return{error:null};},download:async()=>({data:stored,error:null})};}},rpc:async(name,args)=>{assert.equal(name,'trimax_store_ocr_capture');assert.equal(args.p_attempt,attempt);assert.equal(args.p_image,null);return reject?{error:{message:'isolated registration failure',code:'57014'},status:500}:{data:{reference:attempt,sha256:args.p_hash,storedBytes:stored.size,shadowQueued:false},error:null,status:200};}}}});
 const input={attemptId:attempt,imageDataUrl:'data:image/jpeg;base64,aW1hZ2U=',metadata:{},snapshot:null,captureTimings:{},onProgress:message=>progress.push(message)};
 await assert.rejects(client.storeCanonicalCapture(input),error=>error.stage==='canonical-registration'&&error.code==='57014'&&error.status===500);
 reject=false;const result=await client.storeCanonicalCapture(input);assert.equal(writes,1);assert.equal(result.reference,attempt);assert.equal(new Set(paths).size,1);
 assert.deepEqual(progress.slice(0,4),['Preparing photo for upload','Verifying saved scan','Uploading photo','Confirming saved photo']);
}
async function diagnosticsUi(){
 const {renderToStaticMarkup}=require('react-dom/server');
 const t=handler(screen,{registrationFailure:true});await t.run('data:image/jpeg;base64,aW1hZ2U=');
 const summary={...t.b.latestScan.current,access_token:'secret',refresh_token:'secret',imageDataUrl:'private image',invoiceSelections:['private selections']};
 const text=history.captureTransportReport(summary,'remittance-test.jpg');assert(!/secret|private image|private selections|access_token|refresh_token/.test(text));assert(text.includes('capture-registration'));
 function render(source){
  const ast=ts.createSourceFile('screen.tsx',source,99,true,4);let fragment;
  function visit(node){if(ts.isJsxElement(node)&&node.openingElement.getText(ast).includes('border-amber-300/35')&&node.getText(ast).includes('Enter Manually / Select Missing Invoice'))fragment=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert(fragment);
  const bindings={checkOcrMessage:'failure',captureRetry:t.state.setCaptureRetry,latestScan:{current:summary},checkImageName:'remittance-test.jpg',captureTransportReport:history.captureTransportReport,checkImageFile:null,isPreparingCrop:false,copyCaptureDiagnostics:()=>{},readPreparedRemittanceFromFile(){},openCameraCapture(){},enterRemittanceManually(){},captureDocumentType:'remittance',captureIntent:'full_remittance'};
  const fn=new Function('require','exports',...Object.keys(bindings),ts.transpileModule('return ('+fragment+');',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:99}}).outputText);
  return renderToStaticMarkup(fn(require,{},...Object.values(bindings)));
 }
 const old=render(baseline);assert(!old.includes('Copy'),'Actual deployed failure panel contains Retry/Retake/Manual only');
 const html=render(screen);assert(html.includes('Copy Capture Diagnostics'));assert(html.includes('Capture diagnostics'));assert(html.includes('capture-registration'));assert(!html.includes('secret'));
 const ast=ts.createSourceFile('screen.tsx',screen,99,true,4);let copy;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='copyCaptureDiagnostics')copy=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);let copied;
 const fn=new Function('latestScan','checkImageName','captureTransportReport','copyTextToClipboard','setToast',ts.transpileModule(copy+'\nreturn copyCaptureDiagnostics;',{compilerOptions:{target:99}}).outputText);
 await fn({current:summary},'remittance-test.jpg',history.captureTransportReport,async value=>{copied=value;},()=>{})();assert.equal(copied,text);assert.equal(t.uploads.length,0);assert.equal(t.jobs.length,0);
}
(async()=>{await handlers();await outbox();await storage();await canonicalRegistration();await diagnosticsUi();console.log('PASS original registration-error and missing-control reproduction; actual handler same-photo/same-ID Retry, session/workspace/upload diagnostics, progress, concurrent-click guard, canonical reuse, outbox error metadata, lost acknowledgement, immutable private object/integrity rejection, registration failure after upload, actual failure-panel render and allowlisted local-only diagnostic copy; no payment calls');})().catch(error=>{console.error(error);process.exitCode=1;});
