/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');const {scoreDocument,compareDatabase,digest}=require('./contract.cjs');
const expected={canonicalSha256:'image',expectedPhysicalRows:1,expectation:'AUTOMATICALLY_RESOLVE',truth:{rows:[{invoiceNumber:'INV-0123',invoiceRecordId:'id',amountCents:12000}],authoritativeTotalCents:12000}};
const observation={sourceImageHash:'image',paymentCanApply:false,document:{rows:[{fusion:{confidence:{confidentlySelected:true},topCandidate:'INV-0123'},amounts:[{cents:12000}]}],header:{total:{amount:120}}},resolver:{status:'automatic',automaticInvoiceIds:['id']},arithmeticReconciliation:{difference:0},reviewBlockers:[]};
assert.deepEqual(scoreDocument(expected,observation),[]);
for(const mutate of [o=>o.document.rows[0].amounts[0].cents=13000,o=>o.resolver.automaticInvoiceIds=['other'],o=>o.document.header.total.amount=121,o=>o.paymentCanApply=true,o=>o.sourceImageHash='other',o=>o.resolver.status='review-required',o=>o.document.rows[0].fusion.topCandidate='INV-0999']){const o=structuredClone(observation);mutate(o);assert(scoreDocument(expected,o).length);}
assert(scoreDocument({...expected,expectation:'SAFELY_REQUIRE_REVIEW'},observation).length);
const fingerprints=Object.fromEntries(['schema','rpc','triggers','policies','grants'].map(k=>[k,{sha256:k}]));const db={fingerprints,flags:[{enabled:true}]};const actual={...db,engine:'legacy',businessId:'b',credentialScope:'ocr-only'};
assert.deepEqual(compareDatabase(db,actual,'legacy','b'),[]);assert(compareDatabase(db,{...actual,credentialScope:'payment'},'legacy','b').length);assert(compareDatabase(db,{...actual,flags:[]},'legacy','b').length);
assert.equal(digest({a:1,b:2}),digest({b:2,a:1}));console.log('Release contract safety regressions PASS');
const {validate}=require('./physical-acceptance.cjs');assert.throws(()=>validate({releaseId:'r',components:{web:{commit:'c'}},modelBundle:{sha256:'m'},database:{fingerprints:{schema:{sha256:'d'}}}},{kind:'retained-replay'}),'Replay must never grant physical acceptance');
