import "server-only";
import { createSupabaseServerClient } from "./supabaseServer";
import { financialReport, validDay, type Expense, type ReportInvoice, type ReportLine, type ReportAudit, type ReportRange } from "./financialReports";

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function reportRange(search: { from?: string; through?: string; period?: string }): ReportRange {
  const day = today();
  const year = day.slice(0, 4);
  if (search.period === "month") return { from: day.slice(0, 7) + "-01", through: day };
  if (search.period === "year") return { from: year + "-01-01", through: year + "-12-31" };
  if (search.period === "custom") {
    if (!validDay(search.from) || !validDay(search.through) || search.from > search.through) throw Error("Enter a valid start and end date.");
    return { from: search.from, through: search.through };
  }
  return { from: year + "-01-01", through: day };
}

export async function financialAccess(slug: string) {
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return null;
  const { data: business, error } = await client.from("businesses").select("id,name,slug").eq("slug", slug).maybeSingle<{ id: string; name: string; slug: string }>();
  if (error || !business) return null;
  const { data: allowed, error: roleError } = await client.rpc("trimax_is_business_admin", { target_business_id: business.id });
  if (roleError || allowed !== true) return null;
  return { client, business };
}

async function pages<T>(fetch: (start: number, end: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await fetch(start, start + 499);
    if (error || !data) throw Error("A financial source could not be read. Retry before exporting.");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export const expenseFields = "id,business_date,vendor,description,category,classification,amount_cents,receipt_name,voided,updated_at,revision";
export async function loadFinancialReport(access: NonNullable<Awaited<ReturnType<typeof financialAccess>>>, range: ReportRange) {
  const { client, business } = access;
  const scoped = (table: string, select: string) => client.from(table).select(select).eq("business_id", business.id).order("id");
  const [invoices, lines, audits, expenses, coverage, latestExpense] = await Promise.all([
    pages((start, end) => scoped("invoices", "id,display_id,customer_name,invoice_amount,amount_paid,status,due_date,tax_mode,tax_rate,split_parent_invoice_id").range(start, end).overrideTypes<ReportInvoice[], {merge: false}>()),
    pages((start, end) => scoped("invoice_line_items", "invoice_id,line_total").range(start, end).overrideTypes<ReportLine[], {merge: false}>()),
    pages((start, end) => scoped("activity_logs", "id,entity_id,details").eq("action", "invoice.batch_payment_applied").range(start, end).overrideTypes<ReportAudit[], {merge: false}>()),
    pages<Expense & { updated_at: string; revision: number }>((start, end) => scoped("financial_expenses", expenseFields).gte("business_date", range.from).lte("business_date", range.through).range(start, end).overrideTypes<(Expense & {updated_at: string; revision: number})[], {merge: false}>()),
    client.from("financial_report_coverage").select("verified_at").eq("business_id", business.id).eq("period_start", range.from).eq("period_end", range.through).order("id", {ascending: false}).limit(1).maybeSingle(),
    client.from("financial_expenses").select("updated_at").eq("business_id", business.id).order("updated_at", {ascending: false}).limit(1).maybeSingle(),
  ]);
  if (coverage.error || latestExpense.error) throw Error("Expense coverage could not be verified.");
  const covered = Boolean(coverage.data && (!latestExpense.data || coverage.data.verified_at >= latestExpense.data.updated_at));
  const report = financialReport(range, invoices, lines, audits, expenses, today(), covered);
  return { report, expenses, covered };
}
