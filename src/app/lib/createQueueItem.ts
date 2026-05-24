import { supabase } from "./supabase";
import { logActivity } from "./activityLog";

type CreateQueueItemInput = {
  property: string;
  unit: string;
  paintType: string;
  flooring: string;
  priority: string;
  smokedIn: boolean;
  moveOutDate: string;
  readyDate: string;
  scheduledDate: string;
  completedDate: string;
  notes: string;
  businessId: string;
};

export async function createQueueItem(input: CreateQueueItemInput) {
  const id = crypto.randomUUID();

  const { data, error } = await supabase
    .from("queue_items")
    .insert([
      {
        id,
        business_id: input.businessId,
        property: input.property,
        unit: input.unit,
        paint_type: input.paintType,
        flooring: input.flooring,
        priority: input.priority,
        smoked_in: input.smokedIn,
        move_out_date: input.moveOutDate,
        ready_date: input.readyDate,
        scheduled_date: input.scheduledDate || null,
        completed_date: input.completedDate || null,
        status: "Pending Estimate",
        notes: input.notes,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Create queue item error:", error);
    throw error;
  }

  await logActivity({
    businessId: input.businessId,
    action: "queue_item.created",
    entityType: "queue_item",
    entityId: data.id,
    entityLabel: `${input.property || "Property"} - Unit ${
      input.unit || "-"
    }`,
    details: {
      property: input.property,
      unit: input.unit,
      paintType: input.paintType,
      flooring: input.flooring,
      readyDate: input.readyDate,
    },
  });

  return data;
}
