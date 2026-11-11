/* eslint-disable @typescript-eslint/no-require-imports -- Freeze all financial machinery and unrelated production source. */
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs');
const baseline='4b428401682f2c00903a43dabd10fb238dc95601';
const allowed=new Set(['src/app/api/payments/extract-check-stub/route.ts','src/app/components/BatchInvoicePayments.tsx','src/app/components/RecentScans.tsx','src/app/components/SavedRemittancePaymentView.tsx','src/app/lib/documentFields/legacyMatureFallback.ts','src/app/lib/savedRemittancePayment.ts','src/app/lib/savedRemittancePaymentServer.ts','scripts/legacy-mature-fallback-regression.cjs','scripts/saved-remittance-reopen-regression.cjs','scripts/financial-hardening-scope-regression.cjs','scripts/ocr-reliability-regression.cjs','scripts/ocr-reliability-scope-regression.cjs','scripts/release/gate-checks.cjs']);
const paths=require('./release/contract.cjs').sourcePaths;
for(const args of [['diff',baseline,'2eb8d1c69bfb4bbd07a2e5004340739c350c2829','--name-only','--',...paths]]){
 const changed=cp.execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
 assert(changed.every(file=>allowed.has(file)),'Unrelated source changed: '+changed.filter(file=>!allowed.has(file)).join(', '));
}
const historicalRelease='2eb8d1c69bfb4bbd07a2e5004340739c350c2829';
const receiptDateFiles=new Set(['src/app/api/payments/apply-batch/route.ts','src/app/lib/atomicRemittance.ts']);
for(const file of ['src/app/api/payments/apply-batch/route.ts','src/app/lib/atomicRemittance.ts','src/app/lib/remittanceMatching.ts','src/app/lib/remittanceAttempt.ts','src/app/lib/duplicateRemittance.ts','src/app/lib/money.ts','supabase/sql/2026-11-02-atomic-remittance-posting.sql','scripts/ocr-legacy-worker.cjs','scripts/ocr-progress-persistence.cjs','scripts/ocr-v2/shadow-worker.cjs'])assert.equal((receiptDateFiles.has(file)?cp.execFileSync('git',['show',historicalRelease+':'+file],{encoding:'utf8',windowsHide:true}):fs.readFileSync(file,'utf8')).replaceAll('\r\n','\n'),cp.execFileSync('git',['show',baseline+':'+file],{encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n'),file+' must remain byte-identical to production');
console.log('PASS retained historical reliability scope; immutable historical atomic posting, matching, money, duplicate safeguards, workers, batching and SQL; no unrelated production changes');
