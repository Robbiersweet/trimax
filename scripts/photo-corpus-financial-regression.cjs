/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic scorer adversaries; never production evidence. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createRemittanceEvidence}=require('../src/app/lib/remittanceAttempt.ts');
const {scoreFinancial,loadSnapshot}=require('./photo-corpus-financial.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-financial-score-'));
try{
 const invoice={id:'record-one',displayId:'INV-9001',customerName:'Example Apartments',projectTitle:'Routine service',invoiceAmount:123.45,amountPaid:0,status:'sent'};
 const snapshot={invoices:[invoice,{...invoice,id:'other-client',displayId:'INV-9002',customerName:'Another Property'}],activities:[],receivedDate:'2026-01-01',label:'Synthetic scorer adversary',provenance:[]};
 const binding=(name,data,businessId='business-one')=>{const file=path.join(dir,name+'.json'),bytes=Buffer.from(JSON.stringify({source:{attemptId:name,businessId,scope:'Synthetic unit test'},snapshot:data}));fs.writeFileSync(file,bytes);return {path:file,sourceAttemptId:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
 const doc={snapshot:binding('unpaid',snapshot),currentSnapshot:binding('paid',{...snapshot,invoices:snapshot.invoices.map(i=>({...i,amountPaid:123.45,collectionAmountDue:0,status:'paid'}))}),truth:{rows:[{invoiceRecordId:invoice.id}],total:12345,clientName:invoice.customerName}};
 const evidence=createRemittanceEvidence({attemptId:'synthetic',capture:{sources:[]},rawPasses:[],assignments:[],diagnostics:[],headerEvidence:{checkNumber:'9876',checkDate:'2026-01-01',payor:invoice.customerName,documentTotal:{amount:123.45,source:'explicit-document-total',payable:true}},physicalRows:[{text:'INV-9001 123.45',y:30,height:20,normalizedInvoiceCandidates:['INV-9001'],rawInvoiceLikeTokens:['INV-9001'],unitLikeTokens:[],dateTokens:[],amountCandidates:[{raw:'123.45',value:123.45,selected:true}]}]});
 const result={result:{evidence}};
 assert(Object.values(scoreFinancial(doc,'legacy',result).fields).every(f=>f==='PASS'));
 assert.equal(scoreFinancial({...doc,truth:{...doc.truth,rows:[{invoiceRecordId:'other-client'}]}},'legacy',result).fields.matchedInvoiceRecords,'FAIL','Recognized display number alone is insufficient');
 assert.equal(scoreFinancial({...doc,truth:{...doc.truth,total:12346}},'legacy',result).fields.financialReconciliation,'FAIL','One cent must fail');
 assert.equal(scoreFinancial({...doc,truth:{...doc.truth,clientName:'Another Property'}},'legacy',result).fields.clientIsolation,'FAIL','Actual eligible IDs must have the independently verified client');
 assert.throws(()=>scoreFinancial({...doc,currentSnapshot:binding('foreign',snapshot,'another-business')},'legacy',result),/Cross-business/);
 assert.throws(()=>scoreFinancial(doc,'legacy',{result:{}}),/Missing immutable/);
 fs.appendFileSync(doc.snapshot.path,' ');assert.throws(()=>loadSnapshot(doc.snapshot),/hash differs/,'Changed financial context invalidates replay');
 console.log('PASS actual financial resolver scoring: exact records, client, cents, already-paid block, tenant attribution, missing evidence and snapshot tampering');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
