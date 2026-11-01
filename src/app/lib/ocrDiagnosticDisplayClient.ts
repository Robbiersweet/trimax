import { supabase } from "./supabase";
import type { ScanSummary } from "./ocrHistory";

export async function diagnosticSavedDates(businessId: string, attemptIds: string[]) {
  const ids = [...new Set(attemptIds)].filter(Boolean).slice(0, 5);
  if (!businessId || !ids.length) return {} as Record<string, string>;
  const { data, error } = await supabase.from("ocr_attempts").select("id,created_at")
    .eq("business_id", businessId).in("id", ids);
  if (error) throw Error("Saved scan dates unavailable");
  return Object.fromEntries((data ?? []).map(row => [row.id, row.created_at])) as Record<string, string>;
}

export async function diagnosticPairedSummary(businessId: string, attemptId: string) {
  if (!businessId || !attemptId) return null;
  const { data, error } = await supabase.from("ocr_attempts").select("summary")
    .eq("business_id", businessId).eq("id", attemptId).maybeSingle();
  if (error) throw Error("Paired diagnostic status unavailable");
  return (data?.summary ?? null) as ScanSummary | null;
}

export async function diagnosticRecordedRelease(businessId: string, attemptId: string) {
  if (!businessId || !attemptId) return null;
  // Confirm the parent scope before reading a small projection through existing RLS.
  const parent = await supabase.from("ocr_attempts").select("id")
    .eq("business_id", businessId).eq("id", attemptId).maybeSingle();
  if (parent.error || parent.data?.id !== attemptId) throw Error("Diagnostic metadata unavailable");
  const { data, error } = await supabase.from("ocr_attempt_diagnostics")
    .select("release:payload->result->release").eq("attempt_id", attemptId).maybeSingle();
  if (error) throw Error("Recorded worker build unavailable");
  return data?.release ?? null;
}
