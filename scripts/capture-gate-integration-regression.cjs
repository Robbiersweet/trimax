/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
module.exports=function(){
  const source=fs.readFileSync("src/app/components/BatchInvoicePayments.tsx","utf8");
  const compile=(text,bindings)=>new Function(...Object.keys(bindings),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(bindings));
  const writes=[];
  const trace={current:[{ready:false,reason:"Document exceeds guide size",frame:{document:{x:2,y:3,width:40,height:30}}}]};
  const session={current:{frames:8,captured:false,businessId:"test-business"}};
  const bindings={captureGateSession:session,captureGateTrace:trace,crypto,process,
    scanSummary:(id)=>({attemptId:id}),finishScan:base=>base,saveScan:write=>{writes.push(write);return Promise.resolve("saved");},
    cameraStreamRef:{current:null},cameraVideoRef:{current:null},setCameraReady:()=>{},setCameraQualityReady:()=>{},setIsCapturingFrame:()=>{},setCameraVideoPlayStatus:()=>{}};
  const stop=compile(source.slice(source.indexOf("  function stopCameraCapture()"),source.indexOf("  function handleCameraModeSelection("))+"\nreturn stopCameraCapture;",bindings);
  stop();stop();assert.equal(writes.length,1);assert.equal(writes[0].payload.stage,"capture-framing");assert.equal(writes[0].businessId,"test-business");
  trace.current[0].reason="changed";assert.equal(writes[0].payload.captureGate[0].reason,"Document exceeds guide size");
  session.current={frames:20,captured:true,businessId:"test-business"};stop();assert.equal(writes.length,1);
  session.current={frames:2,captured:false,businessId:"test-business"};stop();assert.equal(writes.length,1);
  const optical={current:{images:[{label:"Original capture"}],notes:["retained"]}},selection={current:["still-full"]};
  const start=source.indexOf("  const analyzeLiveCameraFrame = useCallback(");
  const analyze=compile(source.slice(start,source.indexOf("  useEffect(",start))+"\nreturn analyzeLiveCameraFrame;",{
    useCallback:fn=>fn,cameraVideoRef:{current:{videoWidth:400,videoHeight:280}},captureDocumentType:"remittance_stub",
    getVisibleCameraGuideSourceRect:()=>({visibleSourceWidth:400,visibleSourceHeight:280}),
    document:{createElement:()=>({getContext:()=>({drawImage:()=>{},getImageData:()=>({data:new Uint8ClampedArray(4)})})})},
    measureCaptureFrame:()=>({}),captureReadiness:()=>({ready:false}),captureGateMemory:{current:{}},captureGateSession:session,captureGateTrace:trace,opticalRef:optical,sourceSelectionRef:selection,
  });
  for(let i=0;i<20;i++)analyze();
  assert.equal(trace.current.length,12);assert.equal(optical.current.images.length,1);assert.equal(optical.current.notes[0],"retained");assert.deepEqual(selection.current,["still-full"]);
  console.log("Capture integration: bounded immutable abandonment diagnostics; no per-frame writes; live polling preserves optical/source evidence.");
};
