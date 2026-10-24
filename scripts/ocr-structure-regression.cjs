/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(source, bindings = {}) {
  const exports = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', ...Object.keys(bindings), js)(spec=>spec==='./money.ts'?require('../src/app/lib/money.ts'):require(spec), exports, ...Object.values(bindings));
  return exports;
}
const structure = compile(fs.readFileSync('src/app/lib/ocrStructure.ts', 'utf8'));
const matching = compile(fs.readFileSync('src/app/lib/remittanceMatching.ts', 'utf8'));
const routeText = fs.readFileSync('src/app/api/payments/extract-check-stub/route.ts', 'utf8');
const route = compile(routeText.replace(/import[\s\S]*?from\s+"[^"]+";/g, '') + '\nexports.test = { buildStructuredRowEvidence, sameBandAmountCandidates, mergeStructuredAmountCandidates, unresolvedOcrRow, hasTargetableStructure, documentHeaderObservations };', { ...require('../src/app/lib/documentFields/complementaryRowBands.ts'), ...require('../src/app/lib/money.ts'), ...require('../src/app/lib/documentFields/rowAmountOwnership.ts'), ...require('../src/app/lib/documentFields/unitFieldOwnership.ts'), ...require('../src/app/lib/documentFields/tableHeaderOwnership.ts'), ...structure, ...matching });
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
console.log('Structural OCR regressions passed: five exclusive rows, normalization/deduplication, unknown header, money fragments, exact reconciliation. Camera source competition was removed; guided intake has separate rendered tests.');
module.exports=Promise.resolve();

// A unit-like prose word has a different physical owner from the leading unit.
const captionWords=[['Property',10,90],['Invoice',200,265],['Date',300,350],['Description',500,615],['Amount',800,870]].map(([t,x0,x1])=>word(t,40,'full-document',95,box(40,x0,x1)));
const ownedRows=[0,1].map((i)=>{const y=100+i*40;return {y,height:16,words:[word('INV-'+(9001+i),y,'full-document',95,box(y,200,280)),word(i?'Ull':'107',y,'full-document',95,box(y,500,530)),word(i?'full':'ull',y,'full-document',95,box(y,570,605)),word('interior',y,'full-document',95,box(y,620,685)),word('paint',y,'full-document',95,box(y,700,750)),word('100.00',y,'full-document',95,box(y,800,870))],tokens:[],text:'',score:100};});
const ownedEvidence=route.test.buildStructuredRowEvidence(ownedRows,[{words:[...captionWords,...ownedRows.flatMap(r=>r.words)]}],1000);
assert.equal(ownedEvidence.length,2);
assert.deepEqual(ownedEvidence[0].unitLikeTokens,[],'Unreadable leading 107 must not become I07 or borrow prose ull as U11');
assert(ownedEvidence[0].rawRowText.includes('ull'),'Keep literal original OCR for audit');
assert(!/\bull\b/i.test(ownedEvidence[0].text),'Financial row text excludes only the unowned unit-like prose token');
assert(ownedEvidence[1].unitLikeTokens.includes('U11'),'Identical ULL glyphs in the measured unit prefix remain legitimate evidence');
assert(/\bUll\b/.test(ownedEvidence[1].text));
const ownedInvoices=ownedRows.map((r,i)=>({id:'owned-'+i,displayId:'INV-'+(9001+i),customerName:'Example Apartments',projectTitle:i?'Unit U11':'Unit I07',invoiceAmount:100,amountPaid:0,status:'sent'}));
const {createRemittanceEvidence,resolveRemittanceAttempt}=require('../src/app/lib/remittanceAttempt.ts');
const ownedAttempt=(invoices)=>resolveRemittanceAttempt(createRemittanceEvidence({attemptId:'synthetic-owned-units',capture:{sources:[]},rawPasses:[],physicalRows:ownedEvidence,assignments:[],diagnostics:[],headerEvidence:{payor:'Example Apartments',checkNumber:'9876',checkDate:'2027-01-01',documentTotal:{amount:200,source:'explicit-document-total',payable:true}}}),invoices,[],{role:'owner',receivedDate:'2027-01-01',fingerprint:''});
assert.equal(ownedAttempt(ownedInvoices).reconciliationResult.eligible,true);
assert.equal(ownedAttempt(ownedInvoices.map((r,i)=>i?{...r,projectTitle:'Unit B01'}:r)).reconciliationResult.eligible,false,'A genuine owned unit mismatch still blocks the unchanged financial resolver');
console.log('PASS unit-column ownership: no prose-derived unit, no glyph invention, raw audit preserved and real unit mismatch still blocked');

const {ownedUnitField}=require('../src/app/lib/documentFields/unitFieldOwnership.ts');
const explicitUnit=word('Unit',40,'full-document',80,box(40,400,440)),preferredB=word('B01',100,'full-document',95,box(100,400,435)),descriptionA=word('A01',100,'full-document',99,box(100,500,535));
const priority=ownedUnitField({y:100,height:16},[preferredB,descriptionA],[...captionWords,explicitUnit]);
assert(priority.owns(preferredB),'Explicit UNIT column takes precedence over higher-confidence DESCRIPTION');assert(!priority.owns(descriptionA));
const ambiguousUnits=ownedUnitField({y:100,height:16},[preferredB,descriptionA],[...captionWords,explicitUnit,word('Unit',40,'full-document',90,box(40,650,690))]);
assert.equal(ambiguousUnits.available,false,'Two distinct UNIT columns must not silently choose a description prefix');
