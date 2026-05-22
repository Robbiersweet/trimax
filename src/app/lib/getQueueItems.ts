import { supabase } from "./supabase";

export async function getQueueItems(businessId?: string) {
  let query = supabase
    .from("queue_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (businessId) {
    query = query.eq("business_id", businessId);
  }

  const { data, error } = await query;

  if (error) {
    console.log("Supabase error message:", error.message);
    console.log("Supabase error details:", error.details);
    console.log("Supabase error hint:", error.hint);
    console.log("Supabase error code:", error.code);

    return [];
  }

  return data ?? [];
}