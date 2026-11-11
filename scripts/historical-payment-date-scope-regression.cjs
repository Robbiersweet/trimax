/* eslint-disable @typescript-eslint/no-require-imports -- Restrict the receipt-date release to payment code and its regressions. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {sourcePaths} = require('./release/contract.cjs');
const baseline = 'f14e51bae7c7f3a66a69a184fd0e101a07ecac78';
const allowed = new Set([
  'src/app/activity/page.tsx',
  'src/app/api/payments/apply-batch/route.ts',
  'src/app/components/BatchInvoicePayments.tsx',
  'src/app/components/SavedRemittancePaymentView.tsx',
  'src/app/lib/atomicRemittance.ts',
  'src/app/lib/paymentTimeliness.ts',
  'src/app/payments/page.tsx',
  'supabase/sql/2026-11-10-unknown-historical-receipt-date.sql',
  'scripts/atomic-remittance-pg.cjs',
  'scripts/atomic-remittance-regression.cjs',
  'scripts/payment-submit-regression.cjs',
  'scripts/remittance-intake-regression.cjs',
  'scripts/payment-timeliness-regression.ts',
  'scripts/release/gate-checks.cjs',
  'scripts/historical-payment-date-scope-regression.cjs',
]);
for (const args of [['diff', baseline, '--name-only'], ['ls-files', '--others', '--exclude-standard']]) {
  const changed = execFileSync('git', [...args, '--', ...sourcePaths], {encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter(file => !allowed.has(file)), []);
}
console.log('PASS historical receipt-date release scope');
