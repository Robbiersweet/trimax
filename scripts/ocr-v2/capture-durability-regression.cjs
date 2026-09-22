/* eslint-disable @typescript-eslint/no-require-imports -- Isolated transport/UI dependencies, no network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
process.env.NODE_ENV='test';
const React=require('react'),renderer=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,dependencies){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>dependencies[name]??require(name),exports);return exports;}
(async()=>{
 const calls=[];let failure=null;
 const transport=load('src/app/lib/ocrCanonicalClient.ts',{'./supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:name==='trimax_store_ocr_capture'?{reference:'a',sha256:args.p_hash,storedBytes:5,shadowQueued:false}:{queued:true},error:failure};}}},'./ocrCanonical':require('../../src/app/lib/ocrCanonical.ts')});
 const capture=await transport.storeCanonicalCapture({attemptId:'a',imageDataUrl:'data:image/png;base64,aW1hZ2U=',metadata:{},snapshot:{invoices:[],activities:[]},captureTimings:{}});
 assert.equal(calls.length,1);assert.equal(calls[0].name,'trimax_store_ocr_capture');assert.equal(capture.reference,'a');
 await transport.resumeCaptureHandoff('a');assert.deepEqual(calls[1],{name:'trimax_resume_ocr_handoff',args:{p_attempt:'a'}});
 failure={message:'canceling statement due to statement timeout',code:'57014'};
 await assert.rejects(transport.resumeCaptureHandoff('a'),error=>error.code==='57014'&&error.retriable);
 const Recovery=load('src/app/components/OcrCaptureRecovery.tsx',{'../lib/ocrCanonicalClient':transport}).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Recovery,{summary:{attemptId:'a',canonicalReference:'a',captureState:'image_stored',shadowHandoffState:'handoff_pending'},businessSlug:'test'}));});
 assert(JSON.stringify(tree.toJSON()).includes('Capture saved'));
 assert(tree.root.findByType('a').props.href.includes('replayAttempt=a'));
 await renderer.act(async()=>tree.root.findByType('button').props.onClick());
 assert(JSON.stringify(tree.toJSON()).includes('Capture remains saved'));
 failure=null;await renderer.act(async()=>tree.root.findByType('button').props.onClick());
 assert(JSON.stringify(tree.toJSON()).includes('saved photo was reused'));
 assert(calls.every(call=>!call.name.includes('payment')));
 await renderer.act(async()=>tree.unmount());
 console.log('PASS independent upload RPC, reference-only handoff, structured timeout, pending UI, recoverable retry, no payment calls');
})().catch(error=>{console.error(error);process.exitCode=1;});
