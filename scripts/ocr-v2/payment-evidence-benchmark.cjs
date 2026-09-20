/* eslint-disable @typescript-eslint/no-require-imports -- Offline optical extraction; truth read only after decisions. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {recognizePaymentEvidence}=require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
const {resolveOfflineDocument}=require('../../src/app/lib/ocrV2/resolver/index.ts');
const root=process.argv[2],out=process.argv[3];
(async()=>{
 if(fs.existsSync(out))throw Error('Fresh output directory required');fs.mkdirSync(out,{recursive:true});
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'phase5/resolver-evidence.json'))),results=[];
 for(const old of baseline){
  const id=old.document.id,base=path.join(root,'generalization-v1/pipeline',id),pipeline=JSON.parse(fs.readFileSync(path.join(base,'pipeline.json')));
  const evidence=await recognizePaymentEvidence(fs.readFileSync(path.join(base,'document.png')),pipeline.layout,id);
  fs.writeFileSync(path.join(out,id+'-payment-evidence.json'),JSON.stringify(evidence,null,2));
  const document=structuredClone(old.document);
  document.rows.forEach(row=>{const fresh=evidence.rows.find(r=>r.rowId===row.rowId);row.amounts=fresh.cents===null?[]:fresh.observations.filter(o=>fresh.provenance.includes(o.id)).map(o=>({cents:fresh.cents,raw:o.raw,observationId:o.id,rowId:row.rowId}));});
  document.header={payor:evidence.payor,checkNumber:evidence.checkNumber,checkDate:evidence.checkDate,total:evidence.authoritativeTotal===null?null:{amount:evidence.authoritativeTotal/100,source:'explicit-document-total',payable:true},provenance:'Phase 5B dedicated optical payment evidence; no business lookup'};
  const resolved=resolveOfflineDocument(document,old.snapshot);results.push({id,evidence,resolved});
  fs.writeFileSync(path.join(out,'unscored-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({id,amounts:evidence.rows.map(r=>r.cents),total:evidence.authoritativeTotal,numericTotal:evidence.totalEvidence.cents,check:evidence.checkNumber,date:evidence.checkDate,payor:evidence.payor,ms:evidence.timings.completeMs,passes:evidence.timings.passCount,status:resolved.status}));
 }
 const truth=JSON.parse(fs.readFileSync(path.join(root,'generalization-v1/ground-truth.json'))).documents;
 const invoiceTruth=new Map(JSON.parse(fs.readFileSync(path.join(root,'phase3e/truth.json'))).filter(r=>r.kind==='auto').map(r=>[r.id,r.label.replace(/[^0-9]/g,'').replace(/^0+/, '')]));
 const summary=results.map(r=>{
  const expected=truth.find(t=>t.id===r.id);assert.equal(expected.rows.length,r.evidence.rows.length);
  const wrongAutomatic=r.resolved.automaticInvoiceIds.filter((id,i)=>r.resolved.snapshot.invoices.find(x=>x.id===id).displayId.replace(/[^0-9]/g,'').replace(/^0+/,'')!==invoiceTruth.get(r.resolved.rows[i].rowId)).length;
  assert.equal(wrongAutomatic,0);
  return {id:r.id,rows:r.evidence.rows.length,exactAmounts:r.evidence.rows.filter((x,i)=>x.cents===expected.rows[i].amountCents).length,missing:r.evidence.rows.filter(x=>x.ambiguity==='missing').length,ambiguous:r.evidence.rows.filter(x=>x.ambiguity==='conflicting').length,wrongAmounts:r.evidence.rows.filter((x,i)=>x.cents!==null&&x.cents!==expected.rows[i].amountCents).length,authoritativeTotal:r.evidence.authoritativeTotal,exactTotal:r.evidence.authoritativeTotal===expected.totalCents,numericFooter:r.evidence.totalEvidence.cents,check:r.evidence.checkNumber,date:r.evidence.checkDate,payor:r.evidence.payor,automaticRows:r.resolved.automaticInvoiceIds.length,wrongAutomatic,status:r.resolved.status,timings:r.evidence.timings};
 });fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
