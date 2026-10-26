const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file,exports);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports};
  const localRequire = name => name.startsWith('.') ? load(path.resolve(path.dirname(file),name.endsWith('.ts') ? name : name+'.ts')) : require(name);
  new Function('require','module','exports',code)(localRequire,module,exports);
  cache.set(file,module.exports); return module.exports;
}
const lifecycle=load('src/app/lib/invoiceLifecycle.ts');
const eligibility=load('src/app/lib/invoiceEligibility.ts');
const discount=load('src/app/lib/documentDiscounts.ts');
const money=load('src/app/lib/money.ts');
for (const purpose of ['deposit','reminder','send']) {
 assert.equal(lifecycle.invoiceDeliveryIssuesFinalBalance(purpose),purpose==='send');
 assert.equal(lifecycle.invoiceDeliveryAction(purpose),{deposit:'invoice.deposit_email_sent',reminder:'invoice.payment_reminder_sent',send:'invoice.email_sent'}[purpose]);
}
const lineItems=[{description:'Synthetic work',quantity:1,unit_price:1000,line_total:1000}];
const draft={id:'synthetic',status:'draft',invoice_amount:1000,amount_paid:0,due_date:'2026-01-01',deposit_requested_amount:500,deposit_status:'requested'};
assert.equal(eligibility.isPaymentEligibleInvoice({invoice:draft,lineItems}),true,'Requested draft deposit can be collected without marking final invoice sent');
assert.equal(eligibility.isOverdueCollectibleInvoice({invoice:draft,lineItems,todayKey:'2026-10-26'}),false);
const paidDeposit={...draft,amount_paid:500,deposit_status:'paid'};
assert.equal(eligibility.isPaymentEligibleInvoice({invoice:paidDeposit,lineItems}),false,'Unissued remainder cannot be collected');
assert.equal(eligibility.isOverdueCollectibleInvoice({invoice:paidDeposit,lineItems,todayKey:'2026-10-26'}),false);
assert.equal(eligibility.isPaymentEligibleInvoice({invoice:{...draft,deposit_status:'none'},lineItems}),false);
for (const status of ['superseded','void','paid']) assert.equal(eligibility.isPaymentEligibleInvoice({invoice:{...draft,status},lineItems}),false);
const issued={...draft,status:'sent',deposit_status:'none'};
assert.equal(eligibility.isOverdueCollectibleInvoice({invoice:issued,lineItems,todayKey:'2026-10-26'}),true,'Preserve genuinely issued overdue invoices');
// 1% rounds to $200.62; $19,861.82 taxable + $1,966.32 tax = $21,828.14.
// Illustrative discounts only. Never written to INV-0404 or chosen for the owner.
for (const [type,value,expectedTotal,expectedDue] of [['fixed',100,21938.72,10914.41],['percentage',1,21828.14,10803.83]]) {
 const totals=discount.calculateDiscountedDocumentTotals({lineSubtotal:20062.44,taxRate:9.9,discount:{enabled:true,type,value}});
 assert.equal(totals.total,expectedTotal); assert.equal(money.subtractMoney(totals.total,11024.31),expectedDue);
}
const route=fs.readFileSync('src/app/api/invoices/[id]/send-email/route.ts','utf8');
assert(route.includes('if (invoiceDeliveryIssuesFinalBalance(emailPurpose))'));
assert(route.includes('invoiceDeliveryAction(emailPurpose)'));
const edit=fs.readFileSync('src/app/invoices/[id]/edit/page.tsx','utf8');
assert(!edit.slice(edit.indexOf('async function handleSave')).includes('amount_paid:'));
const detail=fs.readFileSync('src/app/invoices/[id]/page.tsx','utf8');
assert(detail.indexOf('Edit Invoice & Discounts')<detail.indexOf('title="More Actions"'));
console.log('Invoice deposit delivery, draft collection, issued aging, discount arithmetic and payment-preservation regression passed. Historical sent/deposit reclassification remains an explicit review prerequisite.');
