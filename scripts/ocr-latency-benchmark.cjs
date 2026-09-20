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


(async()=>{for(const before of [true,false]){baseline=before;const route=loadRoute();const input=fs.readFileSync(process.argv[2] || 'scripts/fixtures/faint-remittance.png');const scope=crypto.randomUUID();const post=async body=>{const start=performance.now();const res=await route.POST(new Request('http://localhost/api/payments/extract-check-stub',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-observation-scope':scope},body:JSON.stringify(body)}));return {wallMs:Math.round(performance.now()-start),data:await res.json()};};const imageDataUrl='data:image/png;base64,'+input.toString('base64');const pre=await post({mode:'capture-source-selection',captureCandidates:[{id:'fixture',label:'fixture',imageDataUrl}]});const detail=await post({imageDataUrl,documentType:'remittance_stub'});console.log(JSON.stringify({version:before?'5b2d6ed':'repair',preflightMs:pre.wallMs,serverMs:detail.wallMs,detailedMs:detail.data.diagnostics.detailedOcrDurationMs,recoveryMs:detail.data.diagnostics.recoveryDurationMs,mode:detail.data.diagnostics.recoveryMode,passes:detail.data.evidence.rawPasses.filter(p=>!/merge|reconstruction/.test(p.region)).length,rows:detail.data.structuredRowEvidence.length,total:detail.data.totalEvidence,cache:detail.data.diagnostics.observationCache,best:detail.data.diagnostics.bestUsefulEvidence}));}})().catch(e=>{console.error(e);process.exitCode=1;});
