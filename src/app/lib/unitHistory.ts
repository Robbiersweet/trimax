import { supabase } from "./supabase";
import { getConfirmedNorthCreekUnit } from "../utils/northCreekUnits";
import { canonicalApartmentUnitLabel } from "../utils/unitLabels";

type UnitHistoryEventType =
  | "paint"
  | "flooring"
  | "smoker_remediation"
  | "renovation"
  | "general_turn"
  | "scheduled";

type QueueItemForHistory = {
  id: string;
  business_id: string | null;
  property: string | null;
  unit: string | null;
  paint_type: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  smoked_in: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
  notes: string | null;
};

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUnitLabel(value: string | null | undefined) {
  return canonicalApartmentUnitLabel(value);
}

function historyEventType(
  requestedType: UnitHistoryEventType,
  queueItem: QueueItemForHistory
): UnitHistoryEventType {
  if (requestedType !== "general_turn") {
    return requestedType;
  }

  if (queueItem.renovation_needed) {
    return "renovation";
  }

  if (queueItem.smoked_in) {
    return "smoker_remediation";
  }

  if (queueItem.paint_type) {
    return "paint";
  }

  if (queueItem.flooring) {
    return "flooring";
  }

  return "general_turn";
}

export async function appendUnitHistoryForQueueItem({
  queueItemId,
  businessId,
  eventType,
  eventDate,
}: {
  queueItemId: string;
  businessId?: string | null;
  eventType: UnitHistoryEventType;
  eventDate: string;
}) {
  if (!businessId) {
    return;
  }

  const { data: queueItem, error: queueError } = await supabase
    .from("queue_items")
    .select(
      "id, business_id, property, unit, paint_type, wall_paint_color, flooring, smoked_in, prior_renovation, prior_renovation_details, renovation_needed, renovation_needed_details, notes"
    )
    .eq("id", queueItemId)
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();

  if (queueError || !queueItem) {
    if (queueError) {
      console.warn("Unit history queue lookup failed:", queueError.message);
    }
    return;
  }

  const item = queueItem as QueueItemForHistory;

  if (
    propertyKey(item.property) !== "north-creek-apartments" ||
    !normalizeUnitLabel(item.unit)
  ) {
    return;
  }

  const { data: propertyData, error: propertyError } = await supabase
    .from("properties")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", "North Creek Apartments")
    .limit(1)
    .maybeSingle();

  if (propertyError || !propertyData) {
    if (propertyError) {
      console.warn("Unit history property lookup failed:", propertyError.message);
    }
    return;
  }

  const { data: existingUnitData, error: unitError } = await supabase
    .from("property_units")
    .select("id")
    .eq("property_id", propertyData.id)
    .eq("unit_label", normalizeUnitLabel(item.unit))
    .limit(1)
    .maybeSingle();
  let unitData = existingUnitData;

  if (unitError || !unitData) {
    if (unitError) {
      console.warn("Unit history unit lookup failed:", unitError.message);
    }

    const confirmedUnit = getConfirmedNorthCreekUnit(item.unit);

    if (!confirmedUnit) {
      return;
    }

    const { data: restoredUnit, error: restoreError } = await supabase
      .from("property_units")
      .upsert(
        {
          business_id: businessId,
          property_id: propertyData.id,
          building_letter: confirmedUnit.building_letter,
          unit_number: confirmedUnit.unit_number,
          unit_label: confirmedUnit.unit_label,
          floor: confirmedUnit.floor,
          floorplan: confirmedUnit.floorplan,
        },
        {
          onConflict: "property_id,unit_label",
        }
      )
      .select("id")
      .single();

    if (restoreError || !restoredUnit) {
      if (restoreError) {
        console.warn(
          "Unit history unit restore failed:",
          restoreError.message
        );
      }
      return;
    }

    unitData = restoredUnit;
  }

  const resolvedEventType = historyEventType(eventType, item);

  const { error } = await supabase.from("unit_history").insert([
    {
      business_id: businessId,
      property_unit_id: unitData.id,
      queue_item_id: queueItemId,
      event_type: resolvedEventType,
      event_date: eventDate || null,
      paint_type: item.paint_type,
      wall_paint_color: item.wall_paint_color,
      flooring: item.flooring,
      smoker_remediation: Boolean(item.smoked_in),
      prior_renovation: Boolean(item.prior_renovation),
      prior_renovation_details:
        item.prior_renovation_details ||
        item.renovation_needed_details ||
        null,
      queue_item_is_renovation: Boolean(item.renovation_needed),
      notes: item.notes,
    },
  ]);

  if (error) {
    console.warn("Unit history append skipped:", error.message);
  }
}
