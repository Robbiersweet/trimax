import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabaseServer";
import { debugColumns, type DebugAttempt, type DebugFilter } from "./ocrDebug";
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function authenticatedOcrInvestigator() {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  return client;
}
export async function requireOcrAdmin(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  businessId: string,
) {
  const { data, error } = await client.rpc("trimax_is_business_admin", {
    target_business_id: businessId,
  });
  if (error || data !== true) notFound();
}
export async function loadDebugQueue(
  businessSlug: string,
  filter: DebugFilter,
  before?: string,
  beforeId?: string,
) {
  const client = await authenticatedOcrInvestigator();
  const { data: business, error } = await client
    .from("businesses")
    .select("id,name,slug")
    .eq("slug", businessSlug)
    .maybeSingle();
  if (error || !business) notFound();
  await requireOcrAdmin(client, business.id);
  let query = client
    .from("ocr_debug_queue")
    .select(debugColumns)
    .eq("business_id", business.id);
  if (filter === "Needs Investigation")
    query = query
      .eq("debug_worthy", true)
      .eq("debug_status", "Needs Investigation");
  if (filter === "Failed") query = query.eq("result", "failed");
  if (filter === "Review Required")
    query = query
      .eq("debug_worthy", true)
      .neq("result", "failed")
      .neq("result", "processing");
  if (filter === "Pinned") query = query.eq("pinned", true);
  if (before && beforeId) {
    if (
      !uuidPattern.test(beforeId) ||
      !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(before) ||
      !Number.isFinite(Date.parse(before))
    )
      notFound();
    query = query.or(
      `created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`,
    );
  }
  const { data, error: listError } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(31);
  if (listError) throw new Error("Could not load OCR debug queue.");
  return {
    business,
    attempts: (data ?? []).slice(0, 30) as DebugAttempt[],
    hasMore: (data ?? []).length > 30,
  };
}
export async function loadDebugAttempt(id: string) {
  const client = await authenticatedOcrInvestigator();
  if (!uuidPattern.test(id)) notFound();
  // Existing RLS already restricts this lookup to the attempt's owner/admin workspace.
  const { data: attempt, error } = await client
    .from("ocr_debug_queue")
    .select(debugColumns)
    .eq("id", id)
    .maybeSingle();
  if (error || !attempt) notFound();
  await requireOcrAdmin(client, attempt.business_id);
  const { data: business } = await client
    .from("businesses")
    .select("id,name,slug")
    .eq("id", attempt.business_id)
    .maybeSingle();
  if (!business) notFound();
  const { data: family, error: familyError } = await client
    .from("ocr_attempts")
    .select("id,created_at,parent_id,result")
    .eq("business_id", attempt.business_id)
    .eq("original_id", attempt.original_id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(101);
  if (familyError) throw new Error("Could not load related OCR attempts.");
  return {
    attempt: attempt as DebugAttempt,
    business,
    family: (family ?? []).slice(0, 100) as Array<{
      id: string;
      created_at: string;
      parent_id: string | null;
      result: string;
    }>,
    moreFamily: (family ?? []).length > 100,
  };
}
