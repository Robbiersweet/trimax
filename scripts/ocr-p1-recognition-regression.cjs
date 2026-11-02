/* eslint-disable @typescript-eslint/no-require-imports -- Private retained pixels/word boxes; no inference, network, database or payment writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..');process.chdir(root);
const allowed=new Set(['src/app/api/payments/extract-check-stub/route.ts','src/app/lib/ocrStructure.ts','src/app/lib/documentFields/maturePaymentFields.ts']);
// Preserve the exact historical P1 scope proof. Current transport-only scope is
// independently checked by ocr-progress-persistence-regression.cjs.
const changed=require('node:child_process').execFileSync('git',['diff','93dfcde696b1b060b06f24215767f756de0fc4a2','9ce66d28e7e10fefd49244bb2266732eb9738c91','--name-only','--','src','supabase','scripts/ocr-legacy-worker.cjs','scripts/ocr-v2/shadow-worker.cjs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
assert(changed.every(p=>allowed.has(p)),'Only the three authorized P1 recognition sources may change; matching, payment, duplicate, workers and SQL remain frozen');
const fixtureFile=path.join(process.env.TRIMAX_P1_FIXTURE_ROOT||path.join(process.env.LOCALAPPDATA,'Trimax/ocr-p1-recognition-20261101'),'fixture.json');
const bytes=fs.readFileSync(fixtureFile),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(bytes),'5a4b763e1f3b5201653884735e7145433dbe635a2ed354349e280d1a8254aa1f','Retained observations and visual scoring truth must not change');
const fixture=JSON.parse(bytes),cache=new Map();
process.env.NEXT_PUBLIC_SUPABASE_URL||='https://isolated.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||='isolated-test';
function load(file){
 if(cache.has(file))return cache.get(file).exports;
 const loaded={exports:{}};cache.set(file,loaded);let source=fs.readFileSync(file,'utf8');
 if(file.replaceAll('\\','/').endsWith('extract-check-stub/route.ts'))source+='\nexport const retainedProbe={reconstructRowsFromOcrGeometry,buildStructuredRowEvidence};';
 const js=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 function req(spec){if(!spec.startsWith('.')&&!spec.startsWith('@/'))return require(spec);const base=spec.startsWith('@/')?path.resolve('src',spec.slice(2)):path.resolve(path.dirname(file),spec);return load([base,base+'.ts',base+'.tsx',base+'/index.ts'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()));}
 new Function('require','module','exports',js)(req,loaded,loaded.exports);return loaded.exports;
}
const route=load(path.join(root,'src/app/api/payments/extract-check-stub/route.ts')).retainedProbe;
const native=fixture.passes.find(p=>p.region==='full-document'&&p.variant==='native-color');
// No expected row/count/amount enters reconstruction or physical ownership.
const rows=route.reconstructRowsFromOcrGeometry(native.words),evidence=route.buildStructuredRowEvidence(rows,fixture.passes,4032);
assert.equal(rows.length,4);assert.equal(evidence.length,4);
for(let i=0;i<4;i++){
 assert(evidence[i].normalizedInvoiceCandidates.includes(fixture.truth.rowNumbers[i]));
 assert.deepEqual([...new Set(evidence[i].amountCandidates.filter(a=>a.selected).map(a=>a.value))],[fixture.truth.amounts[i]]);
}
assert(evidence.some(r=>r.normalizedInvoiceCandidates.length>1),'Optical contradictions must remain visible; grouping cannot repair digits');
const {rowAssignment,rowCenterAt}=load(path.join(root,'src/app/lib/ocrStructure.ts'));
for(const row of rows)for(const word of row.words)assert(rowAssignment(word.bbox,row,rows).accepted,'Own physical row must retain every supported word');
const amountPrefix=Math.trunc(fixture.truth.amounts[2]).toLocaleString('en-US'); const right=native.words.find(w=>w.text.includes(amountPrefix));assert(right);assert(rowAssignment(right.bbox,rows[2],rows).accepted);assert(!rowAssignment(right.bbox,rows[1],rows).accepted);
assert.equal(rowCenterAt({y:20,height:10},900),20,'Unmeasured/horizontal rows retain the existing coordinate contract');
const horizontal=[{y:20,height:10},{y:40,height:10}];assert(!rowAssignment({x0:0,x1:10,y0:29,y1:31},horizontal[0],horizontal).accepted,'Adjacent-row boundary stays excluded');
const fields=load(path.join(root,'src/app/lib/documentFields/maturePaymentFields.ts'));
const word=(text,x0,x1,y0=10,y1=30)=>({text,confidence:90,bbox:{x0,x1,y0,y1}});
assert.deepEqual(fields.splitPaymentCaptionRegion({left:0,top:0,width:300,height:40},[word('SUB',0,40),word('TOTAL:',43,103),word('12.34',110,170)],200,300,200),[],'Splitting cannot discard SUB and turn a subtotal into TOTAL evidence');
const read=(hint,raw)=>({hint,raw,bounds:{left:1,top:1,width:100,height:20}}),date=read('date','DATE:01/01/2026'),check=read('check','CK#:1234'),existingTotal=read('total','TOTAL:$12.34');
assert.deepEqual(fields.appendMissingCaptionReads([date,existingTotal,check],[read('date','DATE:01/01/2026'),read('total','TOTAL:')],3),[date,existingTotal,check],'Supplemental date/label-only crops cannot displace existing accepted fields');
assert.deepEqual(fields.appendMissingCaptionReads([date,check],[read('total','TOTAL:'),read('date','DATE:01/01/2026'),existingTotal],3),[date,check,existingTotal],'Only a missing numeric caption field may fill a spare slot');
const clipped={...read('total','TOTAL:$1,234'),bounds:{left:20,top:10,width:50,height:20}},expanded={...read('total','IOTAL:$12.34***'),bounds:{left:15,top:5,width:90,height:30}};
assert.deepEqual(fields.appendMissingCaptionReads([date,clipped,check],[expanded],3),[date,expanded,check],'An incomplete total can gain pixels only through a containing same-field proposal');
assert.deepEqual(fields.appendMissingCaptionReads([date,clipped,check],[{...expanded,bounds:{...expanded.bounds,left:21}}],3),[date,clipped,check],'A proposal that drops original pixels cannot replace the total');
assert.deepEqual(fields.appendMissingCaptionReads([date,{...clipped,raw:'TOTAL:$12.34'},check],[expanded],3),[date,{...clipped,raw:'TOTAL:$12.34'},check],'A complete existing total stays unchanged even when a larger proposal exists');
const proposed=fields.splitPaymentCaptionRegion(fixture.captionInput.bounds,fixture.captionInput.words,297,2974,1278);
assert(proposed.length);for(const b of proposed){assert(b.left>=fixture.captionInput.bounds.left);assert(b.top>=0);assert(b.left+b.width<=fixture.captionInput.bounds.left+fixture.captionInput.bounds.width);assert(b.top+b.height<=297);}
assert.equal(fields.paymentCaptionHint('~ IOTAL:$12.34***'),'total','Fuzzy text may propose pixels only');
const crop=fixture.crops.find(c=>c.bounds.left===752);assert(crop);
const edge=[{x:28.138148509650115,y:34.712391932433945},{x:2946.4241596879824,y:27.464448662994258}];
assert.deepEqual(fields.captionInsidePaper({...crop.bounds,top:0,height:73},edge),crop.bounds,'Exclude supported outside-paper noise, retaining the full printed line');
assert.deepEqual(fields.captionInsidePaper(crop.bounds),crop.bounds,'Uncertain paper geometry cannot crop pixels');
const crops=fixture.crops.map(({base64,...r})=>({...r,bytes:Buffer.from(base64,'base64')}));for(const c of crops)assert.equal(hash(c.bytes),c.sha256);
const fused=fields.fuseMaturePaymentFields(crops,fixture.observations,'targeted-header',fixture.normalizedHash),total=fused.find(f=>f.field==='documentTotal');
assert.equal(total.value,String(fixture.truth.totalCents));assert.equal(new Set(total.observations.filter(o=>o.value===total.value).map(o=>o.recognizer)).size,2);
for(const label of ['IOTAL','SUBTOTAL']){
 const wrong=fixture.observations.map(o=>o.fieldId===total.fieldId?{...o,raw:label+':$4,588.33***'}:o);
 assert.equal(fields.fuseMaturePaymentFields(crops,wrong,'targeted-header',fixture.normalizedHash).find(f=>f.fieldId===total.fieldId).value,null,'A fuzzy/non-TOTAL caption never qualifies authority');
}
const changedRecognizer=total.observations.find(o=>o.value===total.value).recognizer;
const onlyOne=fixture.observations.map(o=>o.fieldId===total.fieldId&&o.recognizer===changedRecognizer?{...o,raw:'TOTAL:$1.00***'}:o);
assert.equal(fields.fuseMaturePaymentFields(crops,onlyOne,'targeted-header',fixture.normalizedHash).find(f=>f.fieldId===total.fieldId).value,null,'Competing readings cannot be forced into agreement');
assert.throws(()=>fields.fuseMaturePaymentFields(crops,fixture.observations,'another-document',fixture.normalizedHash),/canonical owned field/);
const {completeMoneyAuthority}=load(path.join(root,'src/app/lib/ocrV2/recognition/completeMoneyAuthority.ts'));
const proof={cents:Number(total.value),bounds:total.bounds,sourceHash:total.sourceHash,cropHash:total.cropHash,models:[...new Set(total.observations.map(o=>o.recognizer))],recognizers:[...new Set(total.observations.filter(o=>o.value===total.value).map(o=>o.recognizer))],exactLabelRecognizers:[...new Set(total.observations.filter(o=>total.exactLabelProvenance.includes(o.id)).map(o=>o.recognizer))],provenance:total.provenance};
const authority=completeMoneyAuthority(fixture.monetary,fixture.matureMoney,[proof]);assert.equal(authority.cents,fixture.truth.totalCents);
assert.equal(completeMoneyAuthority(fixture.monetary,fixture.matureMoney,[]).cents,null,'Correct footer/row sum without header proof stays blocked');
assert.equal(completeMoneyAuthority(fixture.monetary,fixture.matureMoney,[{...proof,cents:proof.cents+1}]).cents,null,'A disagreeing header cannot qualify the total');
console.log('PASS retained four-row ownership, source-bound TOTAL crop and exact independent agreement; digit ambiguity, row boundaries, missing/conflicting labels and mismatched sources stay blocked');
