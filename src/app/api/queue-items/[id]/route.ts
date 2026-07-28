import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeWorkspaceRole } from "../../../lib/rolePermissions";

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type Database = {
  public: {
    Tables: {
      business_users: GenericTable;
      property_users: GenericTable;
      queue_items: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

type QueueItemRow = {
  id: string;
  business_id: string;
  property: string | null;
  status: string | null;
  priority: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  projected_completion_date: string | null;
  progress_stage: string | null;
  percent_complete: number | null;
  delay_reason: string | null;
};

type BusinessUserRow = {
  role: string | null;
};

type PropertyUserRow = {
  property_name: string | null;
  can_update_queue_items: boolean | null;
};

const allowedQueueUpdateFields = new Set([
  "property",
  "unit",
  "status",
  "priority",
  "priority_order",
  "priority_updated_at",
  "priority_updated_by",
  "paint_type",
  "unit_layout",
  "wall_paint_color",
  "flooring",
  "smoked_in",
  "primer_requested",
  "prior_renovation",
  "prior_renovation_details",
  "renovation_needed",
  "renovation_needed_details",
  "move_out_date",
  "ready_date",
  "deadline_updated_at",
  "deadline_updated_by",
  "scheduled_date",
  "completed_date",
  "projected_completion_date",
  "progress_stage",
  "percent_complete",
  "delay_reason",
  "manager_update",
  "manager_update_at",
  "manager_update_by",
  "notes",
]);

const ownerOnlyFields = new Set([
  "status",
  "priority",
  "scheduled_date",
  "completed_date",
  "projected_completion_date",
  "progress_stage",
  "percent_complete",
  "delay_reason",
]);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
}

function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanUpdates(updates: unknown) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(updates as Record<string, unknown>).filter(([key]) =>
      allowedQueueUpdateFields.has(key)
    )
  );
}

async function loadRole({
  supabase,
  token,
  businessId,
  originalProperty,
  nextProperty,
}: {
  supabase: AdminClient;
  token: string | null;
  businessId: string;
  originalProperty: string | null;
  nextProperty: string | null;
}) {
  if (!token) {
    return { ok: false, role: null, userId: null, email: null };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false, role: null, userId: null, email: null };
  }

  const userEmail = userData.user.email?.toLowerCase() ?? "";
  const { data: businessUser } = await supabase
    .from("business_users")
    .select("role")
    .eq("business_id", businessId)
    .or(`user_id.eq.${userData.user.id},email.ilike.${userEmail}`)
    .limit(1)
    .maybeSingle<BusinessUserRow>();
  const workspaceRole = normalizeWorkspaceRole(businessUser?.role);

  if (workspaceRole === "owner" || workspaceRole === "admin") {
    return {
      ok: true,
      role: workspaceRole,
      userId: userData.user.id,
      email: userData.user.email ?? null,
    };
  }

  const { data: propertyUsers } = await supabase
    .from("property_users")
    .select("property_name, can_update_queue_items")
    .eq("business_id", businessId)
    .or(`user_id.eq.${userData.user.id},email.ilike.${userEmail}`)
    .returns<PropertyUserRow[]>();
  const originalPropertyKey = propertyKey(originalProperty);
  const nextPropertyKey = propertyKey(nextProperty);
  const canUpdateProperty = (propertyUsers ?? []).some((row) => {
    if (row.can_update_queue_items === false) {
      return false;
    }

    const allowedPropertyKey = propertyKey(row.property_name);

    return (
      allowedPropertyKey === originalPropertyKey &&
      allowedPropertyKey === nextPropertyKey
    );
  });

  return {
    ok: canUpdateProperty,
    role: canUpdateProperty ? "property_manager" : workspaceRole,
    userId: userData.user.id,
    email: userData.user.email ?? null,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Queue editing is not configured." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    businessId?: string;
    updates?: unknown;
  };
  const businessId = String(body.businessId ?? "").trim();
  const updates = cleanUpdates(body.updates);

  if (!id || !businessId || !updates) {
    return NextResponse.json(
      { error: "Queue item update is missing required data." },
      { status: 400 }
    );
  }

  const { data: queueItem, error: queueItemError } = await supabase
    .from("queue_items")
    .select(
      "id, business_id, property, status, priority, scheduled_date, completed_date, projected_completion_date, progress_stage, percent_complete, delay_reason"
    )
    .eq("id", id)
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle<QueueItemRow>();

  if (queueItemError || !queueItem) {
    return NextResponse.json(
      { error: "Queue item was not found." },
      { status: 404 }
    );
  }

  const auth = await loadRole({
    supabase,
    token: bearerToken(request),
    businessId,
    originalProperty: queueItem.property,
    nextProperty:
      typeof updates.property === "string" ? updates.property : queueItem.property,
  });

  if (!auth.ok) {
    return NextResponse.json(
      { error: "You are not allowed to edit this queue item." },
      { status: 403 }
    );
  }

  const updatePayload: Record<string, unknown> = { ...updates };

  if (auth.role !== "owner" && auth.role !== "admin") {
    for (const field of ownerOnlyFields) {
      delete updatePayload[field];
    }
  }

  let { error } = await supabase
    .from("queue_items")
    .update(updatePayload)
    .eq("id", id)
    .eq("business_id", businessId);

  if (
    error?.message?.includes("primer_requested") ||
    error?.message?.includes("unit_layout") ||
    error?.message?.includes("wall_paint_color") ||
    error?.message?.includes("priority_order") ||
    error?.message?.includes("priority_updated_at") ||
    error?.message?.includes("priority_updated_by") ||
    error?.message?.includes("deadline_updated_at") ||
    error?.message?.includes("deadline_updated_by") ||
    error?.message?.includes("projected_completion_date") ||
    error?.message?.includes("progress_stage") ||
    error?.message?.includes("percent_complete") ||
    error?.message?.includes("delay_reason") ||
    error?.message?.includes("manager_update")
  ) {
    const legacyUpdatePayload: Record<string, unknown> = {
      ...updatePayload,
    };
    delete legacyUpdatePayload.primer_requested;
    delete legacyUpdatePayload.unit_layout;
    delete legacyUpdatePayload.wall_paint_color;
    delete legacyUpdatePayload.priority_order;
    delete legacyUpdatePayload.priority_updated_at;
    delete legacyUpdatePayload.priority_updated_by;
    delete legacyUpdatePayload.deadline_updated_at;
    delete legacyUpdatePayload.deadline_updated_by;
    delete legacyUpdatePayload.projected_completion_date;
    delete legacyUpdatePayload.progress_stage;
    delete legacyUpdatePayload.percent_complete;
    delete legacyUpdatePayload.delay_reason;
    delete legacyUpdatePayload.manager_update;
    delete legacyUpdatePayload.manager_update_at;
    delete legacyUpdatePayload.manager_update_by;

    const retry = await supabase
      .from("queue_items")
      .update(legacyUpdatePayload)
      .eq("id", id)
      .eq("business_id", businessId);

    error = retry.error;
  }

  if (error) {
    console.error("Queue item update failed:", error);

    return NextResponse.json(
      { error: "Unable to update queue item." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    role: auth.role,
  });
}
