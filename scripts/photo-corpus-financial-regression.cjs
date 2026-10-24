/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic scorer adversaries; never production evidence. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createRemittanceEvidence}=require('../src/app/lib/remittanceAttempt.ts');
const {scoreFinancial,loadSnapshot}=require('./photo-corpus-financial.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-financial-score-'));
try{
 const invoice={id:'record-one',displayId:'INV-9001',customerName:'Example Apartments',projectTitle:'Routine service',invoiceAmount:123.45,amountPaid:0,status:'sent'};
 const snapshot={invoices:[invoice,{...invoice,id:'other-client',displayId:'INV-9002',customerName:'Another Property'}],activities:[],receivedDate:'2026-01-01',label:'Synthetic scorer adversary',provenance:[]};
 const binding=(name,data,businessId='business-one')=>{const file=path.join(dir,name+'.json'),bytes=Buffer.from(JSON.stringify({source:{attemptId:name,businessId,scope:'Synthetic unit test'},snapshot:data}));fs.writeFileSync(file,bytes);return {path:file,sourceAttemptId:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
 const doc={snapshot:binding('unpaid',snapshot),currentSnapshot:binding('paid',{...snapshot,invoices:snapshot.invoices.map(i=>({...i,amountPaid:123.45,collectionAmountDue:0,status:'paid'}))}),truth:{rows:[{invoiceRecordId:invoice.id,cents:12345}],total:12345,clientName:invoice.customerName}};
 const evidence=createRemittanceEvidence({attemptId:'synthetic',capture:{sources:[]},rawPasses:[],assignments:[],diagnostics:[],headerEvidence:{checkNumber:'9876',checkDate:'2026-01-01',payor:invoice.customerName,documentTotal:{amount:123.45,source:'explicit-document-total',payable:true}},physicalRows:[{text:'INV-9001 123.45',y:30,height:20,normalizedInvoiceCandidates:['INV-9001'],rawInvoiceLikeTokens:['INV-9001'],unitLikeTokens:[],dateTokens:[],amountCandidates:[{raw:'123.45',value:123.45,selected:true}]}]});
 const result={result:{evidence}};
 assert(Object.values(scoreFinancial(doc,'legacy',result).fields).every(f=>f==='PASS'));
 assert.equal(scoreFinancial({...doc,truth:{...doc.truth,rows:[{invoiceRecordId:'other-client'}]}},'legacy',result).fields.matchedInvoiceRecords,'FAIL','Recognized display number alone is insufficient');
 assert.equal(scoreFinancial({...doc,truth:{...doc.truth,total:12346}},'legacy',result).fields.financialReconciliation,'FAIL','One cent must fail');
 assert.equal(scoreFinancial({...doc,truth:{...doc.truth,clientName:'Another Property'}},'legacy',result).fields.clientIsolation,'FAIL','Actual eligible IDs must have the independently verified client');
 const {fuseInvoiceObservations}=require('../src/app/lib/ocrV2/fusion/index.ts');
 const opticalRow={rowId:'row-one',geometry:{top:20,height:20,sourceHash:'a'.repeat(64)},amounts:[{cents:12345,raw:'123.45',observationId:'amount-one',rowId:'row-one'}],units:[],accountCandidates:[],fusion:fuseInvoiceObservations(['svtrv2','parseq','ppocrv5'].map(recognizer=>({id:recognizer,fieldType:'invoice',scope:'row',rowId:'row-one',recognizer,rawText:'INV-9001',sequenceConfidence:null,characterConfidences:null,confidenceCalibrated:false,cropReference:{documentId:'synthetic',rowId:'row-one',sourceImageSha256:'a'.repeat(64),baseCropSha256:'b'.repeat(64),sha256:'b'.repeat(64),path:'synthetic.png',variant:'native'},durationMs:1,visualWarnings:[]})))};
 const v2={document:{id:'synthetic',rows:[opticalRow],rawPasses:[],header:{payor:invoice.customerName,checkNumber:'9876',checkDate:'2026-01-01',total:{amount:123.45,source:'explicit-document-total',payable:true},provenance:'Synthetic unit test'}},resolver:{status:'automatic',automaticInvoiceIds:[invoice.id]}};
 assert(Object.values(scoreFinancial(doc,'v2-shadow',v2).fields).every(f=>f==='PASS'));
 for(const resolver of [{status:'automatic',automaticInvoiceIds:['wrong-record']},{status:'review-required',automaticInvoiceIds:[invoice.id]}])assert.equal(scoreFinancial(doc,'v2-shadow',{...v2,resolver}).fields.matchedInvoiceRecords,'FAIL','Pipeline output must agree with actual resolver record IDs');
 assert.equal(scoreFinancial(doc,'v2-shadow',{...v2,resolver:{status:'review-required',automaticInvoiceIds:[]}}).fields.financialReconciliation,'PASS_CORRECT_RECORDS_REVIEW_REQUIRED');
 assert.equal(scoreFinancial({...doc,truth:{...doc.truth,rows:[{invoiceRecordId:invoice.id,cents:12346}]}},'legacy',result).fields.selectedRowAmounts,'FAIL','Per-record cents cannot hide behind exact total');
 assert.throws(()=>scoreFinancial({...doc,currentSnapshot:binding('foreign',snapshot,'another-business')},'legacy',result),/Cross-business/);
 assert.throws(()=>scoreFinancial(doc,'legacy',{result:{}}),/Missing immutable/);
 fs.appendFileSync(doc.snapshot.path,' ');assert.throws(()=>loadSnapshot(doc.snapshot),/hash differs/,'Changed financial context invalidates replay');
 console.log('PASS actual financial resolver scoring: exact records, client, cents, already-paid block, tenant attribution, missing evidence and snapshot tampering');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
