"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { categories, classifications, validDay } from "../../lib/financialReports";
import { financialAccess, loadFinancialReport, today } from "../../lib/financialReportsServer";
import { moneyCents } from "../../lib/money";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Entry = { day: string; vendor: string; description: string; amount: number; classification: string; category: string };
function entry(row: Entry) {
  if (!row || !validDay(row.day) || typeof row.vendor !== "string" || !row.vendor.trim() || row.vendor.length > 240 ||
      typeof row.description !== "string" || row.description.length > 1000 || !Number.isSafeInteger(row.amount) ||
      row.amount <= 0 || row.amount > 100000000000 || !classifications.some(value => value === row.classification)) {
    throw Error("Check the date, vendor, amount, and transaction classification.");
  }
  const operating = ["expense", "business refund"].includes(row.classification);
  if (operating && !categories.some(value => value === row.category)) throw Error("Select a category for every business expense or refund.");
  return { business_date: row.day, vendor: row.vendor.trim(), description: row.description.trim(), amount_cents: row.amount, classification: row.classification, category: operating ? row.category : null };
}

async function receipt(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > 750 * 1024) throw Error("Receipts must be 750 KB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const hex = bytes.subarray(0, 8).toString("hex");
  const mime = hex.startsWith("255044462d") ? "application/pdf" : hex.startsWith("ffd8ff") ? "image/jpeg" : hex === "89504e470d0a1a0a" ? "image/png" : null;
  if (!mime) throw Error("Use a PDF, PNG, or JPEG receipt.");
  return { receipt_name: file.name.slice(0, 200), receipt_type: mime, receipt_data: bytes.toString("base64") };
}

export async function saveExpense(slug: string, form: FormData) {
  const access = await financialAccess(slug);
  if (!access) return { error: "Owner or admin access required." };
  const { client, business } = access;
  const field = (name: string) => String(form.get(name) ?? "");
  try {
    const id = field("id"), revision = Number(field("revision"));
    const change = entry({ day: field("day"), vendor: field("vendor"), description: field("description"), amount: moneyCents(field("amount")), category: field("category"), classification: field("classification") });
    if (id && (!uuid.test(id) || !Number.isSafeInteger(revision) || revision < 1)) throw Error("Reload the expense before saving.");
    const result = id
      ? await client.from("financial_expenses").update({ ...change, voided: field("voided") === "on" }).eq("business_id", business.id).eq("id", id).eq("revision", revision).select("id")
      : await client.from("financial_expenses").insert({ ...change, business_id: business.id, ...await receipt(form.get("receipt")) }).select("id");
    if (result.error || result.data?.length !== 1) throw Error("Expense could not be saved. Reload before retrying.");
    revalidatePath("/reports/financial");
    return { message: "Expense record saved." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Expense could not be saved." }; }
}

export async function importExpenses(slug: string, source: string, rows: (Entry & { signed: number })[]) {
  const access = await financialAccess(slug);
  if (!access) return { error: "Owner or admin access required." };
  try {
    if (typeof source !== "string" || !source.trim() || source.length > 80 || !Array.isArray(rows) || !rows.length || rows.length > 250) throw Error("Enter a stable account label and select up to 250 reviewed rows.");
    const normalized = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
    const keys = new Set<string>();
    const records = rows.map(row => {
      const record = entry(row);
      if (row.classification === "unclassified" || Math.abs(row.signed) !== row.amount) throw Error("Classify every selected row before importing.");
      const key = createHash("sha256").update(JSON.stringify([normalized(source), row.day, normalized(row.vendor), row.signed])).digest("hex");
      if (keys.has(key)) return null;
      keys.add(key);
      return { ...record, business_id: access.business.id, source_key: key };
    }).filter(value => value !== null);
    const { data, error } = await access.client.from("financial_expenses")
      .upsert(records, { onConflict: "business_id,source_key", ignoreDuplicates: true }).select("id");
    if (error || !data) throw Error("Import failed. No rows in this batch were posted.");
    revalidatePath("/reports/financial");
    return { message: data.length + " saved. " + (rows.length - data.length) + " matching rows skipped. Review any legitimate same-day repeats and enter them manually." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Import failed." }; }
}

export async function confirmCoverage(slug: string, from: string, through: string) {
  const access = await financialAccess(slug);
  if (!access || !validDay(from) || !validDay(through) || from > through || through > today()) return { error: "Select a reporting period ending today or earlier." };
  const { error } = await access.client.from("financial_report_coverage").insert({ business_id: access.business.id, period_start: from, period_end: through });
  if (error) return { error: "Expense coverage could not be confirmed." };
  revalidatePath("/reports/financial");
  return { message: "Expense coverage confirmed." };
}

export async function reviewLegacyReceiptPeriods(slug: string, form: FormData): Promise<void> {
  const access = await financialAccess(slug);
  if (!access) throw Error("Owner or admin access is required.");
  const ids = [...new Set(form.getAll("invoice").map(String))];
  const disposition = form.get("disposition");
  const cutoff = form.get("cutoff");
  if (!ids.length || ids.length > 500 || ids.some(id => !uuid.test(id))) throw Error("Select invoices to review.");
  if (disposition !== "2026" && disposition !== "prior" && disposition !== "unknown") throw Error("Choose a receipt period.");
  if (disposition === "2026" && (!validDay(cutoff) || cutoff < "2026-01-01" || cutoff > "2026-12-31" || cutoff > today())) throw Error("Enter the last date covered by your confirmation.");
  const { legacyReview } = await loadFinancialReport(access, { from: "2026-01-01", through: today() });
  const candidates = new Map(legacyReview.map(row => [row.id, row]));
  const rows = ids.map(id => {
    const row = candidates.get(id);
    if (!row || row.gross !== Number(form.get("gross-" + id))) throw Error("An invoice changed. Reload the review before saving.");
    return {
      business_id: access.business.id,
      invoice_id: id,
      gross_cents: row.gross,
      received_from: disposition === "2026" ? "2026-01-01" : disposition === "prior" ? "0001-01-01" : null,
      received_through: disposition === "2026" ? cutoff : disposition === "prior" ? "2025-12-31" : null,
    };
  });
  const { error } = await access.client.from("financial_receipt_period_reviews").insert(rows);
  if (error) throw Error("Receipt period review could not be saved.");
  revalidatePath("/reports/financial");
}
