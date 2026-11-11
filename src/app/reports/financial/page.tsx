import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import { financialAccess, loadFinancialReport, reportRange, today } from "../../lib/financialReportsServer";
import { displayCents, statementLines } from "../../lib/financialReportExport";
import { Coverage, ExpenseLedger } from "./ExpenseLedger";

type Search = { business?: string; period?: string; from?: string; through?: string };
const field = "rounded-lg border border-slate-500 bg-zinc-900 p-2 text-white";
const panel = "grid gap-3 p-4";
const total = (rows: { cents: number }[]) => rows.reduce((sum, row) => sum + row.cents, 0);

export default async function FinancialReports({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const access = await financialAccess(query.business ?? "rnl-creations");
  if (!access) return <AppShell><p className="p-4">Owner or admin access is required to view financial reports.</p></AppShell>;
  let result;
  try { result = await loadFinancialReport(access, reportRange(query)); }
  catch (error) { return <AppShell><p className="p-4">{error instanceof Error ? error.message : "Financial reports unavailable."}</p><Link className="p-4 underline" href={"/reports/financial?business=" + encodeURIComponent(access.business.slug)}>Reset to year to date</Link></AppShell>; }
  const { report, expenses, covered } = result;
  const { business } = access;
  const { from, through } = report.range;
  const exportUrl = "/api/reports/financial?" + new URLSearchParams({ business: business.slug, period: "custom", from, through });
  const reportPath = "/reports/financial?business=" + encodeURIComponent(business.slug);
  const excluded = report.exceptions.reduce((sum, row) => sum + row.gross, 0);
  const disputed = (row: typeof report.receivable[number]) => business.slug === "rnl-creations" && row.display_id === "INV-0533" && /glen/i.test(row.customer_name ?? "");
  return <AppShell><main className="mx-auto grid max-w-5xl gap-4 p-4">
    <header className="grid gap-1">
      <Link className="text-sm underline" href={"/reports?business=" + encodeURIComponent(business.slug)}>All reports</Link>
      <h1 className="text-2xl font-bold">Financial reports</h1>
      <p>{business.name} · Cash basis · USD</p>
    </header>
    <Card className={panel}>
      <nav aria-label="Report periods" className="flex flex-wrap gap-4 underline">
        <Link href={reportPath}>Year to date</Link><Link href={reportPath + "&period=month"}>This month</Link><Link href={reportPath + "&period=year"}>This calendar year</Link>
      </nav>
      <form key={from + ":" + through} method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="business" value={business.slug} /><input type="hidden" name="period" value="custom" />
        <label className="grid gap-1">Start date<input className={field} required name="from" type="date" defaultValue={from} /></label>
        <label className="grid gap-1">End date<input className={field} required name="through" type="date" defaultValue={through} /></label>
        <button className="rounded-lg bg-slate-700 px-3 py-2 text-white">Apply dates</button>
      </form>
    </Card>
    <Card className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Profit &amp; Loss</h2><p>{from} through {through}</p></div>
        <a className="rounded-lg bg-orange-700 px-3 py-2 font-semibold text-white" href={exportUrl + "&format=pdf"}>Download P&amp;L PDF</a>
      </div>
      {report.draft && <p role="status" className="rounded-lg border border-amber-500 p-2 font-semibold">Draft · Incomplete records</p>}
      <dl className="divide-y divide-slate-500">{statementLines(report).map(([label, cents]) => <div className="flex justify-between gap-4 py-2" key={label}><dt>{label}</dt><dd className="whitespace-nowrap tabular-nums">{displayCents(cents)}</dd></div>)}</dl>
      {!covered && <p className="text-sm">Expense coverage is unconfirmed. Zero recorded expenses do not establish zero actual expenses.</p>}
      <Coverage key={from + through} slug={business.slug} from={from} through={through} covered={covered} canConfirm={through <= today()} />
      {report.reviewCount > 0 && <p>{report.reviewCount} transactions need classification.</p>}
      <a className="underline" href={exportUrl + "&format=csv"}>Download figures and transaction references CSV</a>
      <p className="text-sm">Prepared from business records. This statement has not been independently audited or CPA-certified.</p>
    </Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={panel}><h2 className="text-lg font-semibold">Revenue by month</h2>
        {report.monthly.length ? report.monthly.map(([month, cents]) => <div className="flex justify-between" key={month}><span>{month}</span><span>{displayCents(cents)}</span></div>) : <p>No supported dated revenue in this period.</p>}
      </Card>
      <Card className={panel}><h2 className="text-lg font-semibold">Expenses by category</h2>
        {report.byCategory.map(row => <div className="flex justify-between" key={row.category}><span>{row.category}{row.direct ? " · direct" : ""}</span><span>{displayCents(row.cents)}</span></div>)}
      </Card>
    </div>
    {report.exceptions.length > 0 && <Card className={panel}><details>
      <summary className="cursor-pointer font-semibold">Receipt exceptions · {displayCents(excluded)} requires review</summary>
      <p className="my-2 text-sm">Undated and unsupported paid-balance evidence may fall outside the selected period. These amounts are excluded from revenue.</p>
      <ul className="max-h-72 overflow-auto">{report.exceptions.map((row, index) => <li key={row.id + index} className="border-t border-slate-600 py-2 text-sm">
        {row.invoice ?? "Invoice unavailable"} · {row.reference || "No check reference"} · {row.date ?? "Date unknown"} · {displayCents(row.gross)} · {row.reason}
      </li>)}</ul>
    </details></Card>}
    <Card className={panel}><h2 className="text-lg font-semibold">Accounts receivable</h2>
      <p>Current TriMax ledger as of {today()}. This balance is independent of the report period.</p>
      <p>Outstanding {displayCents(total(report.receivable))} · Overdue {displayCents(total(report.receivable.filter(row => row.overdue)))}</p>
      {report.receivable.map(row => <div key={row.id} className="grid gap-1 border-t border-slate-600 py-2">
        <div className="flex justify-between gap-3"><Link className="underline" href={"/invoices/" + row.id + "?business=" + encodeURIComponent(business.slug)}>{row.display_id ?? "Invoice"} · {row.customer_name}</Link><span>{displayCents(row.cents)}</span></div>
        <p className="text-sm">{row.overdue ? "Overdue" : "Open"} · {row.due_date ?? "No due date recorded"}</p>
        {disputed(row) && <p className="text-sm font-semibold">Reconciliation needed. Owner reports this may have been paid. Amount shown is the current ledger balance.</p>}
      </div>)}
    </Card>
    <ExpenseLedger rows={expenses.sort((a, b) => b.business_date.localeCompare(a.business_date))} slug={business.slug} today={today()} />
  </main></AppShell>;
}
