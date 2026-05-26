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
    console.warn("Queue items could not be loaded:", error.message);

    return [];
  }

  return data ?? [];
}
