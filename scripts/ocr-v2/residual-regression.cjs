/* eslint-disable @typescript-eslint/no-require-imports -- Arithmetic and integration safety tests. */
const assert=require('node:assert/strict');
const {deriveResidualAmount}=require('../../src/app/lib/ocrV2/recognition/residualAmount.ts');
const {resolveDocumentWithResidual:resolveOfflineDocument}=require('../../src/app/lib/ocrV2/resolver/residual.ts');
const {fuseInvoiceObservations}=require('../../src/app/lib/ocrV2/fusion/index.ts');
const input=()=>({documentId:'test',sourceHash:'a'.repeat(64),authoritativeTotal:{cents:20000,provenance:['total']},
 rows:[0,1].map(i=>({rowId:'r'+i,bounds:{left:0,top:i*30,width:100,height:20},ownership:{left:70,top:i*30,width:30,height:20},cropHash:'crop'+i,cents:i?10000:null,authoritative:!!i,provenance:i?['m1']:[]})),
 passes:['native','grayscale'].map(observationId=>({observationId,anchors:[0,1].map(i=>({left:0,top:i*30,width:20,height:10}))}))});
let suites=0;const test=(name,fn)=>{fn();suites++;console.log('PASS',name);};
test('one unresolved row is exact derived arithmetic, without mutation',()=>{const i=input(),before=JSON.stringify(i),r=deriveResidualAmount(i);assert.equal(r.evidence.derivedAmount,10000);assert.equal(r.evidence.arithmeticDifference,0);assert.equal(r.evidence.evidenceClass,'derived-arithmetic');assert.equal(JSON.stringify(i),before);});
for(const [name,change]of [
 ['two unresolved rows',i=>{i.rows[1].cents=null;}],['total unknown',i=>{i.authoritativeTotal.cents=null;}],
 ['ambiguous confirmed row',i=>{i.rows[1].authoritative=false;}],['duplicate row ID',i=>{i.rows[1].rowId='r0';}],
 ['overlapping allocations',i=>{i.rows[1].bounds.top=0;}],['negative residual',i=>{i.authoritativeTotal.cents=9999;}],
 ['fractional cents',i=>{i.rows[1].cents=10000.1;}],['unsafe integer',i=>{i.authoritativeTotal.cents=Number.MAX_SAFE_INTEGER+1;}],
 ['missing total provenance',i=>{i.authoritativeTotal.provenance=[];}],['unstable row count',i=>{i.passes[1].anchors.pop();}],
 ['duplicate page pass',i=>{i.passes[1].observationId='native';}],['missing ownership',i=>{i.rows[0].ownership=null;}],
 ['competing anchor allocation',i=>{i.passes[1].anchors[1]=i.passes[1].anchors[0];}],
 ['already known arithmetic mismatch',i=>{i.rows[0].cents=10001;i.rows[0].authoritative=true;}]
])test(name+' blocks derivation',()=>{const i=input();change(i);assert.equal(deriveResidualAmount(i).evidence,null);});
test('zero residual is nonnegative evidence, not guessed positive money',()=>{const i=input();i.authoritativeTotal.cents=10000;assert.equal(deriveResidualAmount(i).evidence.derivedAmount,0);});
function doc(){const residual=deriveResidualAmount(input());return {id:'test',rawPasses:[],residualEvidence:residual,
 rows:input().rows.map((r,i)=>({rowId:r.rowId,geometry:{...r.bounds,sourceHash:'a'.repeat(64)},units:[],accountCandidates:[],amounts:i?[{cents:10000,raw:'100.00',rowId:r.rowId,observationId:'m1'}]:[],
 fusion:fuseInvoiceObservations([{id:r.rowId+'-invoice',fieldType:'invoice',scope:'row',rowId:r.rowId,recognizer:'svtrv2',rawText:'INV-'+(9001+i),sequenceConfidence:null,characterConfidences:null,confidenceCalibrated:false,cropReference:{documentId:'test',rowId:r.rowId,sourceImageSha256:'a'.repeat(64),baseCropSha256:'b'.repeat(64),sha256:'b'.repeat(64),path:'synthetic',variant:'native'},durationMs:0,visualWarnings:[]}])})),
 header:{payor:'Example Apartments',checkNumber:null,checkDate:null,total:{amount:200,source:'explicit-document-total',payable:true},provenance:'Synthetic contract test'}};}
const snapshot=()=>({label:'synthetic',provenance:[],receivedDate:'2026-01-01',activities:[],invoices:[9001,9002].map(n=>({id:'id'+n,displayId:'INV-'+n,customerName:'Example Apartments',projectTitle:'A01',invoiceAmount:100,amountPaid:0,status:'sent',splitParentInvoiceId:'same-parent'}))});
test('distinct split children resolve with exact residual; OCR stays unresolved',()=>{const d=doc(),before=JSON.stringify(d),r=resolveOfflineDocument(d,snapshot());assert.equal(r.status,'resolved');assert.equal(new Set(r.automaticInvoiceIds).size,2);assert.equal(r.counts.afterStrictAmountUnit,1);assert.equal(d.rows[0].amounts.length,0);assert.equal(JSON.stringify(d),before);});
test('missing identity still blocks authority; absent check/date alone do not',()=>{const d=doc();d.header.payor=null;const r=resolveOfflineDocument(d,snapshot());assert.equal(r.automaticInvoiceIds.length,0);assert(r.audit.some(a=>a.blockers.some(b=>b.includes('Payor'))));});
test('forged residual value rejected',()=>{const d=doc();d.residualEvidence.evidence.derivedAmount++;assert.throws(()=>resolveOfflineDocument(d,snapshot()),/residual document/);});
test('changed observed row invalidates residual',()=>{const d=doc();d.rows[1].amounts[0].cents++;assert.throws(()=>resolveOfflineDocument(d,snapshot()),/current physical/);});
test('fractional header cents cannot round into a proof',()=>{const d=doc();d.header.total.amount+=0.001;assert.throws(()=>resolveOfflineDocument(d,snapshot()),/residual document/);});
test('derived candidate trace never reports an OCR amount',()=>{const r=resolveOfflineDocument(doc(),snapshot());assert.equal(r.rows[0].alternatives[0].trace.ocrRowAmount,null);assert.equal(r.rows[0].alternatives[0].trace.derivedRowAmount,100);assert.equal(r.rows[0].alternatives[0].amountEvidenceClass,'derived-arithmetic');});
test('derived amount cannot invent invoice candidates',()=>{const d=doc();d.rows[0].fusion=fuseInvoiceObservations(d.rows[0].fusion.observations.map(o=>({...o,rawText:'INV-9?01'})));assert.equal(resolveOfflineDocument(d,snapshot()).automaticInvoiceIds.length,0);});
test('duplicate business records cannot gain authority',()=>{const s=snapshot();s.invoices[1].displayId='INV-9001';assert.equal(resolveOfflineDocument(doc(),s).automaticInvoiceIds.length,0);});
test('diagnostic UI separates unresolved OCR from derived arithmetic',()=>{
 const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const compiled=ts.transpileModule(fs.readFileSync('src/app/components/OcrDerivedAmountView.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 const m=new Module('residual-view-test',module);m.paths=module.paths;m._compile(compiled,'residual-view-test.cjs');
 const html=renderToStaticMarkup(React.createElement(m.exports.default,{payload:{result:{residual:deriveResidualAmount(input())}}}));
 assert(html.includes('OCR amount: unresolved'));assert(html.includes('Derived amount: $100.00'));assert(html.includes('not OCR-recognized digits'));
});
console.log(suites+' residual arithmetic and resolver safety suites passed');
