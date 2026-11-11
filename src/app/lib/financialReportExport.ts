import type { financialReport } from "./financialReports.ts";

export type FinancialReport = ReturnType<typeof financialReport>;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const displayCents = (cents: number) => usd.format(cents / 100);
export const statementLines = (report: FinancialReport): [string, number][] => [
  ["Revenue, excluding sales tax", report.revenue],
  ...report.byCategory.filter(row => row.direct && row.cents !== 0).map(row => [row.category, row.cents] as [string, number]),
  ["Total direct job costs", report.jobCosts],
  ["Gross profit", report.grossProfit],
  ...report.byCategory.filter(row => !row.direct && row.cents !== 0).map(row => [row.category, row.cents] as [string, number]),
  ["Total operating expenses", report.operating],
  ["Total expenses", report.totalExpenses],
  ["Net profit from included records", report.netProfit],
];
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function statementHtml(name: string, report: FinancialReport) {
  const undated = report.exceptions.filter(row => row.reason === "Confirmed receipt with unknown date").reduce((sum, row) => sum + row.gross, 0);
  const exceptional = report.exceptions.reduce((sum, row) => sum + row.gross, 0) - undated;
  const summary = report.draft ? "DRAFT · INCOMPLETE RECORDS" : "STATEMENT";
  const notes = report.draft
    ? "<p>Results reflect supported transactions only. A zero expense balance may reflect missing records. Confirm expense coverage and reconcile excluded receipts before relying on this statement as complete.</p>" : "";
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Profit &amp; Loss</title><style>@page{size:Letter;margin:0.65in}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#182334;margin:0}header{border-bottom:3px solid #aa4618;padding:0 0 18px;margin-bottom:24px}h1{font-size:30px;margin:6px 0}h2{font-size:16px}p{line-height:1.45}.status{color:#963c15;font-weight:bold;font-size:12px}table{border-collapse:collapse;width:100%}th,td{padding:9px;border-bottom:1px solid #d8dfe5;text-align:left}td:last-child,th:last-child{text-align:right}tr:last-child{font-weight:bold;background:#e9eef2}footer{margin-top:26px;border-top:1px solid #b8c2cc;padding-top:10px;color:#435163}tr{break-inside:avoid}</style><header><div class="status">'
    + summary + "</div><h1>Profit &amp; Loss</h1><h2>" + escape(name) + "</h2><div>"
    + report.range.from + " through " + report.range.through + " · Cash basis · USD</div></header>"
    + "<table><thead><tr><th>Account</th><th>Amount</th></tr></thead><tbody>"
    + statementLines(report).map(([label, cents]) => "<tr><td>" + escape(label) + "</td><td>" + displayCents(cents) + "</td></tr>").join("")
    + "</tbody></table><h2>Reporting notes</h2>" + notes
    + "<p>Sales tax excluded from supported receipts: " + displayCents(report.receipts.reduce((sum, row) => sum + row.tax, 0)) + ".</p>"
    + (undated ? "<p>Confirmed receipts with unknown dates, excluded from the period: " + displayCents(undated) + ".</p>" : "")
    + (exceptional ? "<p>Other excluded receipt or paid-balance evidence requiring reconciliation: " + displayCents(exceptional)
      + ". This amount includes undated records that cannot be assigned to the reporting period. See the transaction export for references.</p>" : "")
    + (report.reviewCount ? "<p>" + report.reviewCount + " transactions in this period require classification.</p>" : "")
    + "<footer>Prepared from business records. This statement has not been independently audited or CPA-certified.</footer></html>";
}
export function financialCsv(report: FinancialReport) {
  const rows: (string | number)[][] = [["Type", "Date", "Reference", "Description", "Category or exception", "Amount USD", "Sales tax USD", "Record ID"]];
  for (const [label, cents] of statementLines(report)) rows.push(["P&L", "", "", label, report.draft ? "Draft" : "Cash basis", (cents / 100).toFixed(2), "", ""]);
  for (const row of report.receipts) rows.push(["Receipt", row.date, row.reference, row.invoice ?? "", "", (row.net / 100).toFixed(2), (row.tax / 100).toFixed(2), row.id]);
  for (const row of report.expenses) rows.push([row.classification, row.business_date, row.vendor, row.description, row.category ?? "", row.amount_cents * (row.classification === "business refund" ? -1 : 1) / 100, "", row.id]);
  for (const row of report.exceptions) rows.push(["Excluded receipt", row.date ?? "", row.reference, row.invoice ?? "", row.reason, (row.gross / 100).toFixed(2), "", row.id]);
  for (const row of report.receivable) rows.push(["Current ledger receivable", row.due_date ?? "", row.display_id ?? "", row.customer_name ?? "", row.overdue ? "Overdue" : "Current", (row.cents / 100).toFixed(2), "", row.id]);
  return rows.map(row => row.map(value => {
    const text = String(value);
    const safe = typeof value === "string" && /^[\s]*[=+@\-\t\r\n]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  }).join(",")).join("\r\n");
}
