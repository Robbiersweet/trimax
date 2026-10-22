/* eslint-disable @typescript-eslint/no-require-imports -- Execute actual pure decimal/cents and split calculation functions. */
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const money = require('../src/app/lib/money.ts');
const {calculateDiscountedDocumentTotals: totals} = require('../src/app/lib/documentDiscounts.ts');
const {moneyCents:cents, multiplyMoney:line, sumMoney:sum, percentMoney:tax, subtractMoney:subtract, formatMoney:format} = money;
for (const [value, expected] of [['324.205',32421],['1.005',101],['2.675',268],['-1.005',-101],['0.005',1],['-0.005',-1],['1e-2',1],['1e-7',0],['$1,234.565',123457]]) assert.equal(cents(value),expected);
for(let whole=0;whole<10000;whole++){assert.equal(cents(`${whole}.005`),whole*100+1);assert.equal(cents(`-${whole}.005`),-(whole*100+1));}
assert.equal(sum([0.1,0.2]),0.3); assert.equal(subtract(0.3,0.1),0.2);
assert.equal(line('0.1','0.05'),0.01);assert.equal(line('1.005','2'),2.01);
assert.equal(sum([line(1,'.005'),line(1,'.005')]),0.02,'Round each extended line, then sum integer cents.');
assert.equal(tax(295,'9.9'),29.21); assert.equal(tax(1025,'9.9'),101.48);
assert.equal(tax(10.05,10),1.01);
assert.equal(tax(48655,money.taxRateForAmounts(48655,757.5)),757.5,'Imported tax must survive rate reconstruction without the old four-decimal penny drift.');
assert.equal(tax(3866.98,money.taxRateForAmounts(3866.98,382.84)),382.84);
assert.throws(()=>money.taxRateForAmounts(0,1));
assert.equal(money.roundDecimalSum(['0.005','0.005']),0.01,'Document tax observations round once, not once per input.');
assert.equal(sum(['0.005','0.005']),0.02,'Booked line extensions round individually.');
const discounted = totals({lineSubtotal:100.05,taxRate:9.9,discount:{enabled:true,type:'percentage',value:10}});
assert.deepEqual(discounted,{lineSubtotal:100.05,discountAmount:10.01,taxableSubtotal:90.04,taxAmount:8.91,total:98.95});
assert.equal(totals({lineSubtotal:1,taxRate:10,discount:{enabled:true,type:'fixed',value:'0.005'}}).discountAmount,0.01);
assert.equal(sum([324.21,712.84,1099,1099,1099]),4334.05);
assert.equal(cents(sum([324.21,712.84,1099,1099,1099]))-cents(4334.05),0);
assert.notEqual(cents(4334.04),cents(4334.05),'One-cent mismatch must never be tolerated.');
assert.equal(format(324.205),'$324.21'); assert.equal(format(-1.005),'-$1.01');
for(const value of [NaN,Infinity,'invalid','1e101','90071992547409.92'])assert.throws(()=>cents(value));
// Compile the real split planner without its database/UI dependencies.
const source=fs.readFileSync('src/app/lib/splitInvoices.ts','utf8');
const pure=source.slice(source.indexOf('function centsToDollars'),source.indexOf('export async function createSplitInvoices'));
const code=ts.transpileModule(pure.replace('export function','function')+'\nreturn buildSplitInvoicePlan;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const split=new Function(...Object.keys(money),code)(...Object.values(money));
for(const subtotal of [1025,2050.01,2950.05,4999.99]){
 const plan=split({subtotalAmount:subtotal,targetAmount:1000,taxRate:9.9});
 assert.equal(sum(plan.map(p=>p.subtotalAmount)),subtotal);
 for(const child of plan){assert.equal(child.taxAmount,tax(child.subtotalAmount,9.9));assert.equal(child.totalAmount,sum([child.subtotalAmount,child.taxAmount]));assert(child.totalAmount<=1000);}
}
// Execute the real CSV financial mapping. Only document-ID reservation is an
// in-memory adapter; all money functions are the production implementation.
const importSource=fs.readFileSync('src/app/imports/page.tsx','utf8');
const ast=ts.createSourceFile('imports.tsx',importSource,99,true,4);
const names=new Set(['normalizeHeader','field','moneyValue','roundMoney','dateValue','normalizeFreshBooksClientName','statusLabel','mapInvoiceLineItem','mapInvoiceRows','getFreshBooksInvoiceDisplayId']);
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const bindings={canonicalRoundMoney:money.roundMoney,sumMoney:sum,roundDecimalSum:money.roundDecimalSum,moneyCents:cents,taxRateForAmounts:money.taxRateForAmounts,normalizeDocumentDisplayId:v=>'INV-'+v};
const mapRows=new Function(...Object.keys(bindings),ts.transpileModule(functions+'\nreturn mapInvoiceRows;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)(...Object.values(bindings));
const importedLine=(subtotal,tax,sourceTotal)=>({client:'Fixture',invoice:'1',quantity:'1',rate:subtotal,linesubtotal:subtotal,tax1amount:tax,tax2amount:'0',linetotal:sourceTotal});
const imported=mapRows([importedLine('.10','.005','.105'),importedLine('.10','.005','.105')])[0];
assert.equal(imported.subtotal,.20);assert.equal(imported.taxAmount,.01);assert.equal(imported.amount,.21);assert.equal(imported.moneyReviewReason,undefined);
const incompatible=mapRows([importedLine('.005','0','.005'),importedLine('.005','0','.005')])[0];
assert(incompatible.moneyReviewReason,'Competing external totals must require review before any invoice/client write.');
const importer=importSource.slice(importSource.indexOf('async function importInvoices'));
assert(importer.indexOf('if(row.moneyReviewReason)')<importer.indexOf('await findOrCreateClient'));
console.log('PASS canonical decimal half-away cents: 20,000 half-cent cases, negative/float/precision limits, line/subtotal/tax/discount, split invoice cents, exact payment/remittance reconciliation.');
