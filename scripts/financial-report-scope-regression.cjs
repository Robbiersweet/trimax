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
for (const [args, permitted] of [
  [["diff", baseline, brandingRelease, "--name-only"], allowed],
  [["diff", brandingRelease, polishRelease, "--name-only"], polishPaths],
  [["diff", polishRelease, "--name-only"], serviceRequestPaths],
  [["ls-files", "--others", "--exclude-standard"], serviceRequestPaths],
]) {
  const changed = execFileSync("git", [...args, "--", ...sourcePaths], {encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter(file => !permitted.has(file)), []);
}
console.log("PASS financial reports release scope; existing payment, invoice, OCR and scheduling source preserved");
