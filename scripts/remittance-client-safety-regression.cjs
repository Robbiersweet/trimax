/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = process.env.TRIMAX_MATCHER_BASELINE
  ? require('node:child_process').execFileSync('git', ['show', process.env.TRIMAX_MATCHER_BASELINE + ':src/app/lib/remittanceMatching.ts'], { encoding: 'utf8' })
  : fs.readFileSync('src/app/lib/remittanceMatching.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const matching = {};
new Function('exports', 'require', compiled)(matching, spec=>spec==='./money.ts'?require('../src/app/lib/money.ts'):require(spec));
const invoice = (id, displayId, customerName, extra = {}) => ({ id, displayId, customerName, projectTitle: 'Unit A01', invoiceAmount: 1099, amountPaid: 0, status: 'sent', ...extra });
const north = invoice('north', 'INV-0539', 'North Creek Apartments');
const glen = invoice('glen', 'INV-0533', 'Glen North Creek');
const longGlen = invoice('long-glen', 'INV-0536', 'The Glen at North Creek');
const pool = [north, glen, longGlen];
const run = (records, token, payor = 'North Creek Apartments', amount = 1099) => matching.findRemittanceMatches(records,
  `PAYOR: ${payor}\n${token} A01 Paint service $${amount.toFixed(2)}\nTOTAL: $${amount.toFixed(2)}`, payor);
assert.deepEqual(run(pool, 'INV-0539').matches.map(i => i.id), ['north']);
for (const foreign of [glen, longGlen]) {
  const result = run(pool, foreign.displayId);
  assert.equal(result.matches.length, 0);
  assert.equal(result.resolvedMatches.length, 0, 'Known incompatible payor must exclude even exact invoice IDs before provisional selection');
  assert.equal(result.matchTrace.find(t => t.invoiceId === foreign.id)?.eligible, false);
}
for (const amount of [1099, 1098.99, 1099.01]) {
  const result = run(pool, '', 'North Creek Apartments', amount);
  assert.equal(result.resolvedMatches.length, 0, 'Amount and unit cannot introduce any invoice');
  assert.equal(result.matches.length, 0);
}
for (const payor of ['North Creek', 'Creek']) {
  const result = run(pool, glen.displayId, payor);
  assert.equal(result.resolvedMatches.length, 0, 'A shared payor fragment cannot identify a client');
}
assert.deepEqual(run(pool, north.displayId, 'North Creek').matches.map(i => i.id), ['north'], 'Observed leading stem identifies North Creek without admitting Glen');
assert.deepEqual(run(pool, north.displayId, 'North Creek Apartmen').matches.map(i => i.id), ['north'], 'Observed truncated descriptor remains compatible');
const sharedPrefix = run([...pool, invoice('estates', 'INV-0541', 'North Creek Estates')], north.displayId, 'North Creek');
assert.equal(sharedPrefix.resolvedMatches.length, 0);
assert(sharedPrefix.issues.some(s => s.includes('more than one customer')));
for (const extra of [{ status: 'paid' }, { status: 'draft' }, { status: 'void' }, { status: 'sent', splitChildrenCount: 2 }, { amountPaid: 1099 }]) {
  assert.equal(run([{ ...north, ...extra }, glen], north.displayId).resolvedMatches.length, 0);
}
const child = { ...north, splitParentInvoiceId: 'parent', splitChildrenCount: 0 };
assert.deepEqual(run([child, glen], north.displayId).matches.map(i => i.id), ['north']);
assert.equal(run(pool, north.displayId, 'North Creek Apartments', 1099.01).matches.length, 0, 'Exact cents still required');
const duplicate = { ...glen, displayId: north.displayId };
assert.equal(run([north, duplicate], north.displayId).matches.length, 0, 'Client filtering cannot hide duplicate invoice numbers');
const unknown = run(pool, glen.displayId, '');
assert.equal(unknown.matches.length, 0, 'Unknown payor cannot authorize payment even with a known invoice and exact total');
console.log('Remittance client safety PASS: invoice identifiers, pre-resolution payor exclusion, ambiguous identity, amount-only veto, collectible splits, duplicate IDs, exact cents, unknown identity.');
