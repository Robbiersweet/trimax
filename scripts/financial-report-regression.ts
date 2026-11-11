import assert from "node:assert/strict";
import { financialReport, parseBankCsv, validDay, type ReportAudit, type ReportInvoice, type Expense } from "../src/app/lib/financialReports.ts";
import { financialCsv, statementHtml } from "../src/app/lib/financialReportExport.ts";
const range = { from: "2026-01-01", through: "2026-11-10" };
const base: ReportInvoice = { id: "1", display_id: "INV-1", customer_name: "Customer", invoice_amount: "110.00", amount_paid: 110, status: "Paid", due_date: "2026-05-01", tax_mode: "taxable", tax_rate: 10, split_parent_invoice_id: null };
const payment = (id: string, entity_id: string, details: Record<string, unknown>): ReportAudit => ({ id, entity_id, details });
const expenses: Expense[] = [
  { id:"e1", business_date:"2026-02-01", vendor:"Vendor", description:"=SUM(A1)", classification:"expense", category:"materials", amount_cents:1501, voided:false },
  { id:"e2", business_date:"2026-02-02", vendor:"Vendor", description:"Refund", classification:"business refund", category:"materials", amount_cents:101, voided:false },
  { id:"e3", business_date:"2026-02-02", vendor:"Vendor", description:"Draw", classification:"owner draw", category:null, amount_cents:1000, voided:false },
  { id:"e4", business_date:"2026-02-02", vendor:"Vendor", description:"Software", classification:"expense", category:"software", amount_cents:999, voided:false },
  { id:"e5", business_date:"2026-02-02", vendor:"Vendor", description:"Void", classification:"expense", category:"tools", amount_cents:1000, voided:true },
];
const report = financialReport(range, [
  base,
  { ...base, id:"2", tax_mode:"no_tax", amount_paid:110 },
  { ...base, id:"3", status:"Sent", amount_paid:0 },
  { ...base, id:"4", status:"Sent", amount_paid:0, split_parent_invoice_id:"3" },
  { ...base, id:"5", status:"Superseded", amount_paid:0 },
], [{invoice_id:"1",line_total:100}], [
  payment("a","1",{receivedDate:"2026-01-31",amountApplied:110,atomicRequestKey:"key"}),
  payment("duplicate","1",{receivedDate:"2026-01-31",amountApplied:110,atomicRequestKey:"key"}),
  payment("b","2",{receivedDate:"2026-09-01",paymentDate:"2026-09-01",historicalReceiptDateUnknown:true,amountApplied:110}),
  payment("reversed","1",{receivedDate:"2026-01-31",amountApplied:110,paymentOutcome:"reversed"}),
], expenses, range.through, true);
assert.equal(report.revenue,10000);
assert.equal(report.jobCosts,1400);
assert.equal(report.operating,999);
assert.equal(report.grossProfit,8600);
assert.equal(report.netProfit,7601);
assert.deepEqual(report.monthly,[["2026-01",10000]]);
assert.equal(report.receipts[0].tax,1000);
assert.equal(report.exceptions[0].date,null);
assert.equal(report.exceptions[0].gross,11000);
assert.equal(report.draft,true);
assert.deepEqual(report.receivable.map(row=>[row.id,row.overdue]),[["4",true]]);
assert(financialCsv(report).includes("'=SUM(A1)"));
assert(statementHtml("R&L <Creations>",report).includes("R&amp;L &lt;Creations&gt;"));
const clean = financialReport(range,[base],[{invoice_id:"1",line_total:100}],[
  payment("a","1",{receivedDate:"2026-01-31",amountApplied:110}),
],[],range.through,true);
assert.equal(clean.draft,false);
assert.equal(financialReport(range,[base],[],[payment("tax","1",{receivedDate:"2026-01-31",amountApplied:50})],[],range.through,true).revenue,0);
const installments = financialReport(range,[{...base,tax_mode:"no_tax"}],[],[
  payment("deposit","1",{receivedDate:"2026-01-31",amountApplied:55}),
  payment("final","1",{receivedDate:"2026-02-01",amountApplied:55}),
],[],range.through,true);
assert.equal(installments.revenue,11000);
assert.equal(installments.draft,false);
assert.deepEqual(parseBankCsv('Transaction Date,Description,Debit,Credit\r\n1/2/2026,"Vendor, Inc.",324.205,\r\n1/3/2026,Refund,,42.20'),[
  {day:"2026-01-02",label:"Vendor, Inc.",cents:-32421},{day:"2026-01-03",label:"Refund",cents:4220},
]);
assert.equal(validDay("2026-02-30"),false);
assert.throws(()=>parseBankCsv("Date,Description,Amount\n2/30/2026,Fuel,-10"),/Invalid date/);
console.log("PASS cash basis, exact cents, unknown dates, tax, installments, reversals, split sources, classifications, CSV and export safety");
