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

function normalizeDate(value: string) {
  return value.trim() || null;
}

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
        move_out_date: normalizeDate(input.moveOutDate),
        ready_date: normalizeDate(input.readyDate),
        scheduled_date: normalizeDate(input.scheduledDate),
        completed_date: normalizeDate(input.completedDate),
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
