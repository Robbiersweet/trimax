import { supabase } from "./supabase";

type CreateQueueItemInput = {
  property: string;
  unit: string;
  paintType: string;
  flooring: string;
  moveOutDate: string;
  readyDate: string;
  notes: string;
};

export async function createQueueItem(
  input: CreateQueueItemInput
) {
  const id = crypto.randomUUID();

  const { data, error } = await supabase
    .from("queue_items")
    .insert([
      {
        id,
        property: input.property,
        unit: input.unit,
        paint_type: input.paintType,
        flooring: input.flooring,
        move_out_date: input.moveOutDate,
        ready_date: input.readyDate,
        status: "Pending Estimate",
        notes: input.notes,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error(
      "Create queue item error:",
      error
    );

    throw error;
  }

  return data;
}