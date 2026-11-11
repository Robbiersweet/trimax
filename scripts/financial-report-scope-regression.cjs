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
for (const args of [["diff", baseline, "--name-only"], ["ls-files", "--others", "--exclude-standard"]]) {
  const changed = execFileSync("git", [...args, "--", ...sourcePaths], {encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter(file => !allowed.has(file)), []);
}
console.log("PASS financial reports release scope; existing payment, invoice, OCR and scheduling source preserved");
