/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the production selector with controlled worker faults. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),sharp=require('sharp');
const file=path.resolve('src/app/lib/ocrDocumentDirection.ts'),copy={exports:{}};
new Function('require','module','exports','setTimeout',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(s=>s.startsWith('.')?require(path.resolve(path.dirname(file),s)):require(s),copy,copy.exports,(fn,ms)=>{assert([2000,5000].includes(ms));return setTimeout(fn,5);});
const probe=(image,factory)=>copy.exports.selectDocumentDirection(image,{sampling:'text-bands'},factory);
function data(mult=1,noise=false){
 const names=noise?['!!!','...','???','///','---',':::']:['invoice','amount','property','total','check','description'];
 let n=0;const lines=[0,1,2].map(y=>({words:[0,1].map(x=>({text:names[n++],confidence:Math.min(99,50*mult),bbox:{x0:x*140,y0:y*30,x1:x*140+120,y1:y*30+20}}))}));
 return {text:names.join(' '),blocks:[{paragraphs:[{lines}]}]};
}
(async()=>{
 const image=await sharp({create:{width:100,height:200,channels:3,background:'white'}}).png().toBuffer();
 for(const [name,plan,winner] of [['first timeout later success',['timeout',.3,.4,1],270],['middle error later success',[.3,'error',.4,1],270],['sibling preserved',[.3,1,'timeout',.4],90],['all failed',['timeout','error','timeout','error'],null],['all ambiguous',[1,1,1,1],null],['noise cannot win',['noise',.3,.4,1],270],['healthy worker reused',[.3,.4,.5,1],270]]){
  let calls=0,created=0,terminated=0;
  const result=await probe(image,async()=>{created++;return {setParameters:async()=>{},terminate:async()=>{terminated++;},recognize:()=>{const p=plan[calls++];if(p==='timeout')return new Promise(()=>{});if(p==='error')return Promise.reject(Error('injected failure'));return Promise.resolve({data:data(p==='noise'?2:p,p==='noise')});}};});
  assert.equal(calls,4);assert.equal(result.rotation,winner);assert.equal(created,terminated);assert.equal(result.workersCreated,created);assert.equal(result.observations.length,4);
  if(name==='healthy worker reused')assert.equal(created,1);
  if(name==='sibling preserved')assert(result.observations[1].rawText.includes('invoice'));
  if(name==='noise cannot win')assert.equal(result.observations[0].credible,false);
  assert(result.observations.every(o=>o.recognitionStarted&&o.costs.recognitionMs>=0));console.log('PASS',name);
 }
 let initializations=0;const failure=await probe(image,async()=>{initializations++;throw Error('injected initialization failure');});assert.equal(initializations,1);assert.equal(failure.certain,false);assert.equal(failure.rotation,null);assert(failure.observations.every(o=>!o.recognitionStarted));console.log('PASS initialization failure remains truthful and safe');
 const {orientLegacyStill}=require('../../src/app/lib/ocrLegacyOrientation.ts');
 await assert.rejects(orientLegacyStill(image),e=>{assert.equal(e.stage,'orientation-probe');assert.equal(e.diagnostics.detailedOcrStarted,false);assert.deepEqual(e.diagnostics.passTimings,[]);return true;});
 const faint=fs.readFileSync('scripts/fixtures/faint-remittance.png');
 for(const rotation of [0,90,180,270]){const input=await sharp(faint).rotate(rotation).png().toBuffer(),r=await orientLegacyStill(input);assert.equal(r.evidence.rotation,(360-rotation)%360);assert.equal(r.evidence.workersCreated,1);assert(r.evidence.observations.every(o=>o.status==='completed'));console.log('PASS faint document rotated',rotation,'selected',r.evidence.rotation);}
 if(process.argv[2]){
  const {probeLegacyDirection}=require('../../src/app/lib/ocrLegacyDirection.ts'),{createWorker,OEM}=require('tesseract.js');let first=true;
  const injected=bytes=>probeLegacyDirection(bytes,async()=>{const w=await createWorker('eng',OEM.LSTM_ONLY,{logger:()=>{}});return {setParameters:(...a)=>w.setParameters(...a),terminate:()=>w.terminate(),recognize:(...a)=>{if(first){first=false;return new Promise(()=>{});}return w.recognize(...a);}};});
  const target=path.resolve('src/app/lib/ocrLegacyOrientation.ts'),m={exports:{}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(target,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(s=>s.includes('ocrLegacyDirection')?{probeLegacyDirection:injected}:require(s),m,m.exports);
  const r=await m.exports.orientLegacyStill(fs.readFileSync(process.argv[2]));assert.equal(r.evidence.observations[0].status,'timed-out');assert.equal(r.evidence.rotation,270);assert.equal((await sharp(r.image).metadata()).width,4032);if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(r.evidence,null,2));console.log('PASS retained physical image reaches270 after first candidate timeout');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
