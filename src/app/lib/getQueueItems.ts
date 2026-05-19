import { supabase } from "./supabase";

export async function getQueueItems() {
  const { data, error } = await supabase
    .from("queue_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.log("Supabase error message:", error.message);
    console.log("Supabase error details:", error.details);
    console.log("Supabase error hint:", error.hint);
    console.log("Supabase error code:", error.code);

    return [];
  }

  return data ?? [];
}