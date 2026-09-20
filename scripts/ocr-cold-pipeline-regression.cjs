/* eslint-disable @typescript-eslint/no-require-imports -- Compare the actual historical/current route without modifying either checkout. */
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
let baseline=false;
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



const assert=require('node:assert/strict');
const sharp=require('sharp');
const {selectPhysicalSource}=require('../src/app/lib/ocrStructure.ts');
(async()=>{
 const pipelineStart=performance.now();
 const original=fs.readFileSync(process.argv[2] || 'scripts/fixtures/faint-remittance.png');
 // New module graph and observation scope for every request models different
 // server instances. No observations from preflight can warm detailed OCR.
 const post=async body=>{const route=loadRoute(),start=performance.now();const response=await route.POST(new Request('http://localhost/api/payments/extract-check-stub',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-observation-scope':crypto.randomUUID()},body:JSON.stringify(body)}));assert.equal(response.status,200);return {ms:Math.round(performance.now()-start),data:await response.json()};};
 const url=b=>'data:image/jpeg;base64,'+b.toString('base64');
 const orientation=await post({mode:'orientation-probe',captureCandidates:[{id:'imagecapture-still',label:'imagecapture-still',imageDataUrl:url(original)}]});
 assert(orientation.data.resolved,'Still orientation must resolve');
 const oriented=Buffer.from(orientation.data.imageDataUrl.split(',')[1],'base64');
 const metadata=await sharp(oriented).metadata();
 const candidates=[{id:'still-full',bytes:oriented},{id:'still-crop',bytes:await sharp(oriented).extract({left:Math.floor(metadata.width*.02),top:Math.floor(metadata.height*.02),width:Math.floor(metadata.width*.96),height:Math.floor(metadata.height*.96)}).jpeg({quality:95}).toBuffer()},{id:'canvas',bytes:await sharp(original).resize({width:Math.round(metadata.width*.72)}).jpeg({quality:85}).toBuffer()}];
 const results=[];
 for(const candidate of candidates){const result=await post({mode:'capture-source-selection',captureCandidates:[{id:candidate.id,label:candidate.id,imageDataUrl:url(candidate.bytes)}]});results.push({id:candidate.id,...result});}
 const evaluations=results.flatMap(r=>r.data.evaluations||[]);
 const selected=selectPhysicalSource(evaluations);assert(selected);assert.notEqual(selected.id,'canvas','A usable still must be retained');
 const selectedImage=candidates.find(c=>c.id===selected.id).bytes;
 const detailed=await post({imageDataUrl:url(selectedImage),documentType:'remittance_stub'});
 assert.equal(detailed.data.diagnostics.observationCache.hits,0);
 const report={cropDescription:"Test-only 2% inset, not a replay of the browser detector",originalDimensions:metadata.width+"x"+metadata.height,input:process.argv[2]||'sanitized faint fixture',orientationMs:orientation.ms,preflightMs:results.reduce((n,r)=>n+r.ms,0),candidates:results.map(r=>({id:r.id,durationMs:r.ms,evaluations:r.data.evaluations?.map(e=>({usable:e.usable,outcomes:e.variantOutcomes,words:e.words,rows:e.rowCount})),failures:r.data.failures})),selected:selected.id,detailedMs:detailed.data.diagnostics.detailedOcrDurationMs,detailedServerMs:detailed.ms,totalServerMs:orientation.ms+results.reduce((n,r)=>n+r.ms,0)+detailed.ms,pipelineMs:Math.round(performance.now()-pipelineStart),cache:detailed.data.diagnostics.observationCache,rows:detailed.data.structuredRowEvidence.length,total:detailed.data.totalEvidence};
 if(!process.argv[2]){assert.equal(report.rows,5);assert.equal(report.total.amount,1500);}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
