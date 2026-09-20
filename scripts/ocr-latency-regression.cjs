/* eslint-disable @typescript-eslint/no-require-imports -- Production modules with fake OCR/storage boundaries. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const { recognizeFaintVariants } = require("../src/app/lib/ocrFaint.ts");
const { withOcrObservations, observeOcr, ocrCacheStats } = require("../src/app/lib/ocrObservationCache.ts");
function load(file, adapters = {}, cache = new Map()) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const js = ts.transpileModule(fs.readFileSync(file,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const req = name => {
    if (adapters[name]) return adapters[name];
    if (!name.startsWith(".")) return require(name);
    const base=path.resolve(path.dirname(file),name);
    return load(fs.existsSync(base)?base:base+".ts",adapters,cache);
  };
  new Function("require","module","exports",js)(req,mod,mod.exports);
  return mod.exports;
}
(async()=>{
  const prepared={color:Buffer.from("color"),gray:Buffer.from("gray"),binary:Buffer.from("binary"),bounds:{left:0,top:0,width:100,height:100},inputWidth:100,inputHeight:100,scale:1,estimatedCharacterHeight:12};
  const useful={data:{text:"Remittance Payment Invoice INV-9001 09/01/2026 $100.00 Total $100.00",confidence:90,blocks:[]}};
  let calls=0,terminated=0;
  const partial=await recognizeFaintVariants({recognize:async()=>{calls++;if(calls===1)return useful;return new Promise(()=>{});},terminate:async()=>{terminated++;}},prepared,30);
  assert.equal(partial.selected.variant,"local-gray");
  assert.equal(partial.selected.score.credible,true);
  assert.equal(partial.passes.length,1);
  assert.equal(partial.outcomes[1].status,"timed-out");
  assert.equal(terminated,1,"Timeout must terminate CPU work, not just race its promise");
  const slow=await recognizeFaintVariants({recognize:async()=>{await new Promise(resolve=>setTimeout(resolve,3100));return useful;},terminate:async()=>{}},prepared,3500);
  assert.equal(slow.outcomes[0].status,"completed","Cold recognition beyond three seconds must retain its result");
  assert(slow.outcomes[0].startedAt && slow.outcomes[0].finishedAt);
  assert.equal(slow.outcomes[2].status,"not-started");
  const failed=await recognizeFaintVariants({recognize:async()=>{throw Error("worker failed");},terminate:async()=>{}},prepared,30);
  assert.equal(failed.selected,undefined);
  const recovered=await recognizeFaintVariants({recognize:async()=>{throw Error("worker failed");},terminate:async()=>{}},prepared,500,async()=>({recognize:async()=>useful,terminate:async()=>{}}));
  assert(recovered.passes.length>0,"Independent sibling continues after failed worker replacement");
  assert.equal(recovered.outcomes[0].status,"errored");
  const {rankSourceEvaluations}=require("../src/app/lib/ocrStructure.ts");
  assert.equal(rankSourceEvaluations([{id:"usable",completenessScore:partial.selected.score.score}])[0].id,"usable");
  let observed=0;
  const worker={recognize:async()=>{observed++;return useful;}};
  const scope=randomUUID();
  await withOcrObservations(scope,async()=>{
    await observeOcr(worker,prepared.gray,"sparse-text");
    await observeOcr(worker,prepared.gray,"sparse-text");
    assert.equal(ocrCacheStats().hits,1);
    await observeOcr(worker,prepared.binary,"sparse-text");
    await observeOcr(worker,prepared.gray,"single-line");
  });
  assert.equal(observed,3,"Identical image and segmentation reused; different pixels/mode not reused");
  await withOcrObservations(randomUUID(),()=>observeOcr(worker,prepared.gray,"sparse-text"));
  assert.equal(observed,4,"Retry namespace must not inherit observations");

  process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="regression-public-key";
  const writes=[];let readStarted=false;
  const fake={rpc:async(_name,args)=>{writes.push(structuredClone(args));if(writes.length===1)return {error:{code:"",message:"AbortError: request timed out"}};return {error:null};},from:()=>{readStarted=true;assert(writes.some(w=>w.p_payload.response),"Response must be saved before optional optical work");return {select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:{message:"optional image read unavailable"}})})})};}};
  const {checkpointOcr}=load("src/app/lib/ocrHistoryServer.ts",{"@supabase/supabase-js":{createClient:()=>fake}});
  const id=randomUUID(),newer=randomUUID();
  const disconnected=new AbortController();
  const request=new Request("http://localhost/ocr",{method:"POST",signal:disconnected.signal,headers:{"Content-Type":"application/json",Authorization:"Bearer regression"},body:JSON.stringify({businessId:randomUUID(),history:{attemptId:id,originalId:id,parentId:null},debugContext:{capture:{source:"physical"}}})});
  const response=await checkpointOcr(request,async()=>{disconnected.abort();return Response.json({rawText:"retained OCR",optical:{images:[{label:"test"}]}});});
  assert.equal(response.status,200);
  assert(readStarted);
  assert.equal(writes.length,2,"Transient core failure retried independently of images");
  assert(writes.every(w=>w.p_id===id&&w.p_id!==newer&&w.p_phase===1));
  assert.equal(writes[1].p_payload.response.rawText,"retained OCR");
  assert.equal(writes[1].p_payload.persistenceFailures[0].code,"transport-or-abort");
  assert(!writes[1].p_payload.optical,"Core checkpoint must not contain multi-megabyte images");
  const sql=fs.readFileSync("supabase/sql/2026-09-18-ocr-attempt-history.sql","utf8");
  assert(sql.includes("existing.phase > p_phase or existing.phase = 2"),"Database retains monotonic phase protection");
  console.log("OCR latency regression passed: partial timeout, worker termination, candidate survival, equivalent-pass cache, retry isolation, independent server checkpoint, transient retry, attempt identity and phase protection.");
})().catch(error=>{console.error(error);process.exitCode=1;});
