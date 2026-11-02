/* eslint-disable @typescript-eslint/no-require-imports -- Freeze all unrelated production executable source. */
const assert=require('node:assert/strict'),cp=require('node:child_process');
const baseline='e5a1e943151c781ea66cd0c9f100d36f80e8e137';
const paths=require('./release/contract.cjs').sourcePaths;
const allowed=new Set(['src/app/api/payments/apply-batch/route.ts','src/app/lib/atomicRemittance.ts','src/app/components/BatchInvoicePayments.tsx','supabase/sql/2026-11-02-atomic-remittance-posting.sql','scripts/atomic-remittance-regression.cjs','scripts/atomic-remittance-pg.cjs','scripts/fixtures/atomic-remittance-schema.sql','scripts/financial-hardening-scope-regression.cjs','scripts/payment-application-regression.ts','scripts/payment-submit-regression.cjs','scripts/payment-timeliness-regression.ts','scripts/duplicate-remittance-regression.ts','scripts/tenant-isolation-hardening-regression.ts','scripts/ocr-progress-persistence-regression.cjs','scripts/ocr-legacy-job-regression.cjs','scripts/release/gate-checks.cjs']);
for(const args of [['diff',baseline,'--name-only','--',...paths],['ls-files','--others','--exclude-standard','--',...paths]]){
 const changed=cp.execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
 assert(changed.every(file=>allowed.has(file)),'Unrelated executable changed: '+changed.filter(file=>!allowed.has(file)).join(', '));
}
console.log('PASS exact financial-hardening scope: OCR recognition, processing, recovery, matching, money helpers, duplicates, QR, scheduling and worker sources remain byte-identical to live e5a1e94');
