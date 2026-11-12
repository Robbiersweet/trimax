import { moneyCents, percentCents, type MoneyInput } from "./money.ts";

export const categories = ["materials", "supplies", "tools", "fuel", "vehicle", "insurance", "software", "helper labor", "subcontractors", "miscellaneous"] as const;
export const classifications = ["expense", "business refund", "transfer", "owner draw", "credit-card payment", "personal", "unclassified"] as const;
export type Expense = { id: string; business_date: string; vendor: string; description: string; category: string | null; classification: string; amount_cents: number; voided: boolean; receipt_name?: string | null };
export type ReportInvoice = { id: string; display_id: string | null; customer_name: string | null; invoice_amount: MoneyInput; amount_paid: MoneyInput; status: string | null; due_date: string | null; issue_date?: string | null; tax_mode: string | null; tax_rate: MoneyInput; split_parent_invoice_id: string | null };
export type ReportAudit = { id: string; entity_id: string | null; details: Record<string, unknown> | null };
export type ReportLine = { invoice_id: string; line_total: MoneyInput };
export type ReportRange = { from: string; through: string };
export type ReceiptPeriod = { from: string | null; through: string | null; grossCents: number; invoiceId: string };
export const validDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
};
const amount = (value: unknown) => typeof value === "number" || typeof value === "string" ? moneyCents(value) : 0;
const direct = new Set(["materials", "helper labor", "subcontractors"]);
const invalidStatus = /^(void(?:ed)?|cancel(?:l)?ed|superseded|corrected|archived)$/i;

export function financialReport(range: ReportRange, invoices: ReportInvoice[], lines: ReportLine[], audits: ReportAudit[], expenses: Expense[], asOf: string, confirmedComplete = false, legacyPeriods: ReceiptPeriod[] = [], basis: "cash" | "accrual" = "cash") {
  const inPeriod = (day: string) => day >= range.from && day <= range.through;
  const byInvoice = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const parents = new Set(invoices.map(invoice => invoice.split_parent_invoice_id).filter(Boolean));
  const subtotal = new Map<string, number>();
  for (const line of lines) subtotal.set(line.invoice_id, (subtotal.get(line.invoice_id) ?? 0) + amount(line.line_total));
  const linked = new Map<string, number>();
  const seenAllocations = new Set<string>();
  const receipts: { id: string; invoice: string | null; reference: string; date: string | null; gross: number; net: number; tax: number; invoiceId: string; period?: ReportRange }[] = [];
  const classifyPeriod = (from: unknown, through: unknown): ReportRange | null =>
    validDay(from) && validDay(through) && from <= through ? { from, through } : null;
  const classifyTiming = (period: ReportRange) =>
    period.through < range.from || period.from > range.through ? "outside"
      : inPeriod(period.from) && inPeriod(period.through) ? "inside" : "overlap";
  const invoiceNet = (invoice: ReportInvoice, gross: number) => {
    const total = amount(invoice.invoice_amount);
    if (gross <= 0 || gross > total) return null;
    if (invoice.tax_mode === "no_tax") return gross;
    const base = subtotal.get(invoice.id);
    return invoice.tax_mode === "taxable" && base !== undefined && base > 0
      && gross === total && base + percentCents(base, invoice.tax_rate) === total ? base : null;
  };
  const exceptions = [];
  for (const audit of basis === "cash" ? audits : []) {
    const d = audit.details ?? {};
    if (d.paymentReversed === true || d.paymentReversed === "true" || String(d.paymentOutcome).toLowerCase() === "reversed" || d.reversedAt || d.reversalDate) continue;
    const gross = amount(d.amountApplied);
    if (gross <= 0) continue;
    const invoice = byInvoice.get(audit.entity_id ?? "");
    const duplicateKey = invoice && typeof d.atomicRequestKey === "string" && d.atomicRequestKey ? invoice.id + ":" + d.atomicRequestKey : audit.id;
    if (seenAllocations.has(duplicateKey)) continue;
    seenAllocations.add(duplicateKey);
    if (invoice) linked.set(invoice.id, (linked.get(invoice.id) ?? 0) + gross);
    const day = d.historicalReceiptDateUnknown === true ? null : validDay(d.receivedDate) ? d.receivedDate : null;
    const row = { id: audit.id, invoice: invoice?.display_id ?? null, reference: String(d.paymentReference ?? ""), date: day, gross };
    const period = d.historicalReceiptDateUnknown === true ? classifyPeriod(d.receiptPeriodFrom, d.receiptPeriodThrough) : null;
    if (period && classifyTiming(period) === "outside") continue;
    if (period && classifyTiming(period) === "overlap") {
      exceptions.push({ ...row, reason: "Confirmed receipt period overlaps report boundary" });
      continue;
    }
    if (!day && !period) {
      exceptions.push({ ...row, reason: d.historicalReceiptDateUnknown === true ? "Confirmed receipt with unknown date" : "Receipt date unsupported" });
      continue;
    }
    if (day && !inPeriod(day)) continue;
    if (!invoice || parents.has(invoice.id) || invalidStatus.test(invoice.status ?? "")) {
      exceptions.push({ ...row, reason: "Invoice relationship needs reconciliation" }); continue;
    }
    const net = invoiceNet(invoice, gross);
    if (net === null) { exceptions.push({ ...row, reason: "Sales tax allocation unsupported" }); continue; }
    receipts.push({ ...row, date: day, net, tax: gross - net, invoiceId: invoice.id, period: period ?? undefined });
  }
  const accepted = receipts.filter(row => {
    const invoice = byInvoice.get(row.invoiceId)!;
    if ((linked.get(invoice.id) ?? 0) <= amount(invoice.amount_paid)) return true;
    exceptions.push({ ...row, reason: "Payment audits exceed the recorded paid balance" });
    return false;
  });
  const periodByInvoice = new Map(legacyPeriods.map(period => [period.invoiceId, period]));
  for (const invoice of invoices) {
    if (parents.has(invoice.id) || invalidStatus.test(invoice.status ?? "")) continue;
    const gross = basis === "cash" ? amount(invoice.amount_paid) - (linked.get(invoice.id) ?? 0) : amount(invoice.invoice_amount);
    if (gross <= 0) continue;
    const row = { id: invoice.id, invoice: invoice.display_id, reference: "", date: null, gross };
    if (basis === "accrual") {
      if (!/^(paid|sent|issued|open|overdue|partial|partially paid)$/i.test(invoice.status ?? "")) continue;
      if (!validDay(invoice.issue_date)) {
        exceptions.push({ ...row, reason: "Invoice issue date unsupported" });
        continue;
      }
      if (!inPeriod(invoice.issue_date)) continue;
      const net = invoiceNet(invoice, gross);
      if (net === null) exceptions.push({ ...row, reason: "Sales tax allocation unsupported" });
      else accepted.push({ ...row, date: invoice.issue_date, net, tax: gross - net, invoiceId: invoice.id });
      continue;
    }
    const classification = periodByInvoice.get(invoice.id);
    const period = classification?.grossCents === gross ? classifyPeriod(classification.from, classification.through) : null;
    if (!period) {
      exceptions.push({ ...row, reason: "Paid balance lacks linked receipt evidence" });
      continue;
    }
    const timing = classifyTiming(period);
    if (timing === "outside") continue;
    const net = invoiceNet(invoice, gross);
    if (timing === "overlap") exceptions.push({ ...row, reason: "Confirmed receipt period overlaps report boundary" });
    else if (net === null) exceptions.push({ ...row, reason: "Sales tax allocation unsupported" });
    else accepted.push({ ...row, period, net, tax: gross - net, invoiceId: invoice.id });
  }
  const includedExpenses = expenses.filter(row => !row.voided && inPeriod(row.business_date) && (row.classification === "expense" || row.classification === "business refund") && categories.some(c => c === row.category));
  const reviewCount = expenses.filter(row => !row.voided && inPeriod(row.business_date) && row.classification === "unclassified").length;
  const byCategory = categories.map(category => ({
    category, direct: direct.has(category), cents: includedExpenses.filter(row => row.category === category)
      .reduce((sum, row) => sum + row.amount_cents * (row.classification === "business refund" ? -1 : 1), 0),
  }));
  const revenue = accepted.reduce((sum, row) => sum + row.net, 0);
  const jobCosts = byCategory.filter(row => row.direct).reduce((sum, row) => sum + row.cents, 0);
  const operating = byCategory.filter(row => !row.direct).reduce((sum, row) => sum + row.cents, 0);
  const monthly = new Map<string, number>();
  for (const row of accepted) {
    if (!row.date) continue;
    const month = row.date.slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + row.net);
  }
  const receivable = invoices.flatMap(invoice => {
    const cents = amount(invoice.invoice_amount) - amount(invoice.amount_paid);
    if (parents.has(invoice.id) || cents <= 0 || !/^(sent|issued|open|overdue|partial|partially paid)$/i.test(invoice.status ?? "")) return [];
    return [{ ...invoice, cents, overdue: Boolean(invoice.due_date && invoice.due_date < asOf) }];
  });
  return { range, basis, receipts: accepted, exceptions, expenses: includedExpenses, byCategory, monthly: [...monthly].sort(), receivable, revenue, jobCosts, operating, grossProfit: revenue - jobCosts, totalExpenses: jobCosts + operating, netProfit: revenue - jobCosts - operating, reviewCount, draft: basis === "accrual" || !confirmedComplete || exceptions.length > 0 || reviewCount > 0 };
}

export function parseBankCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index++; }
      else if (quoted || !cell) quoted = !quoted;
      else throw Error("Unexpected quote in CSV");
    } else if (!quoted && (character === "," || character === "\n")) {
      row.push(cell.trim()); cell = "";
      if (character === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else if (character !== "\r" || quoted) cell += character;
  }
  if (quoted) throw Error("CSV contains an unclosed quoted field");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map(value => value.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "")) ?? [];
  const find = (...names: string[]) => headers.findIndex(header => names.includes(header));
  const date = find("date", "transactiondate", "postingdate", "posteddate", "postdate");
  const description = find("description", "name", "merchant", "payee", "memo", "details");
  const signed = find("amount", "transactionamount");
  const debit = find("debit", "withdrawal", "withdrawals", "debitamount");
  const credit = find("credit", "deposit", "deposits", "creditamount");
  if (date < 0 || description < 0 || (signed < 0 && debit < 0 && credit < 0)) throw Error("CSV needs Date, Description, and Amount or Debit/Credit columns");
  return rows.map((values, index) => {
    let day = values[date];
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(day);
    if (us) day = [us[3], us[1].padStart(2, "0"), us[2].padStart(2, "0")].join("-");
    const label = values[description]?.trim();
    const parse = (v: string | undefined) => amount(v?.replace(/^\((.+)\)$/, "-$1"));
    const cents = signed >= 0 ? parse(values[signed]) : Math.abs(parse(values[credit])) - Math.abs(parse(values[debit]));
    if (!validDay(day) || !label || !cents) throw Error("Invalid date, description, or amount on CSV row " + (index + 2));
    return { day, label, cents };
  });
}
