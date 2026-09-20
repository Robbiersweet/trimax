/* eslint-disable @typescript-eslint/no-require-imports -- Offline contract/adversarial tests. */
const assert = require('node:assert/strict');
const { fuseInvoiceObservations: fuse, normalizeInvoice, align, WEIGHTS } = require('../../src/app/lib/ocrV2/fusion/index.ts');
const crop = { documentId:'doc',rowId:'row',sourceImageSha256:'a'.repeat(64),baseCropSha256:'b'.repeat(64),sha256:'b'.repeat(64),path:'retained/row.png',variant:'native' };
function observations(tokens) { return tokens.map((rawText,i)=>({id:`o${i}`,fieldType:'invoice',scope:'row',rowId:'row',recognizer:['svtrv2','parseq','ppocrv5'][i],rawText,sequenceConfidence:null,characterConfidences:null,confidenceCalibrated:false,cropReference:{...crop},durationMs:1,visualWarnings:[]})); }
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('safe normalization preserves raw digits and does not repair letters',()=>{
 assert.equal(normalizeInvoice(' “inv 1234” ').formatNormalizedText,'INV-1234');
 assert.equal(normalizeInvoice('INVOS13').formatNormalizedText,'INV-OS13');
 assert.equal(normalizeInvoice('INVOS13').format,'incomplete');
 for(const raw of ['INV-12','NV-1234','INV-123','INV--1234'])assert.notEqual(normalizeInvoice(raw).format,'modern');
 assert.equal(normalizeInvoice('402').formatNormalizedText,'402');
 assert.notEqual(normalizeInvoice('-402').format,'legacy');
});
test('exact and strong agreements are distinct',()=>{
 const exact=fuse(observations(['INV1234','INV-1234','inv1234']));assert.equal(exact.ambiguityClass,'EXACT_AGREEMENT');assert(exact.confidence.confidentlySelected);
 const strong=fuse(observations(['INV1234','INV1234','INVO234']));assert.equal(strong.ambiguityClass,'STRONG_AGREEMENT');assert(strong.confidence.confidentlySelected);
});
test('disagreement retains two observed complete alternatives, not a synthetic digit',()=>{
 const r=fuse(observations(['INV1233','INV1235','INV1235']));assert.equal(r.topCandidate,'INV-1235');assert.equal(r.ambiguityClass,'ISOLATED_GLYPH_AMBIGUITY');assert(!r.confidence.confidentlySelected);
 assert.deepEqual(r.candidates.map(c=>c.value).sort(),['INV-1233','INV-1235']);assert(!r.candidates.some(c=>c.value==='INV-1234'));
 assert.equal(r.positions.filter(p=>p.disputed).length,1);
});
test('all numeric wrong-looking alternatives remain ambiguous without database repair',()=>{
 const r=fuse(observations(['INV1234','INV1284','INV1284']));assert(!r.confidence.confidentlySelected);assert(r.sharedVisualAmbiguity);
});
test('multi-glyph and missing characters align using edits, not fixed indexes',()=>{
 const r=fuse(observations(['INV1234','INV12945','INV124']));assert.equal(r.ambiguityClass,'MULTI_GLYPH_AMBIGUITY');assert(r.positions.some(p=>p.alternatives.some(a=>a.character===null)));
 assert.equal(align('INV-1234','INV-124').filter(p=>p.textIndex===null).length,1);
 assert.equal(align('INV-1234','INV-12345').filter(p=>p.anchorIndex===null).length,1);
});
test('missing prefix/suffix never supplies candidate digits',()=>{
 for(const tokens of [['NV1234','INV12','?'],['?','###','']]){const r=fuse(observations(tokens));assert.equal(r.topCandidate,null);assert.equal(r.candidates.length,0);assert(!r.confidence.confidentlySelected);}
});
test('shared low-confidence agreement is not confident',()=>{
 const obs=observations(['INV1234','INV1234','INV1234']);obs[0].sequenceConfidence=.2;obs[1].characterConfidences=[.2];
 const r=fuse(obs);assert.equal(r.ambiguityClass,'EXACT_AGREEMENT');assert(r.sharedVisualAmbiguity);assert(!r.confidence.confidentlySelected);
});
test('independent optical warning vetoes strong agreement',()=>{
 const obs=observations(['INV1234','INV1234','INV1234']);obs[0].visualWarnings=['faint-strokes'];assert(!fuse(obs).confidence.confidentlySelected);
});
test('variants and diagnostic Tesseract cannot multiply votes',()=>{
 const obs=observations(['INV1234','INV1235','INV1236']);const baseline=fuse(obs);
 for(let i=0;i<20;i++)obs.push({...structuredClone(obs[2]),id:'repeat'+i,cropReference:{...crop,variant:'local-contrast'}});
 obs.push({...structuredClone(obs[0]),id:'tess',recognizer:'tesseract',rawText:'INV9999'});
 const result=fuse(obs);assert.equal(result.topCandidate,baseline.topCandidate);assert.equal(result.candidates.find(c=>c.value==='INV-1236').supportScore,WEIGHTS.ppocrv5);assert(!result.candidates.some(c=>c.value==='INV-9999'));
});
test('one recognizer is never independent agreement',()=>{const r=fuse(observations(['INV1234']));assert(!r.confidence.confidentlySelected);});
test('legacy numeric evidence stays numeric',()=>{const r=fuse(observations(['402','402','402']));assert.equal(r.topCandidate,'402');assert.equal(r.candidates[0].format,'legacy');});
test('money and document evidence cannot enter row invoice fusion',()=>{for(const fieldType of ['amount','total']){const obs=observations(['402','402','402']);obs[0].fieldType=fieldType;assert.throws(()=>fuse(obs),/Only row invoice/);}const obs=observations(['402']);obs[0].scope='document';assert.throws(()=>fuse(obs));});
test('provenance, immutability and cross-row separation',()=>{
 const obs=observations(['INV1234','INV1234','INV1234']);const before=JSON.stringify(obs);const r=fuse(obs);assert.equal(JSON.stringify(obs),before);assert.equal(r.observations[0].rawText,'INV1234');assert.equal(r.candidates[0].sourceObservations.length,3);
 for(const key of ['rowId','documentId','baseCropSha256','sourceImageSha256']){const bad=structuredClone(obs);bad[1].cropReference[key]='wrong';assert.throws(()=>fuse(bad));}
 const duplicate=structuredClone(obs);duplicate[1].id=duplicate[0].id;assert.throws(()=>fuse(duplicate));
});
test('exhaustive observed-token invariant and input-order independence',()=>{
 const values=['INV1000','INV1001','INV1002','INV10O2','INV102','402'];
 for(const a of values)for(const b of values)for(const c of values){const obs=observations([a,b,c]),r=fuse(obs);assert.equal(r.topCandidate,fuse([...obs].reverse()).topCandidate);for(const candidate of r.candidates){assert(obs.some(o=>normalizeInvoice(o.rawText).formatNormalizedText===candidate.value));for(const id of candidate.sourceObservations)assert.equal(candidate.value.replace(/\D/g,''),obs.find(o=>o.id===id).rawText.replace(/\D/g,''));}}
});
console.log(`${count} fusion suites passed, including 216 adversarial combinations.`);
