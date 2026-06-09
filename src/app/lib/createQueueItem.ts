import { supabase } from "./supabase";
import { logActivity } from "./activityLog";

type CreateQueueItemInput = {
  property: string;
  unit: string;
  paintType: string;
  unitLayout: string;
  wallPaintColor: string;
  flooring: string;
  priority: string;
  smokedIn: boolean;
  primerRequested: boolean;
  priorRenovation: boolean;
  priorRenovationDetails: string;
  renovationNeeded: boolean;
  renovationNeededDetails: string;
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

function isMissingQueueColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return (
    message.includes("primer_requested") ||
    message.includes("unit_layout") ||
    message.includes("wall_paint_color")
  );
}

export async function createQueueItem(input: CreateQueueItemInput) {
  const id = crypto.randomUUID();

  const queueItemInsert = {
    id,
    business_id: input.businessId,
    property: input.property,
    unit: input.unit,
    paint_type: input.paintType,
    unit_layout: input.unitLayout.trim() || null,
    wall_paint_color: input.wallPaintColor.trim() || null,
    flooring: input.flooring,
    priority: input.priority,
    smoked_in: input.smokedIn,
    primer_requested: input.primerRequested,
    prior_renovation: input.priorRenovation,
    prior_renovation_details:
      input.priorRenovationDetails.trim() || null,
    renovation_needed: input.renovationNeeded,
    renovation_needed_details:
      input.renovationNeededDetails.trim() || null,
    move_out_date: normalizeDate(input.moveOutDate),
    ready_date: normalizeDate(input.readyDate),
    scheduled_date: normalizeDate(input.scheduledDate),
    completed_date: normalizeDate(input.completedDate),
    status: "Pending Estimate",
    notes: input.notes,
  };

  let { data, error } = await supabase
    .from("queue_items")
    .insert([queueItemInsert])
    .select()
    .single();

  if (error && isMissingQueueColumnError(error)) {
    const legacyQueueItemInsert: Record<string, unknown> = {
      ...queueItemInsert,
    };
    delete legacyQueueItemInsert.primer_requested;
    delete legacyQueueItemInsert.unit_layout;
    delete legacyQueueItemInsert.wall_paint_color;

    const retry = await supabase
      .from("queue_items")
      .insert([legacyQueueItemInsert])
      .select()
      .single();

    data = retry.data;
    error = retry.error;
  }

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
      unitLayout: input.unitLayout,
      wallPaintColor: input.wallPaintColor,
      flooring: input.flooring,
      smokedIn: input.smokedIn,
      primerRequested: input.primerRequested,
      priorRenovation: input.priorRenovation,
      priorRenovationDetails: input.priorRenovationDetails,
      renovationNeeded: input.renovationNeeded,
      renovationNeededDetails: input.renovationNeededDetails,
      readyDate: input.readyDate,
    },
  });

  return data;
}
