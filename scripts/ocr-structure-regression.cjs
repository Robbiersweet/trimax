/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(source, bindings = {}) {
  const exports = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', ...Object.keys(bindings), js)(require, exports, ...Object.values(bindings));
  return exports;
}
const structure = compile(fs.readFileSync('src/app/lib/ocrStructure.ts', 'utf8'));
const matching = compile(fs.readFileSync('src/app/lib/remittanceMatching.ts', 'utf8'));
const routeText = fs.readFileSync('src/app/api/payments/extract-check-stub/route.ts', 'utf8');
const route = compile(routeText.replace(/import[\s\S]*?from\s+"[^"]+";/g, '') + '\nexports.test = { buildStructuredRowEvidence, sameBandAmountCandidates, mergeStructuredAmountCandidates, unresolvedOcrRow, hasTargetableStructure, documentHeaderObservations };', { ...structure, ...matching });
const box = (y, x0 = 100, x1 = 180) => ({ x0, x1, y0: y - 8, y1: y + 8 });
const word = (text, y, region = 'document', confidence = 90, bbox = box(y)) => ({ text, confidence, bbox, region, variant: 'grayscale', pageMode: 'sparse', rotation: 0 });
const numbers = ['0513','0514','0515','0518','0519'];
const units = ['U05','H10','Q08','U03','A10'];
const rows = numbers.map((n,i) => ({ y: 100+i*22, height:16, words:[word('INV'+n,100+i*22),word(units[i],100+i*22,'document',90,box(100+i*22,210,240)),word('1,099.00',100+i*22,'document',90,box(100+i*22,600,700))], tokens:[],text:'',score:100 }));
const column = numbers.map((n,i) => word('1NV'+n.replace(/0/g,'O').replace(/5/g,'S'),100+i*22,'invoice-column-diagnostic',95));
const attempts = [{ words:[...rows.flatMap(r=>r.words),...column] }];
const evidence = route.test.buildStructuredRowEvidence(rows,attempts,800);
assert.equal(evidence.length,5);
assert.equal(route.test.hasTargetableStructure(0),false);
assert.equal(route.test.hasTargetableStructure(1),false);
assert.equal(route.test.hasTargetableStructure(5),true);
assert.equal(route.test.unresolvedOcrRow(evidence[0]),false);
assert.equal(route.test.unresolvedOcrRow({...evidence[0],normalizedInvoiceCandidates:[]}),true);
assert.equal(route.test.unresolvedOcrRow({...evidence[0],amountCandidates:[]}),true);
assert.equal(route.test.unresolvedOcrRow({...evidence[0],normalizedInvoiceCandidates:['INV-0513','INV-0518']}),true);

evidence.forEach((r,i)=> {
  assert.deepEqual(r.normalizedInvoiceCandidates,['INV-'+numbers[i]]);
  assert.equal(r.invoiceEvidenceByPass.length,1);
  assert.equal(r.invoiceEvidenceByPass[0].confidence,95);
  assert(r.unitLikeTokens.includes(units[i]));
  assert(!r.unitLikeTokens.includes(units[(i+1)%5]));
});
assert.equal(structure.rowAssignment(box(111),rows[0],rows).accepted,false);
assert.equal(structure.normalizeInvoiceColumnToken('1NV-O5I8'), 'INV-0518');
assert.equal(structure.normalizeInvoiceColumnToken('O5I8',true), 'INV-0518');
for(const raw of ['1,099.00','08/19/2026','HOUSE0518','U0518']) assert.equal(structure.normalizeInvoiceColumnToken(raw,true),'');
assert.equal(structure.normalizeInvoiceColumnToken('0518'), '');
const amounts = route.test.mergeStructuredAmountCandidates([], [{raw:'29',value:29,score:200,confidence:99,bbox:box(100,650,680)},{raw:'1,099.00',value:1099,score:50,confidence:80,bbox:box(100,600,700)}]);
assert.equal(amounts.find(a=>a.selected).value,1099);
const joined = route.test.sameBandAmountCandidates(rows[0],[word('1,',100,'document',90,box(100,600,620)),word('099.00',100,'document',90,box(100,625,700))]);
assert(joined.some(a=>a.value===1099));
const header = matching.selectRemittanceHeaderEvidence([{text:'INV0513 U05 29\nINV0514 H10 1099\nINV0515 Q08 1099',region:'document',variant:'one',confidence:90}]);
assert.equal(header.evidence,null);
const bodyRecovery=['local-gray','local-binary'].map(variant=>({text:'INV0513 U05 Painting service apartment interior walls ceilings and doors complete\n1,099.00',region:'stub-row-recovery-row-1',variant,pageMode:'sparse-text',confidence:90}));
assert(matching.selectRemittanceHeaderEvidence(bodyRecovery).evidence,'Reproduce why isolated row crops must not vote on a document footer');
assert.equal(matching.selectRemittanceHeaderEvidence(route.test.documentHeaderObservations(bodyRecovery)).evidence,null);
const realFooter={text:'TOTAL $5,495.00',region:'stub-total-footer',variant:'local-gray',pageMode:'sparse-text',confidence:90};
assert.equal(matching.selectRemittanceHeaderEvidence(route.test.documentHeaderObservations([...bodyRecovery,realFooter])).evidence.amount,5495);

assert.equal(header.checkNumber,'');
assert(routeText.includes('observedHeader.documentTotal ?? { amount: 0, source: "none"'));
const invoices=numbers.map((n,i)=>({id:n,displayId:'INV-'+n,customerName:'North Creek Apartments',projectTitle:units[i]+' Paint',invoiceAmount:1099,amountPaid:0,status:'sent'}));
const match = matching.findRemittanceMatches(invoices,'TOTAL $5,495.00','North Creek Apartments',evidence);
assert.equal(match.confidence,'verified');assert.equal(match.matches.length,5);assert.equal(match.matchedTotal,5495);
const noisy = structuredClone(evidence);
noisy[3].normalizedInvoiceCandidates.push('INV-0515');
noisy[3].invoiceEvidenceByPass.push({raw:'INV-O5IS',normalized:['INV-0515'],confidence:45});
assert.equal(matching.findRemittanceMatches(invoices,'TOTAL $5,495.00','North Creek Apartments',noisy).confidence,'verified');
const unknown = matching.findRemittanceMatches(invoices,'body 2227','North Creek Apartments',evidence,{amount:0,source:'none',payable:false});
assert.equal(unknown.confidence,'review');
assert.equal(unknown.resolvedMatches.length,5);
async function sourceRegression(){
  const component=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8');
  const start=component.indexOf('  async function selectProductionCaptureSource(');
  const end=component.indexOf('  async function buildImageCaptureStillComparison(',start);
  let calls=0;
  let allFail=false;
  const select=compile(component.slice(start,end)+'\nexports.select=selectProductionCaptureSource;', {...structure,observationScopeRef:{current:"regression-scope"},fetch:async()=>{
    const index=calls++;
    if(allFail || index===1) throw new Error('synthetic still crop failure');
    return {ok:true,status:200,text:async()=>JSON.stringify({evaluations:[{usable:true,id:index===0?'canvas':'still-full',completenessScore:index===0?20:80,invoiceTokens:index===0?2:5,rowCount:index===0?2:5,explicitTotal:index===0?0:5495}]})};
  }}).select;
  const candidates=['canvas','still-crop','still-full'].map(id=>({id,label:id,file:new File(['image'],'test.jpg',{type:'image/jpeg'})}));
  const result=await select(candidates);
  assert.equal(calls,3);assert.equal(result.selectedCandidate.id,'still-full');
  assert(result.diagnosticLines.some(l=>l.includes('synthetic still crop failure')));
  assert(result.diagnosticLines.some(l=>l.includes('Canvas evaluation')));
  allFail=true;
  const failed=await select(candidates);
  assert.equal(failed.sources.filter(source=>source.status==='failure').length,3);
  assert(failed.reason.includes('Every candidate evaluation failed'));
  assert.equal(failed.selectedCandidate.id,'canvas');
  console.log('Structural OCR regressions passed: isolated source failure, five exclusive rows, normalization/deduplication, unknown header, money fragments and exact reconciliation.');
}
module.exports=sourceRegression();
