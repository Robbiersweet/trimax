/* eslint-disable @typescript-eslint/no-require-imports -- Offline saved-evidence evaluation, labels loaded after fusion. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {fuseInvoiceObservations:fuse,normalizeInvoice,align}=require('../../src/app/lib/ocrV2/fusion/index.ts');
const root=process.argv[2],output=process.argv[3];fs.mkdirSync(output,{recursive:true});
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const modelNames={svtr:'svtrv2',parseq:'parseq',ppocr:'ppocrv5'};
const groups=new Map();
for(const [file,recognizer] of Object.entries(modelNames))for(const row of read(file+'.json').rows.filter(r=>r.kind==='auto'&&r.variant==='native')){
 const bytes=fs.readFileSync(path.join(root,row.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);
 const source=fs.readFileSync(path.join(root,'..','generalization-v1','pipeline',row.documentId,'document.png'));
 const obs={id:`${recognizer}:${row.id}:native`,fieldType:'invoice',scope:'row',rowId:row.id,recognizer,rawText:row.raw,sequenceConfidence:null,characterConfidences:null,confidenceCalibrated:false,cropReference:{documentId:row.documentId,rowId:row.id,sourceImageSha256:crypto.createHash('sha256').update(source).digest('hex'),baseCropSha256:row.sha256,sha256:row.sha256,path:row.file,variant:'native'},durationMs:row.ms,visualWarnings:[]};
 groups.set(row.id,[...(groups.get(row.id)||[]),obs]);
}
// Complete decisions and serialize before the scorer opens truth.
const results=[...groups].map(([rowId,observations])=>({rowId,evidence:fuse(observations)}));
fs.writeFileSync(path.join(output,'fusion-evidence.json'),JSON.stringify(results,null,2));
const truth=new Map(read('truth.json').filter(r=>r.kind==='auto').map(r=>[r.id,r.label]));assert.equal(results.length,24);
let exact=0,recall=0,wronglyConfident=0,invented=0,errors=0,characters=0,rawExact=0,rawErrors=0;
const scored=results.map(r=>{
 const expected=normalizeInvoice(truth.get(r.rowId)).formatNormalizedText,ev=r.evidence;
 const distance=value=>align(expected,value||'').filter(p=>p.anchorIndex===null||p.textIndex===null||expected[p.anchorIndex]!==value[p.textIndex]).length;
 const correct=expected===ev.topCandidate,present=ev.candidates.some(c=>c.value===expected);
 const raw=ev.observations.find(o=>o.recognizer==='svtrv2').formatNormalizedText;
 exact+=correct;recall+=present;rawExact+=expected===raw;rawErrors+=distance(raw);errors+=distance(ev.topCandidate);characters+=expected.replace('-','').length;
 wronglyConfident+=!correct&&ev.confidence.confidentlySelected;
 for(const candidate of ev.candidates)invented+=!ev.observations.some(o=>o.formatNormalizedText===candidate.value);
 return {...r,expected,correct,present,expectedLocation:correct?'top':present?'alternate':'absent'};
});
// Latency uses unrelated observations; excludes recognizers, file IO and scoring.
const sample=structuredClone(results[0].evidence.observations).map(o=>({...o,rawText:'INV9876'}));
for(let i=0;i<100;i++)fuse(sample);
const times=[];for(let i=0;i<1000;i++){const start=performance.now();for(let j=0;j<5;j++)fuse(sample);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
const summary={rowCount:24,rawSvtr:{exact:rawExact,characterAccuracy:1-rawErrors/characters},fusion:{exact,characterAccuracy:1-errors/characters,candidateRecall:recall,ambiguous:scored.filter(r=>!r.evidence.confidence.confidentlySelected).length,wronglyConfident,invented},sharedVisualAmbiguity:scored.filter(r=>r.evidence.sharedVisualAmbiguity).map(r=>r.rowId),latency:{fiveRowsMedianMs:times[500],cropMedianMs:times[500]/5,p95FiveRowsMs:times[950]},rows:scored};
assert.equal(invented,0);assert.equal(wronglyConfident,0);assert(exact>=rawExact);
fs.writeFileSync(path.join(output,'fusion-report.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,rows:undefined},null,2));
