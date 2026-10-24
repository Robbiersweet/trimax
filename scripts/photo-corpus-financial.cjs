/* eslint-disable @typescript-eslint/no-require-imports -- Read-only replay of the actual financial resolvers. */
const fs=require('node:fs'),crypto=require('node:crypto');
const {resolveRemittanceAttempt}=require('../src/app/lib/remittanceAttempt.ts');
const {resolveOfflineDocument}=require('../src/app/lib/ocrV2/resolver/index.ts');
const {moneyCents}=require('../src/app/lib/money.ts');
function loadSnapshot(binding){
 const bytes=fs.readFileSync(binding.path);
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==binding.sha256)throw Error('Financial snapshot hash differs');
 const retained=JSON.parse(bytes);
 if(retained.source.attemptId!==binding.sourceAttemptId||!retained.source.businessId||!retained.snapshot.invoices.length)throw Error('Financial snapshot attribution missing');
 return retained;
}
const same=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&a.every(id=>b.includes(id));
function resolve(engine,result,snapshot){
 if(engine==='legacy'){
  if(!result.result?.evidence)throw Error('Missing immutable legacy evidence');
  const actual=resolveRemittanceAttempt(result.result.evidence,snapshot.invoices,snapshot.activities,{role:'owner',receivedDate:snapshot.receivedDate,fingerprint:''});
  return {ids:actual.resolverResult.resolvedMatches.map(i=>i.id),eligibleIds:actual.resolverResult.matchTrace.filter(t=>t.accepted&&t.eligible).map(t=>t.invoiceId),totalCents:moneyCents(actual.resolverResult.matchedTotal),eligible:actual.reconciliationResult.eligible,blockers:actual.reconciliationResult.blockers,reviewRequired:false};
 }
 if(!result.document)throw Error('Missing v2 financial document');
 const actual=resolveOfflineDocument(result.document,snapshot);
 const ids=actual.rows.map(r=>r.provisionalInvoiceId).filter(Boolean);
 const eligibleIds=[...new Set(actual.rows.flatMap(r=>r.alternatives.filter(a=>a.eligible).map(a=>a.invoiceId)))];
 const totalCents=ids.reduce((n,id)=>{const i=snapshot.invoices.find(i=>i.id===id);return n+moneyCents(i.collectionAmountDue??i.invoiceAmount-i.amountPaid);},0);
 return {ids,eligibleIds,totalCents,eligible:actual.status==='resolved',automaticInvoiceIds:actual.automaticInvoiceIds,reviewRequired:actual.status!=='resolved'||result.resolver?.status!=='automatic',pipelineStatus:result.resolver?.status, pipelineAutomaticInvoiceIds:result.resolver?.automaticInvoiceIds??[],blockers:actual.audit.flatMap(a=>a.blockers),status:actual.status};
}
function scoreFinancial(doc,engine,result){
 const retained=loadSnapshot(doc.snapshot),current=loadSnapshot(doc.currentSnapshot);
 if(retained.source.businessId!==current.source.businessId)throw Error('Cross-business financial snapshot');
 const actual=resolve(engine,result,retained.snapshot),expected=doc.truth.rows.map(r=>r.invoiceRecordId);
 const wrongClientIds=actual.eligibleIds.filter(id=>retained.snapshot.invoices.find(i=>i.id===id)?.customerName!==doc.truth.clientName);
 const correct=same(actual.ids,expected)&&same([...new Set(actual.eligibleIds)],expected);
 const selectedAllocations=actual.ids.map(id=>{const invoice=retained.snapshot.invoices.find(i=>i.id===id),printed=doc.truth.rows.find(r=>r.invoiceRecordId===id);return {invoiceId:id,selectedCents:moneyCents(invoice.collectionAmountDue??invoice.invoiceAmount-invoice.amountPaid),printedCents:printed?.cents??null};});
 const allocationsMatch=selectedAllocations.length===expected.length&&selectedAllocations.every(a=>a.selectedCents===a.printedCents);
 const pipelineIds=actual.pipelineAutomaticInvoiceIds??[];
 const pipelineSafe=engine==='legacy'||(actual.pipelineStatus==='automatic'?same(pipelineIds,expected):actual.pipelineStatus==='review-required'&&pipelineIds.length===0);
 const currentPaid=expected.every(id=>{const i=current.snapshot.invoices.find(i=>i.id===id);return i&&moneyCents(i.collectionAmountDue??i.invoiceAmount-i.amountPaid)===0;});
 const paidGuard=currentPaid?resolve(engine,result,current.snapshot):null;
 const fields={matchedInvoiceRecords:correct&&pipelineSafe?'PASS':'FAIL',clientIsolation:wrongClientIds.length?'FAIL':'PASS',selectedRowAmounts:allocationsMatch?'PASS':'FAIL',selectedTotal:actual.totalCents===doc.truth.total?'PASS':'FAIL',financialReconciliation:pipelineSafe&&actual.totalCents===doc.truth.total&&actual.eligible?(actual.reviewRequired?'PASS_CORRECT_RECORDS_REVIEW_REQUIRED':'PASS'):'FAIL',alreadyPaidCollectibleGuard:!paidGuard?'NOT_APPLICABLE_CURRENTLY_UNPAID':!paidGuard.eligible&&!paidGuard.ids.some(id=>expected.includes(id))?'PASS':'FAIL'};
 return {fields,financial:{snapshot:retained.source,currentSnapshot:current.source,...actual,selectedAllocations,pipelineSafe,wrongClientIds,currentPaidGuard:paidGuard,fingerprintScope:'Not available in isolated image replay; no fingerprint invented',paymentApplied:false}};
}
module.exports={loadSnapshot,scoreFinancial};
