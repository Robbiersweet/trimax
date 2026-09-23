/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic worker failures exercise production candidate isolation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),sharp=require('sharp');
const file=path.resolve('src/app/lib/ocrLegacyDirection.ts'),moduleCopy={exports:{}};
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
new Function('require','module','exports','setTimeout',js)(s=>s.startsWith('.')?require(path.resolve(path.dirname(file),s)):require(s),moduleCopy,moduleCopy.exports,(fn,ms)=>{assert([2000,5000].includes(ms));return setTimeout(fn,5);});
const {probeLegacyDirection}=moduleCopy.exports;
function data(mult=1,noise=false){
 const names=noise?['!!!','...','???','///','---',':::']:['invoice','amount','property','total','check','description'];
 let n=0;const lines=[0,1,2].map(y=>({words:[0,1].map(x=>({text:names[n++],confidence:Math.min(99,50*mult),bbox:{x0:x*140,y0:y*30,x1:x*140+120,y1:y*30+20}}))}));
 return {text:names.join(' '),blocks:[{paragraphs:[{lines}]}]};
}(async()=>{const image=await sharp({create:{width:100,height:200,channels:3,background:'white'}}).png().toBuffer();
for(const [name,plan,winner]of [['first timeout later success',['timeout',.3,.4,1],270],['middle error later success',[.3,'error',.4,1],270],['completed sibling survives timeout',[.3,1,'timeout',.4],90],['all failures',['timeout','error','timeout','error'],null],['punctuation cannot win',['noise',.3,.4,1],270]]){let calls=0,created=0,terminated=0;const factory=async()=>{created++;return{setParameters:async()=>{},terminate:async()=>{terminated++;},recognize:()=>{const action=plan[calls++];if(action==='timeout')return new Promise(()=>{});if(action==='error')return Promise.reject(Error('injected candidate error'));return Promise.resolve({data:data(action==='noise'?2:action,action==='noise')});}};};const result=await probeLegacyDirection(image,factory);assert.equal(calls,4);assert.equal(result.observations.length,4);assert.equal(result.rotation,winner);assert.equal(result.certain,winner!==null);assert.equal(created,terminated);assert(result.observations.every(o=>o.started&&o.recognitionStarted&&o.durationMs>=0));for(let i=0;i<4;i++)assert.equal(result.observations[i].status,plan[i]==='timeout'?'timed-out':plan[i]==='error'?'errored':'completed');if(name.includes('sibling'))assert(result.observations[1].rawText.includes('invoice'));if(name.includes('punctuation'))assert.equal(result.observations[0].credible,false);console.log('PASS',name);}
const {orientLegacyStill}=require('../../src/app/lib/ocrLegacyOrientation.ts');
await assert.rejects(orientLegacyStill(image),error=>{assert.equal(error.stage,'orientation-probe');assert.equal(error.ocrStarted,true);assert.equal(error.diagnostics.orientationProbeStarted,true);assert.equal(error.diagnostics.detailedOcrStarted,false);assert.deepEqual(error.diagnostics.passTimings,[]);return true;});console.log('PASS unsupported orientation stops before detailed OCR with truthful probe-start diagnostics');
if(process.argv[2]){
 const {probeLegacyDirection:realProbe}=require('../../src/app/lib/ocrLegacyDirection.ts'),{createWorker,OEM}=require('tesseract.js');let first=true;
 const injectedProbe=bytes=>realProbe(bytes,async()=>{const w=await createWorker('eng',OEM.LSTM_ONLY,{logger:()=>{}});return {setParameters:(...args)=>w.setParameters(...args),terminate:()=>w.terminate(),recognize:(...args)=>{if(first){first=false;return new Promise(()=>{});}return w.recognize(...args);}};});
 const target=path.resolve('src/app/lib/ocrLegacyOrientation.ts'),m={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(target,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(s=>s.includes('ocrLegacyDirection')?{probeLegacyDirection:injectedProbe}:require(s),m,m.exports);
 const result=await m.exports.orientLegacyStill(fs.readFileSync(process.argv[2]));
 assert.equal(result.evidence.observations[0].status,'timed-out');assert.equal(result.evidence.observations[3].status,'completed');assert.equal(result.evidence.rotation,270);assert.equal((await sharp(result.image).metadata()).width,4032);
 if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result.evidence,null,2));console.log('PASS exact retained image: injected first timeout, real later OCR selects270 and returns upright pixels');
}
})().catch(e=>{console.error(e);process.exitCode=1;});
