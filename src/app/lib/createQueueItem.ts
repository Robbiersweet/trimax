import { supabase } from "./supabase";
import { logActivity } from "./activityLog";
import { assertCanWriteDuringMaintenance } from "./maintenanceMode";
import { normalizeTbdValue } from "./tbd";

type CreateQueueItemInput = {
  property: string;
  unit: string;
  paintType: string;
  unitLayout: string;
  wallPaintColor: string;
  flooring: string;
  priority: string;
  priorityOrder?: string | number | null;
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
  businessSlug?: string;
};

function normalizeDate(value: string) {
  return value.trim() || null;
}

function normalizePriorityOrder(value: string | number | null | undefined) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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
    message.includes("wall_paint_color") ||
    message.includes("priority_order") ||
    message.includes("priority_updated_at") ||
    message.includes("priority_updated_by") ||
    message.includes("deadline_updated_at") ||
    message.includes("deadline_updated_by") ||
    message.includes("projected_completion_date") ||
    message.includes("progress_stage") ||
    message.includes("percent_complete") ||
    message.includes("delay_reason") ||
    message.includes("manager_update")
  );
}

export async function createQueueItem(input: CreateQueueItemInput) {
  await assertCanWriteDuringMaintenance(input.businessSlug);

  const id = crypto.randomUUID();
  const priorityOrder = normalizePriorityOrder(input.priorityOrder);
  const neededByDate = normalizeDate(input.readyDate);
  const now = new Date().toISOString();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const queueItemInsert = {
    id,
    business_id: input.businessId,
    property: input.property,
    unit: input.unit,
    paint_type: input.paintType,
    unit_layout: input.unitLayout.trim() || null,
    wall_paint_color: normalizeTbdValue(input.wallPaintColor).trim() || null,
    flooring: normalizeTbdValue(input.flooring),
    priority: input.priority,
    priority_order: priorityOrder,
    priority_updated_at: priorityOrder ? now : null,
    priority_updated_by: priorityOrder ? user?.id ?? null : null,
    smoked_in: input.smokedIn,
    primer_requested: input.primerRequested,
    prior_renovation: input.priorRenovation,
    prior_renovation_details:
      input.priorRenovationDetails.trim() || null,
    renovation_needed: input.renovationNeeded,
    renovation_needed_details:
      input.renovationNeededDetails.trim() || null,
    move_out_date: normalizeDate(input.moveOutDate),
    ready_date: neededByDate,
    deadline_updated_at: neededByDate ? now : null,
    deadline_updated_by: neededByDate ? user?.id ?? null : null,
    scheduled_date: normalizeDate(input.scheduledDate),
    completed_date: normalizeDate(input.completedDate),
    projected_completion_date: null,
    progress_stage: "Not Started",
    percent_complete: 0,
    delay_reason: null,
    manager_update: null,
    manager_update_at: null,
    manager_update_by: null,
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
    delete legacyQueueItemInsert.priority_order;
    delete legacyQueueItemInsert.priority_updated_at;
    delete legacyQueueItemInsert.priority_updated_by;
    delete legacyQueueItemInsert.deadline_updated_at;
    delete legacyQueueItemInsert.deadline_updated_by;
    delete legacyQueueItemInsert.projected_completion_date;
    delete legacyQueueItemInsert.progress_stage;
    delete legacyQueueItemInsert.percent_complete;
    delete legacyQueueItemInsert.delay_reason;
    delete legacyQueueItemInsert.manager_update;
    delete legacyQueueItemInsert.manager_update_at;
    delete legacyQueueItemInsert.manager_update_by;

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
      neededByDate: input.readyDate || null,
      readyDate: input.readyDate,
      priorityOrder,
    },
  });

  return data;
}
