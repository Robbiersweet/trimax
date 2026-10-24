/* eslint-disable @typescript-eslint/no-require-imports -- Offline payment-field safety and real OCR tests. */
const assert=require('node:assert/strict'),sharp=require('sharp'),fs=require('node:fs'),cp=require('node:child_process');
const {paymentMoney,normalizePaymentDate,decideMoney,paymentRegions,recognizePaymentEvidence}=require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
const ts=require('typescript');
const reviewedOptical={
 'src/app/lib/remittanceAttempt.ts':['selectRepeatedPropertyIdentity','selectObservedCheckDate','selectObservedCheckNumber','selectObservedHeader'],
 'src/app/lib/remittanceMatching.ts':['checkNumberCandidatesFromText','selectBestCheckNumberCandidate','selectRemittanceHeaderEvidence'],
};
function frozenFinancialSource(source,file){
 const tree=ts.createSourceFile(file,source.replaceAll('\r\n','\n'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),excluded=reviewedOptical[file]??[];
 for(const name of excluded)assert.equal(tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).length,1,'Reviewed optical declaration must exist exactly once: '+name);
 return tree.statements.filter(n=>!(ts.isFunctionDeclaration(n)&&excluded.includes(n.name?.text))).map(n=>{
  let text=n.getText(tree);
  if(file.endsWith('remittanceMatching.ts')&&ts.isTypeAliasDeclaration(n)&&n.name.text==='CheckNumberCandidate')text=text.replace(/\s+labelled\?: boolean;/,'');
  // Literal Unicode spelling and its explicit escape are the same regexp.
  if(file.endsWith('remittanceMatching.ts')&&ts.isFunctionDeclaration(n)&&n.name?.text==='isBankingNoiseLine')text=text.replaceAll('\\u2446','⑆').replaceAll('\\u2448','⑈').replaceAll('\\u2449','⑉');
  return text;
 }).join('\n');
}
function verifyFrozenFinancialSource(current,baseline,file){
 assert.equal(frozenFinancialSource(current,file),frozenFinancialSource(baseline,file),file+' financial/evidence/application core must remain frozen');
 // The sole reviewed shape extension is optical candidate provenance.
 if(file.endsWith('remittanceMatching.ts')){
  const declaration=(source)=>ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true).statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='CheckNumberCandidate')?.getText();
  assert.equal(declaration(current),declaration(baseline).replace('score: number;','score: number;\n  labelled?: boolean;'),'Only the reviewed optical labelled flag may extend check candidates');
 }
}
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
 // Explicit user-authorized canonical-money adapters; retain immutable pins
 // and all historical optical assertions. No mutable HEAD baseline.
 for(const file of ['src/app/lib/ocrV2/fusion/index.ts','src/app/lib/ocrV2/resolver/index.ts','src/app/lib/remittanceAttempt.ts','src/app/lib/remittanceMatching.ts']) {
  const revision=file === 'src/app/lib/remittanceMatching.ts' ? '5e8f08ec8fecc99fdd47031c3e240c8f8c7154b2' : file === 'src/app/lib/remittanceAttempt.ts' ? '5e8f08ec8fecc99fdd47031c3e240c8f8c7154b2':file==='src/app/lib/ocrV2/resolver/index.ts'?'5e8f08ec8fecc99fdd47031c3e240c8f8c7154b2':'c11d0a0';
  const current=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),baseline=cp.execFileSync('git',['show',revision+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
  if(!reviewedOptical[file])assert.equal(current,baseline,file+' must remain frozen');
  else {
   verifyFrozenFinancialSource(current,baseline,file);
   const tree=ts.createSourceFile(file,current,ts.ScriptTarget.Latest,true);
   for(const fn of tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.body&&!reviewedOptical[file].includes(n.name?.text))){
    const at=fn.body.getStart(tree)+1,mutated=current.slice(0,at)+"throw Error('adversarial financial mutation');"+current.slice(at);
    assert.throws(()=>verifyFrozenFinancialSource(mutated,baseline,file),undefined,'Changed financial helper must fail pin: '+fn.name?.text);
   }
   for(const extra of ["import 'unreviewed-side-effect';\n","globalThis.unreviewedMutation=true;\n","function newFinancialHelper(){return true;}\n"])
    assert.throws(()=>verifyFrozenFinancialSource(extra+current,baseline,file),undefined,'New import/executable/helper must fail pin');
  }
 }
 console.log('Phase 5B formatting, conflict, geometry, explicit authority, subtotal rejection, row isolation, header fields, leading zeros, bounded passes and frozen business/invoice contracts passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
