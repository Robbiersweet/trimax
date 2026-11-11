"use client";

import { useState, useTransition } from "react";
import { categories, classifications, parseBankCsv, type Expense } from "../../lib/financialReports";
import { confirmCoverage, importExpenses, saveExpense } from "./actions";

const field = "w-full rounded-lg border border-slate-500 bg-zinc-900 p-2 text-white";
const button = "rounded-lg bg-orange-600 px-3 py-2 font-semibold text-white disabled:opacity-50";
type Result = { error?: string; message?: string };
type LedgerRow = Expense & { revision: number };
const categoryOptions = categories.map(category => <option key={category}>{category}</option>);
const classificationOptions = classifications.map(classification => <option key={classification}>{classification}</option>);

function ExpenseForm({ slug, today, row }: { slug: string; today: string; row?: LedgerRow }) {
  const [result, setResult] = useState<Result>();
  const [busy, start] = useTransition();
  return <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    start(async () => {
      const response = await saveExpense(slug, values);
      setResult(response);
      if (response.message && !row) form.reset();
    });
  }}>
    <input type="hidden" name="id" value={row?.id ?? ""} />
    <input type="hidden" name="revision" value={row?.revision ?? ""} />
    <label>Business date<input className={field} type="date" name="day" required defaultValue={row?.business_date ?? today} /></label>
    <label>Vendor<input className={field} name="vendor" required maxLength={240} defaultValue={row?.vendor} /></label>
    <label>Description<input className={field} name="description" maxLength={1000} defaultValue={row?.description} /></label>
    <label>Amount<input className={field} name="amount" required type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={row ? (row.amount_cents / 100).toFixed(2) : undefined} /></label>
    <label>Classification<select className={field} name="classification" defaultValue={row?.classification ?? "unclassified"}>{classificationOptions}</select></label>
    <label>Category<select className={field} name="category" defaultValue={row?.category ?? ""}><option value="">Select for business expense or refund</option>{categoryOptions}</select></label>
    {row ? <label><input type="checkbox" name="voided" defaultChecked={row.voided} /> Void record</label>
      : <label>Receipt (optional, up to 750 KB)<input className={field} type="file" name="receipt" accept=".pdf,.png,.jpeg,.jpg" /></label>}
    <div><button className={button} disabled={busy}>{row ? "Save correction" : "Save expense"}</button></div>
    <p className="sm:col-span-2" role="status">{result?.error ?? result?.message}</p>
  </form>;
}

export function ExpenseImport({ slug }: { slug: string }) {
  const [source, setSource] = useState("");
  const [rows, setRows] = useState<(ReturnType<typeof parseBankCsv>[number] & { classification: string; category: string; include: boolean })[]>([]);
  const [result, setResult] = useState<Result>();
  const [busy, start] = useTransition();
  const update = (index: number, change: Partial<(typeof rows)[number]>) =>
    setRows(current => current.map((row, position) => position === index ? { ...row, ...change } : row));
  return <details className="rounded-xl border border-slate-600 p-4">
    <summary className="cursor-pointer font-semibold">Import bank or credit-card CSV</summary>
    <div className="mt-3 grid gap-3">
      <label>Account label<input className={field} value={source} maxLength={80} onChange={event => setSource(event.target.value)} placeholder="Use the same label for every export from this account" /></label>
      <label>CSV file<input className={field} type="file" accept=".csv,text/csv" onChange={async event => {
        const file = event.target.files?.[0];
        setRows([]); setResult(undefined);
        if (!file) return;
        try {
          if (file.size > 2_000_000) throw Error("Select a CSV under 2 MB.");
          setRows(parseBankCsv(await file.text()).map(row => ({ ...row, classification: "unclassified", category: "", include: false })));
        } catch (error) { setResult({ error: String(error) }); }
      }} /></label>
      {rows.length > 0 && <p>Select and classify the rows to save. The amount keeps the CSV’s sign for review and deduplication.</p>}
      {rows.length > 0 && <div className="grid max-h-[32rem] gap-2 overflow-auto">
        {rows.map((row, index) => <div key={index} className="grid gap-2 rounded border border-slate-700 p-2 sm:grid-cols-3">
          <label><input type="checkbox" checked={row.include} onChange={event => update(index, { include: event.target.checked })} /> {row.day} · {row.label} · {(row.cents / 100).toFixed(2)}</label>
          <select aria-label={"Classification for row " + (index + 1)} className={field} value={row.classification} onChange={event => update(index, { classification: event.target.value })}>{classificationOptions}</select>
          <select aria-label={"Category for row " + (index + 1)} className={field} value={row.category} onChange={event => update(index, { category: event.target.value })}><option value="">Category</option>{categoryOptions}</select>
        </div>)}
      </div>}
      {rows.length > 0 && <button className={button} disabled={busy} onClick={() => start(async () => {
        const selected = rows.filter(row => row.include);
        const response = await importExpenses(slug, source, selected.map(row => ({
          day: row.day, vendor: row.label, description: "Bank CSV", signed: row.cents, amount: Math.abs(row.cents), classification: row.classification, category: row.category,
        })));
        setResult(response);
        if (!response.error) setRows(current => current.filter(row => !row.include));
      })}>Save selected reviewed transactions</button>}
      <p role="status">{result?.error ?? result?.message}</p>
    </div>
  </details>;
}

export function ExpenseLedger({ rows, slug, today }: { rows: LedgerRow[]; slug: string; today: string }) {
  return <section className="grid gap-3">
    <h2 className="text-xl font-semibold">Expense ledger</h2>
    <details className="rounded-xl border border-slate-600 p-4"><summary className="cursor-pointer font-semibold">Record an expense</summary>
      <div className="mt-3"><ExpenseForm slug={slug} today={today} /></div>
    </details>
    <ExpenseImport slug={slug} />
    {rows.map(row => <details key={row.id + ":" + row.revision} className="rounded-xl border border-slate-600 p-3">
      <summary className="cursor-pointer">{row.business_date} · {row.vendor} · ${(row.amount_cents / 100).toFixed(2)} · {row.voided ? "Voided" : row.classification}</summary>
      <div className="mt-3"><ExpenseForm slug={slug} today={today} row={row} /></div>
      <div className="flex gap-4 text-sm underline">
        <a href={"/api/reports/financial?format=history&business=" + encodeURIComponent(slug) + "&id=" + row.id}>Download correction history</a>
        {row.receipt_name && <a href={"/api/reports/financial?format=receipt&business=" + encodeURIComponent(slug) + "&id=" + row.id}>Download receipt</a>}
      </div>
    </details>)}
  </section>;
}

export function Coverage({ slug, from, through, covered, canConfirm }: { slug: string; from: string; through: string; covered: boolean; canConfirm: boolean }) {
  const [checked, setChecked] = useState(false);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<Result>();
  if (covered) return <p>Expense coverage confirmed for this period.</p>;
  if (!canConfirm) return <p>Expense coverage can be confirmed once the period ends.</p>;
  return <div className="grid gap-2">
    <label><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /> I reviewed all business expense sources for this period and recorded the applicable transactions.</label>
    <div><button className={button} disabled={!checked || busy} onClick={() => start(async () => setResult(await confirmCoverage(slug, from, through)))}>Confirm expense coverage</button></div>
    <p role="status">{result?.error ?? result?.message}</p>
  </div>;
}
