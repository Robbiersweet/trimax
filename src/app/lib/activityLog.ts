import { supabase } from "./supabase";

type ActivityLogInput = {
  businessId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, unknown>;
};

function cleanDetails(details: Record<string, unknown> | undefined) {
  if (!details) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(details).filter((entry) => entry[1] !== undefined)
  );
}

export async function logActivity(input: ActivityLogInput) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("activity_logs").insert({
      business_id: input.businessId ?? null,
      actor_user_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      details: cleanDetails(input.details),
    });

    if (error) {
      console.warn("Activity log skipped:", error.message);
    }
  } catch (error) {
    console.warn("Activity log skipped:", error);
  }
}
