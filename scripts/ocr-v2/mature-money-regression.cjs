/* eslint-disable @typescript-eslint/no-require-imports -- Offline safety and private optical gates. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {normalizeVisualMoney,fuseMoneyObservations,MONEY_MODELS}=require('../../src/app/lib/ocrV2/recognition/matureMoney.ts');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const expected={rowId:'r1',field:'row_amount',documentId:'doc',sourceHash:'source',cropHash:'crop'};
const obs=raws=>raws.map((raw,i)=>({...expected,id:String(i),recognizer:MONEY_MODELS[i],raw,confidence:null,confidenceCalibrated:false,durationMs:1}));
for(const raw of ['$ 1,099.00','1.099,00','1,099,00','1099.00'])assert.equal(normalizeVisualMoney(raw),109900);
for(const raw of ['1,099.CO','1,099.C0','1,099.0','109900','1,09?.00','1.00 2.00'])assert.equal(normalizeVisualMoney(raw),null);
assert.equal(normalizeVisualMoney('1,099.99'),109999);
assert.equal(fuseMoneyObservations(obs(['123.45','123.45','123.46']),expected).cents,12345);
assert.equal(fuseMoneyObservations(obs(['123.45','128.45','129.45']),expected).cents,null);
assert.equal(fuseMoneyObservations(obs(['123.45','123.45']),expected).cents,null);
assert.equal(fuseMoneyObservations([...obs(['123.45','128.45','129.45']),obs(['123.45'])[0]],expected).cents,null);
assert.equal(fuseMoneyObservations([...obs(['123.45','123.45','123.45']),{...obs(['128.45'])[0],id:'repeat'}],expected).cents,null);
for(const key of Object.keys(expected))assert.throws(()=>fuseMoneyObservations(obs(['123.45','123.45','123.45']).map((o,i)=>i===0?{...o,[key]:'other'}:o),expected),/physical field pixels/);
console.log('PASS mature monetary formatting, distinct votes, ambiguity and pixel provenance');

(async()=>{
 const root=process.argv[2];if(!root)return;
 const frozen=JSON.parse(fs.readFileSync(path.join(root,'selection-frozen.json')));
 const moduleHash=hash(fs.readFileSync(path.resolve('src/app/lib/ocrV2/recognition/matureMoney.ts')));
 const safety=JSON.parse(fs.readFileSync(path.join(root,'selection-safety-amendment.json')));
 assert(frozen&&safety.moduleHash===moduleHash,'Reviewed safety-only amendment changed');
 const aliases={svtr:'svtrv2',parseq:'parseq',ppocr:'ppocrv5'};
 for(const split of ['development','heldout','native']){
  const labels=JSON.parse(fs.readFileSync(path.join(root,split+'-labels.json'))),data=JSON.parse(fs.readFileSync(path.join(root,split,'mature.json')));
  let acceptedRows=0;
  for(const field of labels){
   assert.equal(hash(fs.readFileSync(path.join(root,split,field.file))),field.sha256);
   const scope={rowId:field.id,field:field.field,documentId:field.documentId,sourceHash:field.sourceHash,cropHash:field.sha256};
   const observations=data.observations.filter(o=>o.id===field.id).map(o=>({...scope,id:o.recognizer+':'+o.id,recognizer:aliases[o.recognizer],raw:o.raw,confidence:null,confidenceCalibrated:false,durationMs:o.ms}));
   const decision=fuseMoneyObservations(observations,scope);
   const earlier=JSON.parse(fs.readFileSync(path.join(root,split+'-score.json'))).fusion.find(r=>r.id===field.id);
   assert.equal(decision.cents,earlier.cents,'Safety amendment changed a frozen corpus decision');
   if(decision.cents!==null){assert.equal(decision.cents,field.cents,'Wrong accepted '+field.id);if(field.field==='row_amount')acceptedRows++;}
  }
  assert.equal(acceptedRows,{development:17,heldout:7,native:4}[split]);
  console.log('PASS frozen '+split+': '+acceptedRows+' exact accepted rows, zero wrong');
 }
 const fixtureFile=process.argv[3];if(!fixtureFile)return;
 const {runShadowPipeline}=require('../../src/app/lib/ocrV2/shadow/pipeline.ts');
 const dir=path.dirname(fixtureFile),fixture=JSON.parse(fs.readFileSync(fixtureFile));
 const image=fs.readFileSync(path.join(dir,fixture.file));assert.equal(hash(image),fixture.sha256);
 const prior=JSON.parse(fs.readFileSync(path.join(dir,fixture.pairedEvidence))).find(x=>x.payload.result).payload.result;
 const batchDir=path.join(root,'integrated-'+Date.now());fs.mkdirSync(batchDir);
 const toWSL=f=>{const p=fs.realpathSync.native(f);return '/mnt/'+p[0].toLowerCase()+'/'+p.slice(3).replaceAll('\\','/');};
 const output=await runShadowPipeline(image,{attemptId:prior.ledger.documentId,captureSessionId:prior.captureSessionId,sourceImageHash:fixture.sha256,build:'private-mature-money-gate',snapshot:{label:'No business hints',provenance:[],receivedDate:'2026-09-22',invoices:[],activities:[]}},async(crops,documentId,sourceHash,moneyCrops)=>{
  const native=JSON.parse(fs.readFileSync(path.join(root,'native','inputs.json')));
  const inputs=crops.map((crop,i)=>{const file='crop-'+i+'.png';fs.writeFileSync(path.join(batchDir,file),crop.bytes);return{id:crop.rowId,documentId,file,sha256:crop.sha256};});
  for(const [i,crop]of moneyCrops.entries()){assert(native.some(n=>n.sha256===crop.sha256&&n.field===crop.field),'Benchmark and pipeline money pixels differ');const file='money-'+i+'.png';fs.writeFileSync(path.join(batchDir,file),crop.bytes);inputs.push({id:crop.rowId,documentId,file,sha256:crop.sha256,field:crop.field});}
  fs.writeFileSync(path.join(batchDir,'inputs.json'),JSON.stringify(inputs));
  const run=cp.spawnSync('wsl',['-d','Ubuntu','--','env','HF_HUB_OFFLINE=1','/home/robbi/trimax-ocr/benchmark-venv/bin/python',toWSL(path.resolve('scripts/ocr-v2/dataset/recognize.py')),toWSL(batchDir)],{windowsHide:true,encoding:'utf8',timeout:600000});
  fs.writeFileSync(path.join(batchDir,'runtime.log'),run.stderr||'');assert.equal(run.status,0,'Combined worker model batch failed');
  const data=JSON.parse(fs.readFileSync(path.join(batchDir,'recognition.json')));
  const old=prior.document.rows.flatMap(r=>r.fusion.observations);
  const observations=data.observations.filter(o=>!o.field&&aliases[o.recognizer]).map(o=>{
   const previous=old.find(p=>p.rowId===o.id&&p.recognizer===aliases[o.recognizer]);assert(previous);assert.equal(previous.cropReference.sha256,o.sha256,'Invoice pixels changed');assert.equal(previous.rawText,o.raw,'Invoice recognizer output changed');return previous;
  });
  return{observations,versions:data.versions,modelTimings:data.models,moneyObservations:data.observations.filter(o=>o.field).map(o=>({id:'money:'+o.recognizer+':'+o.field+':'+o.id,rowId:o.id,field:o.field,documentId,sourceHash,cropHash:o.sha256,recognizer:aliases[o.recognizer],raw:o.raw,confidence:null,confidenceCalibrated:false,durationMs:o.ms}))};
 });
 // Truth is used only after inference; no labels are available to the subprocess.
 const rows=output.matureMoney.filter(r=>r.field==='row_amount');
 assert.equal(rows.length,5);assert.equal(rows.filter(r=>r.cents!==null).length,4);
 rows.forEach((r,i)=>{if(r.cents!==null)assert.equal(r.cents,fixture.amountsCents[i]);});
 assert.equal(output.monetary.authority.cents,fixture.totalCents);assert.equal(output.model.total.cents,fixture.totalCents);
 assert.equal(output.document.header.total.amount*100,fixture.totalCents);
 assert.deepEqual(output.document.rows.map(r=>r.fusion),prior.document.rows.map(r=>r.fusion));
 for(const key of ['checkDate','payor','checkNumber'])assert.deepEqual(output.document.header[key],prior.document.header[key]);
 assert.equal(output.paymentCanApply,false);assert.equal(output.resolver.status,'review-required');assert.equal(output.resolver.automaticInvoiceIds.length,0);
 assert.equal(output.ledger.entries.filter(e=>e.stage==='phase6-mature-money').length,18);
 assert(output.ledger.entries.some(e=>e.recognizer.includes('tesseract')),'Original Tesseract evidence retained');
 fs.writeFileSync(path.join(root,'integrated-result.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify({gate:'PASS retained combined production-worker pipeline',accepted:4,wrongAccepted:0,total:output.monetary.authority.cents,timings:output.timings,models:output.modelTimings}));
})().catch(e=>{console.error(e);process.exitCode=1;});
