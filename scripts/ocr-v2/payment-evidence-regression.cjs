/* eslint-disable @typescript-eslint/no-require-imports -- Offline payment-field safety and real OCR tests. */
const assert=require('node:assert/strict'),sharp=require('sharp'),fs=require('node:fs'),cp=require('node:child_process');
const {paymentMoney,normalizePaymentDate,decideMoney,paymentRegions,recognizePaymentEvidence}=require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
const observation=(id,raw,confidence=90)=>({id,variant:id,raw,money:paymentMoney(raw),confidence});
(async()=>{
 assert.deepEqual(paymentMoney('1,099.00 952.95 $4,505.90'),[109900,95295,450590]);
 assert.deepEqual(paymentMoney('1.099.00'),[109900]);
 for(const text of ['1.09%.00','1.099.800','1O99.00','109900','-100.00','$.495.00'])assert.deepEqual(paymentMoney(text),[],text);
 assert.equal(normalizePaymentDate('08/19/2026'),'2026-08-19');assert.equal(normalizePaymentDate('02/30/2026'),null);assert.equal(normalizePaymentDate('19/08/2026'),null);
 assert.equal(decideMoney([observation('native','100.00'),observation('contrast','200.00')]).cents,null);
 assert.equal(decideMoney([observation('native','100.00',0)]).cents,null);
 assert.equal(decideMoney([observation('native','100.00'),observation('contrast','100.00')]).cents,10000);
 const layout={sourceWidth:800,sourceHeight:400,coordinateSpace:'normalized-document-color',headerRegion:{left:0,top:100,width:800,height:30},totalCandidateRegion:{left:600,top:250,width:150,height:40},rows:[{id:'row-0001',bounds:{left:10,top:140,width:760,height:40},amountRegion:{left:600,top:140,width:150,height:40}}],diagnostics:{font:12}};
 assert.throws(()=>paymentRegions({...layout,totalCandidateRegion:{left:600,top:150,width:150,height:40}}),/overlaps/);
 for(const label of ['TOTAL','SUBTOTAL','']){
  const svg=Buffer.from(`<svg width="800" height="400"><rect width="800" height="400" fill="white"/><g fill="black" font-family="Arial" font-size="24"><text x="20" y="30">DATE:09/01/2026 CK#:001234</text><text x="20" y="65">${label?'PAYOR':'PAYEE'}: Example Apartments</text>${label?'':'<text x="20" y="90">TOTAL: $9,999.00</text>'}<text x="20" y="122">Invoice Description Amount</text><text x="20" y="170">INV-9876</text><text x="606" y="170">100.00</text><text x="430" y="280">${label}</text><text x="606" y="280">100.00</text></g></svg>`);
  const image=await sharp(svg).png().toBuffer(),result=await recognizePaymentEvidence(image,layout,'synthetic');
  assert.equal(result.rows[0].cents,10000);assert.equal(result.totalEvidence.cents,10000);
  assert.equal(result.authoritativeTotal,label==='TOTAL'?10000:null,label);
  assert.equal(result.checkNumber,'001234');assert.equal(result.checkDate,'2026-09-01');assert.equal(result.payor,label?'Example Apartments':null);
  assert(result.totalEvidence.observations.every(o=>o.scope==='document'&&o.bounds.top>=180));
  assert(result.rows[0].observations.every(o=>o.scope==='row'&&o.rowId==='synthetic-0'));
  assert(result.timings.passCount<=13);console.log('PASS optical',label||'unlabeled footer');
 }
 for(const file of ['src/app/lib/ocrV2/fusion/index.ts','src/app/lib/ocrV2/resolver/index.ts','src/app/lib/remittanceAttempt.ts','src/app/lib/remittanceMatching.ts'])assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),cp.execFileSync('git',['show','c11d0a0:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'),file+' must remain frozen');
 console.log('Phase 5B formatting, conflict, geometry, explicit authority, subtotal rejection, row isolation, header fields, leading zeros, bounded passes and frozen business/invoice contracts passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
