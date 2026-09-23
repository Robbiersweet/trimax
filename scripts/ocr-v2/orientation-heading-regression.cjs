/* eslint-disable @typescript-eslint/no-require-imports -- Execute real route with isolated timer/recognizer faults; private optical replay is opt-in. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),sharp=require('sharp');
const {fitTableHeader}=require('../../src/app/lib/ocrV2/semantics/headerGeometry.ts');
const {transportFailure}=require('../../src/app/lib/ocrCanonical.ts');
const label=(type,x,y)=>({id:type,observationId:'test',runKey:'test',type,raw:type,normalized:type,correction:'formatting-only',bounds:{left:x,top:y,width:80,height:20},confidence:95,words:[]});
for(const slope of [0,.025,-.04]) {
 const labels=[label('invoice_number',100,200),label('description',600,200+slope*500),label('row_amount',1200,200+slope*1100)];
 labels.push(label('check_number',200,350),label('date',1000,600));
 const result=fitTableHeader(labels,labels[0]);
 assert.deepEqual(result.heading.map(l=>l.type),['invoice_number','description','row_amount']);
 assert(Math.abs(result.geometry.slope-slope)<1e-8);
}
const incompatible=[label('invoice_number',100,200),label('description',500,200),label('row_amount',1200,650)];
assert(!fitTableHeader(incompatible,incompatible[0]).heading.some(l=>l.type==='row_amount'));
const pair=[label('invoice_number',100,200),label('row_amount',1200,255)];
assert(!fitTableHeader([...pair,{...pair[1],id:'repeat',observationId:'second'}],pair[0]).heading.some(l=>l.type==='row_amount'),'Repeated passes cannot supply independent heading support');
assert.equal(transportFailure(422,'OCR exceeded deadline','ocr-recognition',true).ocrStarted,true);
assert.equal(transportFailure(503,'offline').ocrStarted,false);

function route(mock) {
 const cache=new Map();
 function load(file) {
  if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  let source=fs.readFileSync(file,'utf8');if(file.endsWith('route.ts'))source+='\nexports.recognize=recognizeBestText;';
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  function req(spec){
   if(mock&&spec==='tesseract.js')return {OEM:{LSTM_ONLY:1},PSM:{SPARSE_TEXT:11},createWorker:async()=>({setParameters:async()=>{},recognize:()=>{mock.started=true;mock.calls=(mock.calls||0)+1;if(mock.supplemental && mock.calls!==2)return Promise.resolve({data:{text:'PRESERVED FIRST OBSERVATION INV-1234',confidence:50,blocks:[]}});return new Promise(r=>{mock.late=r;});},terminate:async()=>{mock.terminated=true;}})};
   if(mock&&spec.includes('ocrLegacyOrientation'))return {orientLegacyStill:async image=>{mock.oriented=true;return {image,evidence:{rotation:270,certain:true}};}};
   if(!spec.startsWith('.')&&!spec.startsWith('@/'))return require(spec);
   const base=spec.startsWith('@/')?path.resolve('src',spec.slice(2)):path.resolve(path.dirname(file),spec);
   return load([base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)));
  }
  const timer=mock?(fn,ms)=>{assert.equal(ms,6000);assert(mock.oriented&&mock.started);return setTimeout(fn,1);}:setTimeout;
  new Function('require','module','exports','setTimeout',js)(req,m,m.exports,timer);return m.exports;
 }
 return load(path.resolve('src/app/api/payments/extract-check-stub/route.ts'));
}
(async()=>{
 const mock={},image=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(route(mock).recognize(image,'remittance_stub','standard'),error=>{
  assert.equal(error.ocrStarted,true);assert.equal(error.stage,'ocr-recognition');assert.equal(error.diagnostics.orientation.rotation,270);
  const pass=error.diagnostics.passTimings[0];assert.equal(pass.stage,'full-document');assert.equal(pass.variant,'native-color');assert.equal(pass.sourceRotation,270);assert(pass.durationMs>=0);assert.equal(error.diagnostics.timeoutMs,6000);assert.deepEqual(error.diagnostics.completedObservations,[]);return true;
 });assert(mock.terminated);
 const response=await route({}).POST(new Request('http://localhost/api/payments/extract-check-stub',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageDataUrl:'data:image/png;base64,'+image.toString('base64'),documentType:'remittance_stub'})}));
 const data=await response.json();assert.equal(response.status,422);assert.equal(data.ocrStarted,true);assert.equal(data.stage,'ocr-recognition');assert(data.diagnostics.passTimings.length);assert(!data.error.includes('brighter'));
 const supplemental={supplemental:true};
 const continued=await route(supplemental).recognize(image,'remittance_stub','standard');
 assert(continued.diagnostics.passTimings[0].status==='completed');
 assert(continued.diagnostics.passTimings[1].status==='timed-out');
 assert(continued.diagnostics.passTimings[1].completedEvidencePreserved);
 assert(continued.diagnostics.passTimings.slice(2).some(p=>p.status==='completed'),'Recovery must run after supplemental timeout');
 const before=JSON.stringify(continued);supplemental.late({data:{text:'STALE LATE RESULT',confidence:100,blocks:[]}});await new Promise(r=>setImmediate(r));
 assert.equal(JSON.stringify(continued),before,'Late timed-out result cannot overwrite returned evidence');
 assert(before.includes('PRESERVED FIRST OBSERVATION'));
 assert(supplemental.terminated);
 console.log('PASS completed first observation survives optional timeout, worker retired, recovery resumes, late evidence ignored');
 console.log('PASS sloped/flat header, incompatible/neighbor exclusion, independent support, truthful diagnostics, real timer/error propagation');
 if(process.argv[2]){
  for(const file of process.argv.slice(2,4))assert(path.relative(process.cwd(),path.resolve(file)).startsWith('..'),'Retained photo and optical diagnostics must stay outside repository');
  const bytes=fs.readFileSync(process.argv[2]),start=performance.now();
  const response=await route().POST(new Request('http://localhost/api/payments/extract-check-stub',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageDataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),documentType:'remittance_stub',retryStrategy:'standard'})}));
  const result=await response.json();const report={httpStatus:response.status,durationMs:performance.now()-start,sourceHash:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),result};
  fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
  assert.equal(result.diagnostics.orientation.rotation,270);assert.equal(result.diagnostics.passTimings[0].sourceRotation,270);assert.equal(result.diagnostics.passTimings[0].rotation,0);
  assert.equal(result.diagnostics.passTimings[0].status,'completed');assert(result.diagnostics.detailedCosts.worker.created>=1);assert.equal(result.diagnostics.detailedCosts.worker.reused,true);
  // Optical truth for this opt-in retained photograph: all five body bands,
  // not a header/total substituted for a missing body row. Scoring only.
  const physicalCenters=[1117,1177,1244,1305,1367];
  assert.equal(result.diagnostics.geometricRows.length,physicalCenters.length);
  result.diagnostics.geometricRows.forEach((row,i)=>assert(Math.abs(row.y-physicalCenters[i])<25,'Retained physical row geometry must survive bootstrap resizing'));
  if(result.diagnostics.passTimings.some(p=>p.status==='timed-out')&&result.diagnostics.passTimings.some(p=>p.status==='completed')){assert.equal(response.status,200);assert(result.rawText);assert(result.diagnostics.candidateSummaries.length);}
  console.log(JSON.stringify({gate:'PASS retained first pass upright',status:response.status,durationMs:report.durationMs,passes:result.diagnostics.passTimings,orientation:result.diagnostics.orientation}));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
