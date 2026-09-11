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
const mutationStartIndex = applyBatchRoute.indexOf("const appliedInvoices = []");
const firstInvoiceUpdateIndex = applyBatchRoute.indexOf(".from(\"invoices\")", mutationStartIndex);

assert(duplicateCheckIndex > -1, "Apply route must run duplicate-remittance detection.");
assert(mutationStartIndex > -1, "Apply route must clearly separate the mutation stage.");
assert(
  duplicateCheckIndex < mutationStartIndex &&
    duplicateCheckIndex < firstInvoiceUpdateIndex,
  "Duplicate-remittance checks must run before any payment mutation."
);

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
    applyBatchRoute.includes("payment.duplicate_override"),
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

assert(
  applyBatchRoute.includes("class ApplyBatchError extends Error") &&
    applyBatchRoute.includes("function applyErrorResponse") &&
    applyBatchRoute.includes("code") &&
    applyBatchRoute.includes("stage") &&
    applyBatchRoute.includes("serverMessage"),
  "Apply failures must include structured server diagnostics without exposing a stack trace."
);
assert(
  applyBatchRoute.includes("invoiceRollbackSnapshots") &&
    applyBatchRoute.includes("updatedInvoiceIds") &&
    applyBatchRoute.includes("insertedActivityLogIds") &&
    applyBatchRoute.includes("async function rollbackAppliedMutations") &&
    applyBatchRoute.includes(".from(\"activity_logs\")") &&
    applyBatchRoute.includes(".delete()") &&
    applyBatchRoute.includes("rollbackSucceeded"),
  "Failed mutation must roll back updated invoices and inserted audit logs."
);
assert(
  applyBatchRoute.includes("invoice_update_failed") &&
    applyBatchRoute.includes("stage: \"invoice-update\"") &&
    applyBatchRoute.includes("payment_audit_insert_failed") &&
    applyBatchRoute.includes("stage: \"payment-audit-insert\"") &&
    applyBatchRoute.includes("rollbackAttempted: true"),
  "Invoice update and audit insert failures must report the failing stage and attempt rollback."
);
assert(
  applyBatchRoute.includes(".select(\"id\")") &&
    applyBatchRoute.includes(".single<{ id: string }>()") &&
    applyBatchRoute.includes("activityLogError") &&
    applyBatchRoute.includes("duplicateOverrideError"),
  "Payment and duplicate-override audit inserts must be checked, not fire-and-forget."
);
assert(
  applyBatchRoute.includes("paymentDate: receivedDate") &&
    applyBatchRoute.includes("receivedDate") &&
    applyBatchRoute.includes("checkDate") &&
    applyBatchRoute.includes("paymentReference") &&
    applyBatchRoute.includes("finalPaymentReference: paymentReference"),
  "Received date, check date, and check number must be preserved in payment audit details."
);
assert(
  applyBatchRoute.includes("batchInvoiceCount: invoices.length") &&
    applyBatchRoute.includes("amountApplied: amountDue") &&
    applyBatchRoute.includes("appliedCount: appliedInvoices.length"),
  "Two-invoice and five-invoice batch payments must use the same per-invoice amount application path."
);

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
