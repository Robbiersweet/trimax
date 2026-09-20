/* eslint-disable @typescript-eslint/no-require-imports -- Offline evidence replay; labels are opened only after decisions. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {resolveOfflineDocument}=require('../../src/app/lib/ocrV2/resolver/index.ts');
const {selectObservedHeader}=require('../../src/app/lib/remittanceAttempt.ts');
const {normalizeInvoiceNumber}=require('../../src/app/lib/remittanceMatching.ts');
const root=process.argv[2],out=process.argv[3];fs.mkdirSync(out,{recursive:true});
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,''));
const fusion=read('phase4/fusion-evidence.json'), invoices=read('phase5/invoices-current.json'),logs=read('phase5/activities-current.json');
const metadata=read('phase5/invoice-metadata-current.json');
// Compile the existing pure eligibility helper, including its extensionless import.
// This avoids copying its deposit/collection policy into the offline adapter.
function loadPure(file){const ts=require('typescript'),loaded={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(spec=>loadPure(path.resolve(path.dirname(file),spec+'.ts')),loaded,loaded.exports);return loaded.exports;}
const {invoiceCollectionAmountDue}=loadPure(path.resolve('src/app/lib/invoiceEligibility.ts'));
const payments=logs.filter(a=>a.action==='invoice.batch_payment_applied');
// These attachment identifiers identify historical events, never optical invoice answers.
const attachment={A:'9be86d64-c78f-4d55-9300-f83ef366bcb5',C:'762ac37d-a55b-414c-982a-35e5d3cb7662',D:'febbe0ca-bb74-4485-93f7-d5ae22a34bc7'};
const results=[];
for(const id of [...new Set(fusion.map(r=>r.evidence.observations[0].cropReference.documentId))]){
 const pipeline=read(`generalization-v1/pipeline/${id}/pipeline.json`),bytes=fs.readFileSync(path.join(root,`generalization-v1/pipeline/${id}/document.png`));
 const sourceHash=crypto.createHash('sha256').update(bytes).digest('hex');
 const events=payments.filter(a=>id.startsWith('check')?a.details.paymentReference===id.slice(5):a.details.paymentAttachmentId===attachment[id]);
 if(id!=='B'&&!events.length)throw Error('Missing historical attachment/payment event for '+id);
 const cutoff=events.length?Math.min(...events.map(a=>Date.parse(a.created_at))):Infinity;
 const provenance=[];
 const records=invoices.filter(i=>Date.parse(i.created_at)<=cutoff).map(i=>{
  const subsequent=payments.filter(a=>a.entity_id===i.id&&Date.parse(a.created_at)>=cutoff).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
  const meta=metadata.find(m=>m.id===i.id);if(!meta)throw Error('Missing deposit/correction metadata');
  let paid=Number(i.amount_paid),status=i.status,depositStatus=meta.deposit_status;
  if(subsequent.length){const e=subsequent[0];paid=Number(e.details.resultingAmountPaid)-Number(e.details.amountApplied);if(!Number.isFinite(paid)||paid<0)throw Error('Invalid historical balance');if(status.toLowerCase()==='paid')status='sent';provenance.push(`${i.id}: prior paid=${paid}, event=${e.id}; collectible status reconstructed from recorded applied payment`);}
  if(subsequent[0]?.details.depositPayment&&Date.parse(meta.deposit_requested_at)<cutoff){depositStatus='requested';provenance.push(`${i.id}: prior active deposit reconstructed from request timestamp, amount, and depositPayment event ${subsequent[0].id}`);}
  return {id:i.id,displayId:i.display_id,customerName:i.customer_name,projectTitle:i.project_title,invoiceAmount:Number(i.invoice_amount.replace(/[^0-9.-]/g,'')),amountPaid:paid,status,collectionAmountDue:invoiceCollectionAmountDue({...i,...meta,status,amount_paid:paid,deposit_status:depositStatus}),splitParentInvoiceId:i.split_parent_invoice_id,splitChildrenCount:invoices.filter(c=>c.split_parent_invoice_id===i.id&&Date.parse(c.created_at)<=cutoff).length,correctionNotes:meta.notes,depositStatus,depositRequestedAmount:meta.deposit_requested_amount};
 });
 const snapshot={label:events.length?'Historical benchmark reconstruction before attachment payment; current amounts and non-paid correction states retained conservatively':'Current read-only invoice snapshot; no paid records revived',provenance,receivedDate:events[0]?.details.paymentDate??'2026-09-20',invoices:records,activities:logs.filter(a=>Date.parse(a.created_at)<cutoff).map(a=>({id:a.id,action:a.action,entityId:a.entity_id,entityLabel:a.entity_label,details:a.details,createdAt:a.created_at}))};
 const rawPasses=pipeline.fields.observations.filter(o=>!o.rowId&&o.status==='completed').map(o=>({text:o.rawText,region:o.field,variant:o.variant,pageMode:o.configuration.psm,words:o.words.map(w=>({text:w.text,confidence:w.confidence,bbox:{x0:w.bounds.left,y0:w.bounds.top,x1:w.bounds.left+w.bounds.width,y1:w.bounds.top+w.bounds.height}}))}));
 // Existing header authority policy, unchanged. Never prefix a numeric crop with an invented TOTAL label.
 const header=selectObservedHeader(rawPasses,[]);
 const rows=fusion.filter(r=>r.evidence.observations[0].cropReference.documentId===id).map((r,index)=>{
  const layout=pipeline.layout.rows[index];if(!layout)throw Error('Physical row missing');
  const observations=pipeline.fields.observations.filter(o=>o.rowId===layout.id&&o.status==='completed');
  return {rowId:r.rowId,fusion:r.evidence,geometry:{...layout.bounds,coordinateSpace:pipeline.layout.coordinateSpace,sourceHash},
   amounts:observations.filter(o=>o.field==='amount').flatMap(o=>o.moneyCandidates.map(m=>({cents:m.cents,raw:m.text,observationId:`${id}:${o.regionId}:${o.variant}`,rowId:r.rowId}))),units:[],accountCandidates:[]};
 });
 const document={id,rows,rawPasses,header:{payor:header.payor,checkNumber:header.checkNumber,checkDate:header.checkDate,total:header.documentTotal,provenance:'Existing selectObservedHeader over retained non-row optical passes; no benchmark labels or historical payment total supplied'}};
 const result=resolveOfflineDocument(document,snapshot);result.observedTotalCandidates=pipeline.fields.observations.filter(o=>o.field==='total').flatMap(o=>o.moneyCandidates);result.snapshotEventIds=events.map(e=>e.id);results.push(result);
}
// Persist unscored outcomes before reading benchmark answers.
fs.writeFileSync(path.join(out,'resolver-evidence.json'),JSON.stringify(results,null,2));
const truth=new Map(read('phase3e/truth.json').filter(r=>r.kind==='auto').map(r=>[r.id,r.label]));
const summary=results.map(r=>({id:r.document.id,rows:r.rows.length,rawExact:r.rows.filter(x=>normalizeInvoiceNumber(x.evidence.fusion.observations.find(o=>o.recognizer==='svtrv2').formatNormalizedText)===normalizeInvoiceNumber(truth.get(x.rowId))).length,
 fusedExact:r.rows.filter(x=>normalizeInvoiceNumber(x.evidence.fusion.topCandidate??'')===normalizeInvoiceNumber(truth.get(x.rowId))).length,
 provisionalExact:r.rows.filter(x=>normalizeInvoiceNumber(r.snapshot.invoices.find(i=>i.id===x.provisionalInvoiceId)?.displayId??'')===normalizeInvoiceNumber(truth.get(x.rowId))).length,
 automaticRows:r.automaticInvoiceIds.length,wrongAutomaticRows:r.automaticInvoiceIds.filter((recordId,index)=>normalizeInvoiceNumber(r.snapshot.invoices.find(i=>i.id===recordId).displayId)!==normalizeInvoiceNumber(truth.get(r.rows[index].rowId))).length,
 reviewRows:r.rows.length-r.automaticInvoiceIds.length,status:r.status,counts:r.counts,total:r.document.header.total,observedTotalCandidates:r.observedTotalCandidates,enumerationMs:r.enumerationMs,durationMs:r.durationMs}));
if(summary.some(r=>r.wrongAutomaticRows))throw Error('Wrong automatic assignment safety gate failed');
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
