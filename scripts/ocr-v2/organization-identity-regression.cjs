/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const {fuseOrganizationIdentity:fuse}=require('../../src/app/lib/ocrV2/recognition/organizationIdentity.ts');
const expected={documentId:'document',sourceImageHash:'image'};
function observations(names){return names.flatMap((rawText,i)=>['svtrv2','parseq'].map(recognizer=>({...expected,id:`${i}:${recognizer}`,rawText,recognizer,confidence:null,durationMs:1,cropHash:`crop${i}`,sourceRegion:`row${i}`,geometry:{left:0,top:i*30,width:200,height:20},regionType:'property_name'})));}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
for(const names of [['Example Holdings','Example Holdin','ExampleHoldings'],['Acme Property Management','Acme Property Managemen','AcmePropertyManagement'],['Sample Apartments','Sample Apartmen','Sample Apartmcn']])test('Repeated generic stem '+names[0],()=>{const r=fuse(observations(names),expected);assert.equal(r.authority,'authoritative');assert(!r.value.includes('apartments'));assert.equal(r.observations[1].rawText,names[0]);});
test('Conflicting names',()=>assert.equal(fuse(observations(['Acme Holdings','Acme Holdings','Example Holdings','Example Holdings']),expected).authority,'ambiguous'));
for(const raw of ['Apartments','North','Acme','LLC'])test('Insufficient distinctive text '+raw,()=>assert.notEqual(fuse(observations([raw,raw]),expected).authority,'authoritative'));
test('One crop repeated is not independent',()=>{const a=observations(['Sample Apartments']);assert.notEqual(fuse([...a,...a,...a],expected).authority,'authoritative');});
test('Overlapping crops do not create regions',()=>{const a=observations(['Sample Apartments','Sample Apartments']).map(o=>({...o,geometry:{left:0,top:0,width:200,height:20}}));assert.notEqual(fuse(a,expected).authority,'authoritative');});
test('Same pixels with new region IDs do not create regions',()=>{const a=observations(['Sample Apartments','Sample Apartments']).map(o=>({...o,cropHash:'same'}));assert.notEqual(fuse(a,expected).authority,'authoritative');});
test('One recognizer cannot vote twice',()=>{const a=observations(['Sample Apartments','Sample Apartments']).map(o=>({...o,recognizer:'svtrv2'}));assert.notEqual(fuse(a,expected).authority,'authoritative');});
test('Wrong source and payee cannot confer authority',()=>{for(const patch of [{sourceImageHash:'other'},{documentId:'other'},{regionType:'payee_name'}])assert.notEqual(fuse(observations(['Sample Apartments','Sample Apartments']).map(o=>({...o,...patch})),expected).authority,'authoritative');});
test('Contradictory rerun blocks',()=>{const a=observations(['Sample Apartments','Sample Apartments']);assert.equal(fuse([...a,{...a[0],rawText:'Other Apartments'}],expected).authority,'ambiguous');});
test('Raw truncated descriptor is not completed',()=>{const r=fuse(observations(['Sample Apartmen','Sample Apartmen']),expected);assert.equal(r.descriptorEvidence.observed,'apartmen');assert.equal(r.descriptorEvidence.partial,true);assert(r.observations.every(o=>o.rawText==='Sample Apartmen'));});
test('Two-engine distinct one-glyph competitor blocks',()=>{const a=observations(['Sample Apartments','Sample Apartments','Simple Apartments','Simple Apartments']);assert.equal(fuse(a,expected).authority,'ambiguous');});
test('Unclassified competing organization remains ambiguous',()=>assert.equal(fuse(observations(['Sample Apartments','Sample Apartments','Different Trading','Different Trading']),expected).authority,'ambiguous'));
test('Different descriptor classes cannot silently merge',()=>assert.equal(fuse(observations(['Sample Apartments','Sample Apartments','Sample Holdings','Sample Holdings']),expected).authority,'ambiguous'));
console.log(count+' organization consensus tests PASS');
