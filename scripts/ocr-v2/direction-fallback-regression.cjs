/* eslint-disable @typescript-eslint/no-require-imports -- Exact external pixels plus bounded adversarial optical tests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),sharp=require('sharp');
const {probeLegacyDirection}=require('../../src/app/lib/ocrLegacyDirection.ts');
const {prepareDirectionSamples}=require('../../src/app/lib/ocrDirectionSamples.ts');
const reference=require('../fixtures/orientation-health-reference.json');
const dir=process.env.TRIMAX_ORIENTATION_EVIDENCE_ROOT||path.join(process.env.LOCALAPPDATA||os.tmpdir(),'Trimax','rc10-orientation');
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const file=process.env.TRIMAX_ORIENTATION_HEALTH_IMAGE||path.join(process.env.LOCALAPPDATA,'Trimax','rc9-health-classification','canonical.jpg');
 const original=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(original).digest('hex'),reference.sha256);
 const observations=[],failures=[];
 for(const turn of [0,90,180,270]){
  const bytes=turn?await sharp(original).rotate(turn).png().toBuffer():original;
  const r=await probeLegacyDirection(bytes);observations.push({test:'retained-rotation-'+turn,...r});
  assert.equal(r.rotation,(360-turn)%360);assert(r.certain);assert(r.observations.every(o=>o.status==='completed'));
  assert(r.sampling.axes.every(a=>a.sampleSource==='source-preview-no-bands'));
  assert(r.observations.every(o=>Math.max(o.sampleDimensions.width,o.sampleDimensions.height)<=1800));
  console.log('PASS historical source rotated',turn,'selected',r.rotation);
 }
 const white=await sharp({create:{width:1200,height:800,channels:3,background:'white'}}).png().toBuffer();
 const dot=Buffer.from('<svg width="1200" height="800"><rect width="1200" height="800" fill="white"/><circle cx="600" cy="400" r="2" fill="#aaa"/></svg>');
 const sparse=Buffer.from('<svg width="1200" height="800"><rect width="1200" height="800" fill="white"/><text x="50" y="100" font-size="40">Invoice Amount</text></svg>');
 const half=await sharp(original).resize({width:1000}).png().toBuffer(),meta=await sharp(half).metadata();
 // A pixel-symmetric, equally readable upright/upside-down source has no
 // authoritative direction. Large glyphs also exercise the no-band fallback.
 const words='<text x="40" y="110">Invoice Amount</text><text x="40" y="220">Property Total</text><text x="40" y="330">Check Description</text>';
 const ambiguous=await sharp(Buffer.from(`<svg width="1000" height="1000"><rect width="1000" height="1000" fill="white"/><g font-size="64">${words}</g><g font-size="64" transform="translate(1000 1000) rotate(180)">${words}</g></svg>`)).png().toBuffer();
 const makePair=bottom=>sharp({create:{width:1000,height:meta.height*2+80,channels:3,background:'white'}}).composite([{input:half,left:0,top:0},{input:bottom,left:0,top:meta.height+80}]).png().toBuffer();
 const opposing=await makePair(await sharp(half).rotate(180).png().toBuffer());
 for(const [name,input,expected] of [['blank',white,null],['near-blank',await sharp(dot).png().toBuffer(),null],['sparse',await sharp(sparse).png().toBuffer(),null],['ambiguous-opposing-text',ambiguous,null],['ambiguous-opposing-document',opposing,null],['dense-text',await makePair(half),0]]){
  const r=await probeLegacyDirection(input);observations.push({test:name,...r});
  if(r.rotation!==expected||r.certain!==(expected!==null)){failures.push(name);fs.writeFileSync(path.join(dir,name+'.png'),input);console.log('FAIL',name,'selected',r.rotation);}else console.log('PASS',name);
 }
 const faint=await prepareDirectionSamples(fs.readFileSync('scripts/fixtures/faint-remittance.png'));assert(faint.axes.some(a=>a.regions.length));assert(faint.axes.every(a=>a.sampleSource==='text-bands'));
 const engine=require('../ocr-legacy-worker.cjs').loadEngine(),stages=[];
 const response=await engine.progress.withLegacyProgress(async(stage)=>stages.push(stage),()=>engine.route.POST(new Request('http://offline.invalid/extract',{method:'POST',headers:{'Content-Type':'application/json','x-ocr-observation-scope':crypto.randomUUID()},body:JSON.stringify({imageDataUrl:'data:image/jpeg;base64,'+original.toString('base64'),documentType:'remittance_stub',retryStrategy:'standard',diagnosticReplay:true})})));
 const result=await response.json();assert.equal(response.status,200);assert(stages.includes('orientation_complete'));assert(stages.includes('ocr_complete'));
 // Expectations are scoring-only: none enter the image/pipeline request.
 for(const token of reference.expectedText)assert(result.rawText.includes(token),token);
 assert.notEqual(result.paymentCanApply,true);
 const terminal=require('../ocr-legacy-evidence.cjs').terminalSummary(result,'offline');assert.equal(terminal.paymentCanApply,false);
 fs.writeFileSync(path.join(dir,'regression-result.json'),JSON.stringify({status:failures.length?'FAIL':'PASS',failures,sha256:reference.sha256,observations,stages,httpStatus:response.status,terminal},null,2));
 console.log('PASS exact historical optical evidence restored; payment authority false');
 assert.deepEqual(failures,[],'All adversarial orientation cases must pass before release');
})().catch(e=>{console.error(e);process.exitCode=1;});
