import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceLogo } from "../../../lib/workspaceLogo";
import { NextRequest } from "next/server";
import { financialAccess, loadFinancialReport, reportRange } from "../../../lib/financialReportsServer";
import { financialCsv, statementHtml } from "../../../lib/financialReportExport";
import { renderStatementPdf } from "../../../lib/financialReportPdf";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function attachment(body: BodyInit, filename: string, contentType: string) {
  return new Response(body, { headers: { ...headers, "Content-Type": contentType, "Content-Disposition": 'attachment; filename="' + filename.replace(/[^a-z0-9._-]/gi, "-") + '"' } });
}
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const access = await financialAccess(query.get("business") ?? "");
  if (!access) return new Response("Owner or admin access required.", { status: 403, headers });
  const format = query.get("format");
  if (format === "receipt" || format === "history") {
    const id = query.get("id") ?? "";
    if (!/^[a-f0-9-]{36}$/i.test(id)) return new Response("Expense not found.", { status: 404, headers });
    if (format === "receipt") {
      const { data, error } = await access.client.from("financial_expenses").select("receipt_name,receipt_type,receipt_data").eq("business_id", access.business.id).eq("id", id).maybeSingle();
      if (error || !data?.receipt_data) return new Response("Receipt not found.", { status: 404, headers });
      return attachment(new Uint8Array(Buffer.from(data.receipt_data, "base64")), data.receipt_name, data.receipt_type);
    }
    const { data, error } = await access.client.from("financial_expense_history").select("changed_by,changed_at,previous,current").eq("business_id", access.business.id).eq("expense_id", id).order("id");
    if (error || !data?.length) return new Response("Expense history not found.", { status: 404, headers });
    return attachment(JSON.stringify(data, null, 2), "expense-history.json", "application/json");
  }
  if (format !== "pdf" && format !== "csv") return new Response("Choose PDF or CSV.", { status: 400, headers });
  try {
    const range = reportRange(Object.fromEntries(query));
    const { report, covered } = await loadFinancialReport(access, range, query.get("basis") === "accrual" ? "accrual" : "cash");
    const base = (report.basis === "accrual" ? "profit-and-loss-accrual-" : "profit-and-loss-") + range.from + "-to-" + range.through + (report.draft ? "-draft" : "");
    if (format === "csv") return attachment(financialCsv(report), base + ".csv", "text/csv; charset=utf-8");
    const logo = workspaceLogo(access.business.slug);
    const bytes = logo ? await readFile(join(process.cwd(), "public", logo.slice(1))).catch(() => null) : null;
    const logoDataUrl = bytes ? "data:image/png;base64," + bytes.toString("base64") : undefined;
    const pdf = await renderStatementPdf(statementHtml({ name: access.business.name, logoDataUrl }, report, covered));
    return attachment(new Uint8Array(pdf), base + ".pdf", "application/pdf");
  } catch {
    return new Response("The report could not be generated. Check the selected period and retry.", { status: 503, headers });
  }
}
