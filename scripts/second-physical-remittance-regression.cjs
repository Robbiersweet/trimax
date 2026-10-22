/* eslint-disable @typescript-eslint/no-require-imports -- Saved physical OCR evidence, not invented image recognition. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=process.env.TRIMAX_MATCHER_BASELINE?require('node:child_process').execFileSync('git',['show',process.env.TRIMAX_MATCHER_BASELINE+':src/app/lib/remittanceMatching.ts'],{encoding:'utf8'}):fs.readFileSync('src/app/lib/remittanceMatching.ts','utf8');
const compile=text=>{const out={};new Function('exports','require',ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,spec=>spec==='./money.ts'?require('../src/app/lib/money.ts'):require(spec));return out;};
const m=compile(source);
// Original legacy7e5ae0eb, source2e627560...: four actual observed row fields.
// Image independently inspected: header/footer4588.33; no check2721/1099 total.
const numbers=['0539','0534','0535','0540'],values=[1099,1099,1291.33,1099];
const rows=numbers.map((number,i)=>({rowId:'ocr-row-'+(i+1),y:739+i*49,height:30,text:`North Creek Apartmen Paint Servi INV${number} full interior paint ${values[i].toFixed(2)}`,source:{region:'full-document',variant:'local-binary',pageMode:'sparse-text',rotation:0},rawInvoiceLikeTokens:['INV'+number],normalizedInvoiceCandidates:['INV-'+number],unitLikeTokens:[],dateTokens:[],amountCandidates:[{raw:values[i].toFixed(2),value:values[i],selected:true}]}));
// Reduced from saved pass candidates: sparse text row amounts at late text
// positions won two-pass agreement; the malformed label was only54.58.
const noise='wood grain noise\n'.repeat(90);
const passes=['local-gray','local-binary'].map(variant=>({region:'full-document',variant,pageMode:'sparse-text',confidence:35,text:noise+(variant==='local-binary'?'TOTAL: 54,58\n33°\n':'')+'Invoice Description Amount\nINV0534\n1,099.00\nINV0535 1,291.33\nINV0540\n1,099.00\n'}));
const header=m.selectRemittanceHeaderEvidence(passes,rows);
assert.equal(header.evidence,null,'Repeated unlabelled row money and a fragmented numeric prefix cannot supply an authoritative document total');
assert.equal(header.checkNumber,'','Unknown check number must stay unknown, never inherit UI2721');
rows[0].text='North Creek Apartmen Paint Servi 09/21/2026 full interior paint 1,09.00';rows[0].rawInvoiceLikeTokens=['INV0O39'];rows[0].normalizedInvoiceCandidates=['INV-0039'];rows[0].unitLikeTokens=['G06'];
const records=numbers.map((n,i)=>({id:'record-'+n,displayId:'INV-'+n,customerName:'North Creek Apartments',projectTitle:'Observed physical row',invoiceAmount:values[i],amountPaid:0,status:'sent'}));
records.push({id:'glen',displayId:'INV-0533',customerName:'Glen North Creek',projectTitle:'Other property',invoiceAmount:1099,amountPaid:0,status:'sent'});
const result=m.findRemittanceMatches(records,'', '',rows,{amount:0,source:'none',payable:false});
assert.deepEqual(result.resolvedMatches.map(i=>i.displayId),numbers.map(n=>'INV-'+n),'Fresh current-row resolution independently reconstructs4588.33');
assert.equal(Math.round(result.matchedTotal*100),458833);
assert.equal(result.matches.length,0,'Unknown header authority still blocks automatic payment');
assert(!result.resolvedMatches.some(i=>i.id==='glen'));
const valid=m.selectRemittanceHeaderEvidence(passes.map(p=>({...p,text:'TOTAL: $4,588.33\nProperty Invoice Description Amount\n'+p.text})),rows);
assert.equal(valid.evidence.amount,4588.33,'A complete observed explicit label remains valid');assert.equal(valid.evidence.payable,true);
const screen=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8'),ast=ts.createSourceFile('screen.tsx',screen,99,true,4);let message;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='ocrFailureMessage')message=n.getText(ast);else ts.forEachChild(n,visit);}visit(ast);
const failureMessage=compile(message+'\nexports.message=ocrFailureMessage;').message;
const warning=failureMessage({lines:[{invoiceNumbers:['INV-0534'],amount:0}]},{resolverResult:result,reconciliationResult:{blockers:['Document total evidence requires review.']}});
assert(warning.startsWith('4 invoices identified.'));assert(!warning.includes('invoice rows could not be confirmed'));
console.log('PASS second physical source regression: row1099 cannot become document total, numeric fragments rejected, four fresh IDs4588.33, no Glen, unknown header blocks, accurate review warning.');
