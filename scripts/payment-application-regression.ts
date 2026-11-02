import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const applyBatchRoute = readFileSync(
  resolve(root, "src/app/api/payments/apply-batch/route.ts"),
  "utf8"
);
const paymentScreen = readFileSync(
  resolve(root, "src/app/components/BatchInvoicePayments.tsx"),
  "utf8"
);
const nextConfig = readFileSync(resolve(root, "next.config.ts"), "utf8");

const duplicateCheckIndex = applyBatchRoute.indexOf(
  "const duplicateCheck = findDuplicateRemittance"
);
const migration=readFileSync(resolve(root,'supabase/sql/2026-11-02-atomic-remittance-posting.sql'),'utf8');
const helper=readFileSync(resolve(root,'src/app/lib/atomicRemittance.ts'),'utf8');
const mutationStartIndex=applyBatchRoute.indexOf("supabase.rpc('trimax_commit_remittance'");
assert(duplicateCheckIndex>-1 && mutationStartIndex>duplicateCheckIndex,'Duplicate validation precedes the one native transaction.');
assert(!/\.(?:update|insert|delete)\(/.test(applyBatchRoute),'Posting may not use separate HTTP mutations or compensation.');
assert(migration.includes('pg_advisory_xact_lock')&&migration.includes('for update')&&migration.includes('remittance_posting_receipts'),'Native transaction locks invoices and saves the retry receipt.');

assert(
  applyBatchRoute.includes("status === \"active\"") &&
    applyBatchRoute.includes("This check stub has already been applied.") &&
    applyBatchRoute.includes("{ status: 409 }"),
  "Active duplicate payments must remain blocked before payment application."
);
assert(
  applyBatchRoute.includes("status === \"possible\"") &&
    applyBatchRoute.includes("duplicateOverrideConfirmed") &&
    applyBatchRoute.includes("Only an owner or admin can continue") &&
    migration.includes("payment.duplicate_override"),
  "Possible duplicate override must remain owner/admin gated and audited."
);
assert(
  applyBatchRoute.includes("requireWorkspaceAccess") &&
    applyBatchRoute.includes("supabase.auth.getUser(token)") &&
    applyBatchRoute.includes("business_users") &&
    applyBatchRoute.includes("Unauthorized.") &&
    applyBatchRoute.includes("code: \"unauthorized\"") &&
    applyBatchRoute.includes("stage: \"authorization\"") &&
    applyBatchRoute.includes("status: 401"),
  "Missing or expired auth must return a 401 before mutations."
);

assert(
  applyBatchRoute.includes("isPaymentEligibleInvoice") &&
    applyBatchRoute.includes("split_children_count") &&
    applyBatchRoute.includes("is not collectible and cannot receive a payment"),
  "Collectibility and split-source eligibility checks must remain in front of mutation."
);
assert(
  applyBatchRoute.includes("(invoiceData ?? []).length !== invoiceIds.length") &&
    applyBatchRoute.includes("invoiceCollectionAmountDue") &&
    applyBatchRoute.includes("The payment amount does not match") &&
    applyBatchRoute.includes("The remittance total does not match"),
  "Exact invoice-ID set, selected total, and remittance total validation must remain enforced."
);

assert(applyBatchRoute.includes('function applyErrorResponse')&&applyBatchRoute.includes('payment_confirmation_unknown'),'Interrupted confirmations are actionable without a false rollback claim.');
assert(migration.includes("'invoice.batch_payment_applied'")&&migration.includes('insert into public.remittance_posting_receipts')&&!migration.includes('exception when'),'Audit errors abort the entire transaction and its receipt.');
assert(applyBatchRoute.includes('paymentDate:receivedDate')&&applyBatchRoute.includes('checkDate')&&helper.includes('finalPaymentReference'),'Existing payment dates, references and timeliness are retained.');
assert(migration.includes("'batchInvoiceCount',cardinality(ids)")&&migration.includes("'amountApplied',allocation::numeric/100"),'Every intended allocation shares the same transaction.');
assert(
  paymentScreen.includes("type ApplyBatchPaymentResponse") &&
    paymentScreen.includes("Apply-batch failure:") &&
    paymentScreen.includes("status=${response.status}") &&
    paymentScreen.includes("code=${result.code}") &&
    paymentScreen.includes("stage=${result.stage}") &&
    paymentScreen.includes("partialMutationOccurred") &&
    paymentScreen.includes("rollbackSucceeded"),
  "Payment UI diagnostics must retain apply-batch status, code, failing stage, and rollback outcome."
);
assert(
  paymentScreen.includes("paymentDate: receivedDate") &&
    paymentScreen.includes("receivedDate,") &&
    paymentScreen.includes("checkDate,") &&
    paymentScreen.includes("paymentReference: submittedPaymentReference") &&
    paymentScreen.includes("payor: submittedPayor"),
  "Apply payload must submit received date, check date, check number, and payor unchanged."
);
assert(
  nextConfig.includes("\"/api/payments/apply-batch\"") &&
    nextConfig.includes("\"/api/payments/duplicate-remittance-preflight\"") &&
    nextConfig.includes("./node_modules/sharp/**/*") &&
    nextConfig.includes("./node_modules/@img/sharp-linux-x64/**/*") &&
    nextConfig.includes("./node_modules/@img/sharp-libvips-linux-x64/**/*"),
  "Payment routes that import remittance fingerprinting must trace Sharp native binaries for Vercel."
);

console.log("Payment application regression checks passed.");
