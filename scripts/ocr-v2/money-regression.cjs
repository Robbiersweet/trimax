/* eslint-disable @typescript-eslint/no-require-imports -- Offline regression CLI. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {decideRowMoney,recognizeSemanticMoney}=require('../../src/app/lib/ocrV2/recognition/semanticMoney.ts');
const {EvidenceLedger}=require('../../src/app/lib/ocrV2/recognition/evidenceLedger.ts');
const {runShadowPipeline}=require('../../src/app/lib/ocrV2/shadow/pipeline.ts');
const o=(raw,confidence,variant='native')=>({id:variant,raw,confidence,variant,money:require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts').paymentMoney(raw)});
assert.equal(decideRowMoney([o('123.45',95)]).cents,12345);
assert.equal(decideRowMoney([o('123.45',60),o('123.45',70,'contrast')]).cents,null,'Correlated weak digits cannot authorize a row');
assert.equal(decideRowMoney([o('123.45',95),o('128.45',60,'contrast')]).cents,null,'Credible alternative preserved');
assert.equal(decideRowMoney([o('1,09?.00',99)]).cents,null);
assert.equal(decideRowMoney([o('123.4',99)]).cents,null);
assert.equal(decideRowMoney([o('123.45',95),o('123.45',90,'contrast')]).cents,12345);
console.log('PASS monetary confidence, ambiguity, no digit repair');
(async()=>{
 if(!process.argv[2])return;
 const manifestPath=path.resolve(process.argv[2]),dir=path.dirname(manifestPath),manifest=JSON.parse(fs.readFileSync(manifestPath));
 assert(path.relative(process.cwd(),manifestPath).startsWith('..'),'Private fixture must remain outside Git');
 const image=fs.readFileSync(path.join(dir,manifest.file));assert.equal(crypto.createHash('sha256').update(image).digest('hex'),manifest.sha256);
 const prior=JSON.parse(fs.readFileSync(path.join(dir,manifest.pairedEvidence))).find(x=>x.payload.result).payload.result;
 const input={attemptId:prior.ledger.documentId,captureSessionId:prior.captureSessionId,sourceImageHash:manifest.sha256,build:'private-money-regression',snapshot:{label:'No business snapshot supplied to local optical test',provenance:[],receivedDate:'2026-09-22',invoices:[],activities:[]}};
 const output=await runShadowPipeline(image,input,async(crops)=>{
  const observations=prior.document.rows.flatMap(r=>r.fusion.observations);
  for(const crop of crops)assert(observations.filter(o=>o.rowId===crop.rowId).every(o=>o.cropReference.sha256===crop.sha256),'Frozen invoice crop unchanged');
  return {observations,versions:prior.models};
 });
 assert.equal(output.document.rows.length,manifest.expectedRows);assert.equal(output.monetary.regions.length,manifest.expectedRows);
 assert(output.monetary.rows.every(r=>r.observations.length===2));assert(output.monetary.totalBounds);assert(output.monetary.observations.some(o=>o.field==='total'));
 // Truth is consulted only after all optical inference and resolver execution.
 const accepted=output.monetary.rows.filter(r=>r.cents!==null);
 output.monetary.rows.forEach((r,i)=>{if(r.cents!==null)assert.equal(r.cents,manifest.amountsCents[i],'Wrong accepted monetary row');});
 if(output.monetary.authority.cents!==null)assert.equal(output.monetary.authority.cents,manifest.totalCents);
 assert.equal(output.document.rows.filter(r=>r.amounts.length).length,accepted.length);
 assert.equal(output.document.header.total?.amount,output.monetary.authority.cents/100);
 assert.deepEqual(output.document.rows.map(r=>r.fusion),prior.document.rows.map(r=>r.fusion),'Invoice fusion unchanged');
 assert.equal(output.document.header.checkDate,prior.document.header.checkDate,'Date acceptance unchanged');
 assert.equal(output.document.header.payor,prior.document.header.payor,'Identity unchanged');
 assert.equal(output.paymentCanApply,false);assert.equal(output.resolver.automaticInvoiceIds.length,0);
 const ledger=new EvidenceLedger(output.ledger.attemptId,output.ledger.documentId,output.ledger.sourceHash);output.ledger.entries.forEach(e=>ledger.append(e));
 const normalized=require('../../src/app/lib/ocrV2/documentNormalization.ts');const paper=await normalized.normalizeDocument(image);
 const reused=await recognizeSemanticMoney(paper.documentColor,output.model,[],ledger);assert.equal(reused.passes,0);assert.equal(reused.reused,output.monetary.passes);
 assert.deepEqual(reused.rows.map(r=>r.cents),output.monetary.rows.map(r=>r.cents));assert.equal(reused.authority.cents,output.monetary.authority.cents);
 fs.writeFileSync(path.join(dir,'money-integrated-replay.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify({gate:'PASS private retained monetary safety/propagation',accepted:accepted.length,total:output.monetary.authority.cents,wrongAccepted:0,reused:reused.reused,timings:output.timings}));
})().catch(e=>{console.error(e);process.exitCode=1;});
