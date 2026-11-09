/* eslint-disable @typescript-eslint/no-require-imports -- Explicit email-only candidate scope, preserving every other deployed source path. */
const assert=require('node:assert/strict'),cp=require('node:child_process');
const baseline="37e9fa26d5b969782cc37563393e456d9525fd89",paths=require('./release/contract.cjs').sourcePaths;
const allowed=new Set([
  "package.json",
  "scripts/document-email-review-regression.cjs",
  "scripts/document-email-review-ui-regression.cjs",
  "scripts/document-email-scope-regression.cjs",
  "scripts/invoice-detail-declutter-regression.ts",
  "scripts/job-session-integrity-regression.ts",
  "scripts/late-payment-reminder-send-regression.ts",
  "scripts/pdf-readiness-regression.mjs",
  "scripts/release/authorization-execution-regression.cjs",
  "scripts/release/gate-checks.cjs",
  "scripts/split-invoice-send-regression.ts",
  "scripts/stabilization-regression.cjs",
  "scripts/tenant-isolation-hardening-regression.ts",
  "src/app/api/estimates/[id]/send-email/route.ts",
  "src/app/api/invoices/[id]/send-email/route.ts",
  "src/app/api/invoices/send-overdue-reminders/route.ts",
  "src/app/api/recurring-invoices/run/route.ts",
  "src/app/components/DocumentEmailReview.tsx",
  "src/app/components/EstimateDepositPolicy.tsx",
  "src/app/components/InvoiceBatchSendActions.tsx",
  "src/app/components/InvoiceEmailSendPanel.tsx",
  "src/app/estimates/[id]/edit/page.tsx",
  "src/app/estimates/[id]/print/page.tsx",
  "src/app/estimates/new/page.tsx",
  "src/app/lib/documentEmailBranding.ts",
  "src/app/lib/documentEmailPolicy.ts",
  "src/app/lib/documentEmailReview.ts",
  "src/app/recurring-invoices/page.tsx"
]);
const changed=cp.execFileSync('git',['diff','--name-only',baseline,'HEAD','--',...paths],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert(changed.every(file=>allowed.has(file)),'Unexpected document-email release source change: '+changed.filter(file=>!allowed.has(file)).join(', '));
const protectedChanges=cp.execFileSync('git',['diff','--name-only',baseline,'HEAD','--','src/app/api/payments','src/app/payments','src/app/lib/ocrV2','src/app/lib/remittanceMatching.ts','src/app/lib/money.ts','supabase','sites','proxy.ts'],{encoding:'utf8'}).trim();
assert.equal(protectedChanges,'','Financial posting, OCR, schema, website and auth source remain byte-identical to deployed baseline');
console.log('PASS explicit email-only source scope; deployed payment/OCR/money/schema/website/auth sources unchanged');
