/* eslint-disable @typescript-eslint/no-require-imports -- Constrain the reporting-only release. */
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const {sourcePaths} = require("./release/contract.cjs");
const baseline = "d8d86995b133a77839a4dbd0fc600259359b26f8";
const allowed = new Set([
  "next.config.ts",
  "scripts/financial-expense-sql-regression.cjs",
  "scripts/financial-report-regression.ts",
  "scripts/financial-report-scope-regression.cjs",
  "scripts/historical-payment-date-scope-regression.cjs",
  "scripts/release/gate-checks.cjs",
  "src/app/api/reports/financial/route.ts",
  "src/app/lib/financialReportExport.ts",
  "src/app/lib/workspaceLogo.ts",
  "src/app/components/Navigation.tsx",
  "src/app/lib/financialReportPdf.ts",
  "src/app/lib/financialReports.ts",
  "src/app/lib/financialReportsServer.ts",
  "src/app/reports/financial/ExpenseLedger.tsx",
  "src/app/reports/financial/actions.ts",
  "src/app/reports/financial/page.tsx",
  "src/app/reports/page.tsx",
  "supabase/sql/2026-11-10-financial-reports.sql",
]);
const brandingRelease = "ab2e844c22b018a90cbb60c22dcc1acfe502ae27";
const polishPaths = new Set([
  "scripts/financial-report-scope-regression.cjs",
  "src/app/components/Card.tsx",
  "src/app/globals.css",
  "src/app/reports/ReportSection.tsx",
  "src/app/reports/ReportWorkspace.tsx",
  "src/app/reports/page.tsx",
]);
const polishRelease = "39f47f4d1d3382dede76f6777010ce0a37ddc895";
const serviceRequestPaths = new Set([
  "scripts/payment-submit-regression.cjs",
  "scripts/remittance-intake-regression.cjs",
  "src/app/api/payments/apply-batch/route.ts",
  "src/app/api/reports/financial/route.ts",
  "src/app/components/BatchInvoicePayments.tsx",
  "src/app/lib/financialReports.ts",
  "src/app/lib/financialReportsServer.ts",
  "src/app/page.tsx",
  "src/app/reports/financial/actions.ts",
  "src/app/reports/financial/LegacyReceiptSelection.tsx",
  "scripts/atomic-remittance-pg.cjs",
  "scripts/atomic-remittance-regression.cjs",
  "supabase/sql/2026-11-11-financial-receipt-periods.sql",
  "src/app/reports/financial/page.tsx",
  "scripts/financial-report-regression.ts",
  "src/app/lib/financialReportExport.ts",
  "src/app/property-requests/page.tsx",
  "src/app/property-requests/SharedAvailability.tsx",
  "supabase/migrations/20261111_manager_availability.sql",
  "scripts/financial-report-scope-regression.cjs",
  "src/app/components/Navigation.tsx",
  "src/app/lib/rolePermissions.ts",
  "scripts/service-workflow-sql-regression.cjs",
  "src/app/admin/service-requests/components/WorkflowActions.tsx",
  "src/app/lib/publicScheduling/productionOwner.ts",
  "src/app/lib/publicScheduling/workflow.ts",
  "supabase/migrations/20261111_structured_service_request_conversion.sql",
]);
const reportingRelease = "4c9db0ab458a754cc309a635fe7bd4747b28ff52";
for (const [args, permitted] of [
  [["diff", baseline, brandingRelease, "--name-only"], allowed],
  [["diff", brandingRelease, polishRelease, "--name-only"], polishPaths],
  [["diff", polishRelease, reportingRelease, "--name-only"], serviceRequestPaths],
]) {
  const changed = execFileSync("git", [...args, "--", ...sourcePaths], {encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter(file => !permitted.has(file)), []);
}
console.log("PASS financial reports release scope; existing payment, invoice, OCR and scheduling source preserved");

const manifest = require("../release/trimax-release-manifest.json");
if (manifest.releaseId === "trimax-shared-calendar-20261112-rc1") {
  const calendarPaths = new Set([
    "scripts/financial-report-scope-regression.cjs",
    "src/app/admin/service-requests/components/WorkflowActions.tsx",
    "src/app/calendar/CalendarView.tsx",
    "src/app/calendar/model.ts",
    "src/app/calendar/page.tsx",
    "src/app/components/Navigation.tsx",
    "src/app/components/QuickCommandCenter.tsx",
    "src/app/lib/rolePermissions.ts",
  ]);
  for (const args of [["diff", reportingRelease, "--name-only"], ["ls-files", "--others", "--exclude-standard"]]) {
    const files = execFileSync("git", [...args, "--", ...sourcePaths], {encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
    assert.deepEqual(files.filter(file => !calendarPaths.has(file)), []);
  }
  console.log("PASS Calendar release scope; financial and scheduling write paths preserved");
}