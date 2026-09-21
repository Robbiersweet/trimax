/* eslint-disable @typescript-eslint/no-require-imports -- Compare the actual historical/current route without modifying either checkout. */
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const baseline=false;
function loadRoute() {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    let source = baseline && /src[\\/]app/.test(file) ? require("node:child_process").execFileSync("git",["show","5b2d6ed:"+path.relative(process.cwd(),file).replaceAll("\\","/")],{encoding:"utf8"}) : fs.readFileSync(file,"utf8");
    if (file.endsWith("route.ts"))
      source += "\nexports.mapWords=extractOcrWords;";
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (spec) => {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) return require(spec);
      const base = spec.startsWith("@/")
        ? path.resolve("src", spec.slice(2))
        : path.resolve(path.dirname(file), spec);
      return load(
        [base, base + ".ts", base + ".tsx"].find((p) => fs.existsSync(p)),
      );
    };
    new Function("require", "module", "exports", js)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  return load(path.resolve("src/app/api/payments/extract-check-stub/route.ts"));
}




const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
(async()=>{
 const image=fs.readFileSync(process.argv[2]),output=process.argv[3],sha=crypto.createHash('sha256').update(image).digest('hex');
 const id=crypto.randomUUID(),business=crypto.randomUUID(),writes=[];
 const optical={canonicalHash:sha,images:[{label:'Canonical OCR input',mime:'image/jpeg',base64:image.toString('base64'),sha256:sha,width:3024,height:4032}]};
 const server=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;res.setHeader('Content-Type','application/json');
 if(req.url.startsWith('/rest/v1/ocr_attempts'))res.end(JSON.stringify({id}));
 else if(req.url.startsWith('/rest/v1/ocr_attempt_optical'))res.end(JSON.stringify({evidence:optical}));
 else if(req.url==='/rest/v1/rpc/trimax_save_ocr_attempt'){writes.push(JSON.parse(body));res.end('null');}
 else {res.statusCode=404;res.end('{}');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:'+server.address().port;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='isolated-test';
 const body={canonicalReference:id,sourceImageHash:sha,businessId:business,attemptId:id,documentType:'remittance_stub',retryStrategy:'standard',history:{attemptId:id,originalId:id,parentId:null,timestamp:new Date().toISOString(),build:'candidate-replay',result:'processing'},debugContext:{canonicalCapture:{reference:id,sha256:sha}}};
 assert(JSON.stringify(body).length<4000);assert(image.toString('base64').length>4500000);
 try{
 const start=performance.now();const response=await loadRoute().POST(new Request('http://localhost/api/payments/extract-check-stub',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer isolated-test','x-ocr-observation-scope':crypto.randomUUID()},body:JSON.stringify(body)}));
 const result=await response.json();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({httpStatus:response.status,sourceHash:sha,requestBytes:Buffer.byteLength(JSON.stringify(body)),durationMs:performance.now()-start,checkpoints:writes.map(w=>({phase:w.p_phase,stage:w.p_payload.stage})),result}));
 assert.equal(response.status,200);assert(writes.some(w=>w.p_payload.stage==='server-extraction'));console.log(JSON.stringify({status:response.status,requestBytes:Buffer.byteLength(JSON.stringify(body)),durationMs:Math.round(performance.now()-start),rows:result.structuredRowEvidence?.length,total:result.totalEvidence,output}));
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
