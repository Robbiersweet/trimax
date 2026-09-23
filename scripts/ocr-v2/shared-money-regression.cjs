/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic shared field boundaries. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {moneyForConsumer,legacyMoneyEvidence}=require('../../src/app/lib/documentFields/moneyContract.ts');
const {completeMoneyFields}=require('../../src/app/lib/documentFields/moneyService.ts');
const {EvidenceLedger}=require('../../src/app/lib/ocrV2/recognition/evidenceLedger.ts');
function packet(raw=['123.45','123.45','123.45']){
 const bounds={left:80,top:20,width:20,height:10},ledger=new EvidenceLedger('doc','doc','pixels');
 const fields=completeMoneyFields([{rowId:'r',field:'row_amount',bounds,bytes:Buffer.alloc(0),sha256:'crop'}],raw.map((value,i)=>({id:'o'+i,rowId:'r',field:'row_amount',documentId:'doc',sourceHash:'pixels',cropHash:'crop',recognizer:['svtrv2','parseq','ppocrv5'][i],raw:value,confidence:null,confidenceCalibrated:false,durationMs:1})),{},ledger);
 return {version:'shared-money-1',captureSessionId:'capture',canonicalHash:'canonical',normalizedHash:'pixels',normalization:{sourceImage:{sha256:'canonical'},normalization:{perspectiveApplied:false,deskewDegrees:0,rotation:0,documentDimensions:{width:100,height:100}},documentGeometry:{bounds:{left:0,top:0,width:100,height:100}}},rows:[{id:'r',bounds:{left:0,top:10,width:100,height:30}}],fields,monetary:{authority:{cents:null,reason:'Unknown'}}};
}
const scope={captureSessionId:'capture',canonicalHash:'canonical'},frame={...scope,rotation:0,width:100,height:100};
const evidence={attemptId:'capture',physicalRows:[{rowId:'legacy',y:25,amountCandidates:[]}],headerEvidence:{documentTotal:null}};
const p=packet(),a=moneyForConsumer(p,scope),b=moneyForConsumer(p,scope);
assert.deepEqual(a,b);assert.notEqual(a,b);p.fields[0].observations[0].raw='999.99';assert.equal(a.fields[0].observations[0].raw,'123.45');assert(Object.isFrozen(a.fields[0].observations));
const projected=legacyMoneyEvidence(evidence,packet(),frame);assert.equal(projected.physicalRows[0].amountCandidates[0].value,123.45);assert.equal(evidence.physicalRows[0].amountCandidates.length,0);assert(projected.sharedMonetaryEvidence.fields[0].observations.length===3);
assert.equal(legacyMoneyEvidence(evidence,packet(['123.45','123.46','123.47']),frame).physicalRows[0].amountCandidates.length,0);
assert.equal(legacyMoneyEvidence(evidence,packet(['123.CO','123.C0','123.CO']),frame).physicalRows[0].amountCandidates.length,0);
assert.throws(()=>moneyForConsumer(packet(),{...scope,captureSessionId:'stale'}),/Stale/);
assert.throws(()=>legacyMoneyEvidence(evidence,packet(),{...frame,rotation:90}),/coordinate transform/);
const duplicate=packet();duplicate.rows.push({...duplicate.rows[0],id:'overlap'});assert.throws(()=>legacyMoneyEvidence(evidence,duplicate,frame),/Ambiguous/);
const conflict=structuredClone(evidence);conflict.physicalRows[0].amountCandidates=[{value:200,selected:true}];assert(legacyMoneyEvidence(conflict,packet(),frame).physicalRows[0].amountCandidates.every(c=>!c.selected));
const unknown=legacyMoneyEvidence(evidence,packet(),frame);assert.equal(unknown.headerEvidence.documentTotal,null);
const total=packet();total.monetary.authority={cents:12345,reason:'Established existing total authority'};assert.equal(legacyMoneyEvidence(evidence,total,frame).headerEvidence.documentTotal.amount,123.45);
const component=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8');assert(component.includes('version!==ocrAttemptVersion.current||latestScan.current?.attemptId!==history.attemptId'));
console.log('PASS shared identical immutable evidence, same-capture isolation, complete/ambiguous digits, exclusive geometry, conflicts, existing total contract');
if(process.argv[2]){
 const before=JSON.parse(fs.readFileSync(process.argv[2])),after=JSON.parse(fs.readFileSync(process.argv[3])),legacy=JSON.parse(fs.readFileSync(process.argv[4])).result;
 const stable=rows=>rows.map(r=>({row:r.rowId,cents:r.cents,bounds:r.bounds,raw:r.observations.map(o=>({recognizer:o.recognizer,raw:o.raw,cropHash:o.cropHash}))}));
 assert.deepEqual(stable(after.matureMoney),stable(before.matureMoney));assert.deepEqual(after.document.rows.map(r=>r.fusion.candidates.map(c=>({...c,documentId:'same-capture'}))),before.document.rows.map(r=>r.fusion.candidates.map(c=>({...c,documentId:'same-capture'}))));
 assert.equal(after.monetary.authority.cents,before.monetary.authority.cents);assert.equal(after.document.header.payor,before.document.header.payor);assert.equal(after.resolver.status,before.resolver.status);
 const base=structuredClone(legacy.evidence);base.attemptId=after.captureSessionId;
 const t=performance.now(),result=legacyMoneyEvidence(base,after.sharedMoney,{captureSessionId:after.captureSessionId,canonicalHash:after.sourceImageHash,rotation:legacy.diagnostics.orientation.rotation,width:legacy.diagnostics.documentWidth,height:legacy.diagnostics.documentHeight});
 const rows=result.physicalRows.map(r=>({id:r.rowId,invoice:r.normalizedInvoiceCandidates,amounts:r.amountCandidates.filter(a=>a.selected).map(a=>a.value)}));
 assert.equal(rows.filter(r=>r.amounts.length).length,4);for(const r of rows)for(const v of r.amounts)assert.equal(v,1099);assert.equal(result.headerEvidence.documentTotal,null);
 assert.deepEqual(result.physicalRows.map(r=>r.normalizedInvoiceCandidates),base.physicalRows.map(r=>r.normalizedInvoiceCandidates));
 fs.writeFileSync(process.argv[5],JSON.stringify({projectionMs:performance.now()-t,rows,evidence:result},null,2));
 console.log('PASS exact retained image: legacy 4/5 exact amounts, zero wrong; unchanged v2; no business hints');
}
