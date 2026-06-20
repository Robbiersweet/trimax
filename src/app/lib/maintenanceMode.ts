import { normalizeWorkspaceRole } from "./rolePermissions";
import { supabase } from "./supabase";
import { loadWorkspaceAccess } from "./workspaceAccess";

export type MaintenanceSettings = {
  enabled: boolean;
  message: string;
};

const DEFAULT_MAINTENANCE_MESSAGE =
  "Trimax is being updated. Please save your work and check back in a few minutes.";

type AppSettingRow = {
  key: string;
  value: unknown;
};

function settingText(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

function settingBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "enabled" in value &&
    typeof value.enabled === "boolean"
  ) {
    return value.enabled;
  }

  return false;
}

export function defaultMaintenanceSettings(): MaintenanceSettings {
  return {
    enabled: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
  };
}

export async function loadMaintenanceSettings(): Promise<MaintenanceSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["maintenance_mode", "maintenance_message"]);

  if (error) {
    console.warn("Maintenance settings are not ready yet.", error.message);
    return defaultMaintenanceSettings();
  }

  const rows = (data ?? []) as AppSettingRow[];
  const mode = rows.find((row) => row.key === "maintenance_mode");
  const message = rows.find((row) => row.key === "maintenance_message");

  return {
    enabled: settingBoolean(mode?.value),
    message: settingText(message?.value, DEFAULT_MAINTENANCE_MESSAGE),
  };
}

export async function canBypassMaintenance(businessSlug?: string | null) {
  const access = await loadWorkspaceAccess();
  const matchingWorkspace = businessSlug
    ? access.find((workspace) => workspace.businessSlug === businessSlug)
    : access[0];
  const role = normalizeWorkspaceRole(matchingWorkspace?.role ?? "technician");

  return role === "owner" || role === "admin";
}

export async function assertCanWriteDuringMaintenance(
  businessSlug?: string | null
) {
  const settings = await loadMaintenanceSettings();

  if (!settings.enabled) {
    return;
  }

  if (await canBypassMaintenance(businessSlug)) {
    return;
  }

  throw new Error(
    settings.message ||
      "Trimax is being updated. Please save your work and check back in a few minutes."
  );
}
