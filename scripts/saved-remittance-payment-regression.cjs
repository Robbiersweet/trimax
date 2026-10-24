/* eslint-disable @typescript-eslint/no-require-imports -- Exercise production pure historical resolver. */
const assert = require('node:assert/strict');
const {resolveSavedRemittancePayment: resolve} = require('../src/app/lib/savedRemittancePayment.ts');
const rows = ['i1','i2','i3'].map((id,index)=>({id:`audit${index}`,businessId:'b1',action:'invoice.batch_payment_applied',entityId:id,
  createdAt:'2026-10-22T10:00:00Z', details:{businessId:'b1',sourceOcrAttemptId:'original',paymentAttachmentId:'attachment',
    paymentReference:'717',checkDate:'2026-10-01',receivedDate:'2026-10-22',payor:'Glen at North Creek',checkAmount:4286.10,
    batchInvoiceCount:3,invoiceId:id,invoiceNumber:`INV-053${index+6}`,amountApplied:1428.70,paymentOutcome:'paid'}}));
const run = (activities=rows,extra={})=>resolve({businessId:'b1',attemptIds:['original'],activities,...extra});
assert.equal(run().status,'applied'); assert.equal(run().payment.amount,4286.1);
assert.equal(run().payment.allocations.length,3);
assert.equal(run(rows,{attemptIds:['replay','original']}).status,'applied','Verified retained ancestry resolves original audit.');
assert.equal(run(rows,{attemptIds:['fresh-photo']}).status,'none','New photos are not source lineage.');
assert.equal(run([]).status,'none');
assert.equal(run(rows,{businessId:'other'}).status,'none');
assert.equal(run(rows.map(r=>({...r,businessId:'other'}))).status,'none');
assert.equal(run(rows.map(r=>({...r,details:{...r.details,businessId:'other'}}))).status,'none');
assert.equal(run(rows.slice(0,2)).status,'ambiguous','Missing allocation cannot mean fully applied.');
assert.equal(run([...rows,rows[0]]).status,'ambiguous','Duplicate audits cannot inflate batch.');
assert.equal(run(rows.map((r,i)=>({...r,details:{...r.details,amountApplied:i?1428.7:1428.69}}))).status,'ambiguous');
assert.equal(run(rows.map((r,i)=>({...r,details:{...r.details,checkDate:i?'2026-10-01':'2026-10-02'}}))).status,'ambiguous');
assert.equal(run(rows.map(r=>({...r,details:{...r.details,paymentReversed:true}}))).status,'reversed');
assert.equal(run(rows.map((r,i)=>({...r,details:{...r.details,paymentReversed:i===0}}))).status,'ambiguous');
assert.equal(run([...rows,...rows.map(r=>({...r,id:`second-${r.id}`,details:{...r.details,paymentAttachmentId:'second'}}))]).status,'ambiguous');
const legacy = rows.map(r=>({...r,details:{...r.details,sourceOcrAttemptId:null}}));
const trustedOriginal={checkNumber:'717',checkDate:'2026-10-01',payor:'Glen at North Creek',amount:4286.1,invoiceIds:['i1','i2','i3']};
assert.equal(run(legacy,{trustedOriginal}).match,'strict_historical');
assert.equal(run(legacy.slice(0,2),{trustedOriginal}).status,'ambiguous','Corroborated incomplete legacy audits cannot silently become unpaid.');
assert.equal(run(legacy,{trustedOriginal:{...trustedOriginal,invoiceIds:['i1','i2','i3','missing']}}).status,'ambiguous','A complete smaller batch cannot prove the whole original invoice set was paid.');
assert.equal(run(legacy,{trustedOriginal:{...trustedOriginal,invoiceIds:['i1','i2','other']}}).status,'ambiguous','Overlapping conflicting historical allocations require review.');
assert.equal(run(legacy,{trustedOriginal:{...trustedOriginal,checkDate:''}}).status,'none');
assert.equal(run(legacy,{trustedOriginal:{...trustedOriginal,payor:'North Creek Apartments'}}).status,'none');
assert.equal(run(legacy,{trustedOriginal:{...trustedOriginal,invoiceIds:['other']}}).status,'none');
assert.equal(run(legacy,{trustedOriginal:{...trustedOriginal,checkNumber:'2717'}}).status,'none','No suffix check-number matching.');
assert.equal(run(rows,{attemptIds:['fresh-photo'],trustedOriginal}).status,'none','Attributed audits cannot be remapped by historical fallback.');
assert.equal(run(rows.map(r=>({...r,currentBalance:0,details:{...r.details,currentBalance:0}}))).status,'applied','Current paid balances never invalidate historical allocations.');
assert.equal(run(rows.map(r=>({...r,details:{...r.details,amountApplied:'bad'}}))).status,'ambiguous');
console.log('PASS saved-remittance payment history: direct/replay lineage, strict legacy evidence, complete allocations, reversals, ambiguity, tenant scope and balance independence');
