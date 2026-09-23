/* eslint-disable @typescript-eslint/no-require-imports -- Private retained-image scoring only. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const before=JSON.parse(fs.readFileSync(process.argv[2])),after=JSON.parse(fs.readFileSync(process.argv[3]));
assert.equal(after.sourceImageHash,before.sourceImageHash);assert.equal(after.physicalRows.length,5);
const money=x=>x.matureMoney.filter(f=>f.field==='row_amount').map(f=>({row:f.rowId,cents:f.cents,raw:f.observations.map(o=>({model:o.recognizer,raw:o.raw,cropHash:o.cropHash}))}));
assert.deepEqual(money(after),money(before));
assert.deepEqual(after.document.rows.map(r=>r.fusion.candidates.map(c=>c.value)),before.document.rows.map(r=>r.fusion.candidates.map(c=>c.value)));
assert.equal(after.document.header.payor,before.document.header.payor);
assert.equal(after.monetary.authority.cents,549500);assert.equal(after.sharedMoney.monetary.authority.cents,549500);
assert.equal(after.paymentCanApply,false);
assert(after.monetary.observations.filter(o=>o.field==='total').every(o=>o.money.length===1&&o.money[0]===549500));
console.log('PASS exact source, five rows, unchanged row-money/invoice/identity evidence, visually authoritative total, no payment capability');
