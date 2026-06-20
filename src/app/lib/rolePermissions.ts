export type WorkspaceRole =
  | "owner"
  | "admin"
  | "accountant"
  | "property_manager"
  | "technician"
  | "vendor"
  | "subcontractor"
  | "cleaner"
  | "flooring_contractor";

export type NavPermissionKey =
  | "dashboard"
  | "queue"
  | "technician"
  | "property_sales"
  | "job_sessions"
  | "schedule"
  | "estimates"
  | "invoices"
  | "payments"
  | "clients"
  | "imports"
  | "services"
  | "reports"
  | "activity"
  | "settings";

export type DashboardActionKey =
  | "new_queue"
  | "new_estimate"
  | "new_invoice"
  | "record_payment"
  | "review_queue"
  | "reports"
  | "print_documents";

export type WorkPermissionKey =
  | "view_assigned_jobs"
  | "view_assigned_queue_items"
  | "start_job_session"
  | "pause_job_session"
  | "stop_job_session"
  | "add_work_notes"
  | "upload_job_photos"
  | "update_job_status"
  | "view_own_sessions"
  | "view_basic_property_info"
  | "view_all_job_sessions";

const fieldWorkPermissions: WorkPermissionKey[] = [
  "view_assigned_jobs",
  "view_assigned_queue_items",
  "start_job_session",
  "pause_job_session",
  "stop_job_session",
  "add_work_notes",
  "upload_job_photos",
  "update_job_status",
  "view_own_sessions",
  "view_basic_property_info",
];

const adminWorkPermissions: WorkPermissionKey[] = [
  ...fieldWorkPermissions,
  "view_all_job_sessions",
];

const rolePermissions: Record<
  WorkspaceRole,
  {
    nav: NavPermissionKey[];
    actions: DashboardActionKey[];
    work: WorkPermissionKey[];
  }
> = {
  owner: {
    nav: [
      "dashboard",
      "queue",
      "technician",
      "property_sales",
      "job_sessions",
      "schedule",
      "estimates",
      "invoices",
      "payments",
      "clients",
      "imports",
      "services",
      "reports",
      "activity",
      "settings",
    ],
    actions: [
      "new_queue",
      "new_estimate",
      "new_invoice",
      "record_payment",
      "review_queue",
      "reports",
      "print_documents",
    ],
    work: adminWorkPermissions,
  },
  admin: {
    nav: [
      "dashboard",
      "queue",
      "technician",
      "property_sales",
      "job_sessions",
      "schedule",
      "estimates",
      "invoices",
      "payments",
      "clients",
      "imports",
      "services",
      "reports",
      "activity",
      "settings",
    ],
    actions: [
      "new_queue",
      "new_estimate",
      "new_invoice",
      "record_payment",
      "review_queue",
      "reports",
      "print_documents",
    ],
    work: adminWorkPermissions,
  },
  accountant: {
    nav: [
      "dashboard",
      "property_sales",
      "estimates",
      "invoices",
      "payments",
      "clients",
      "imports",
      "reports",
      "activity",
    ],
    actions: [
      "new_estimate",
      "new_invoice",
      "record_payment",
      "reports",
      "print_documents",
    ],
    work: [],
  },
  property_manager: {
    nav: ["dashboard", "queue", "property_sales", "schedule", "reports"],
    actions: ["new_queue", "review_queue", "reports"],
    work: ["view_assigned_queue_items", "view_basic_property_info"],
  },
  technician: {
    nav: ["technician", "queue"],
    actions: ["review_queue"],
    work: fieldWorkPermissions,
  },
  vendor: {
    nav: ["technician", "queue"],
    actions: ["review_queue"],
    work: fieldWorkPermissions,
  },
  subcontractor: {
    nav: ["technician", "queue"],
    actions: ["review_queue"],
    work: fieldWorkPermissions,
  },
  cleaner: {
    nav: ["technician", "queue"],
    actions: ["review_queue"],
    work: fieldWorkPermissions,
  },
  flooring_contractor: {
    nav: ["technician", "queue"],
    actions: ["review_queue"],
    work: fieldWorkPermissions,
  },
};

export const fieldWorkerRoles: WorkspaceRole[] = [
  "owner",
  "admin",
  "technician",
  "vendor",
  "subcontractor",
  "cleaner",
  "flooring_contractor",
];

export function normalizeWorkspaceRole(
  role: string | null | undefined
): WorkspaceRole {
  const normalized = (role || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");

  if (
    normalized === "owner" ||
    normalized === "admin" ||
    normalized === "accountant" ||
    normalized === "property_manager" ||
    normalized === "technician" ||
    normalized === "vendor" ||
    normalized === "subcontractor" ||
    normalized === "cleaner" ||
    normalized === "flooring_contractor"
  ) {
    return normalized;
  }

  if (normalized === "member" || normalized === "tech") {
    return "technician";
  }

  if (
    normalized === "assistant_manager" ||
    normalized === "maintenance_manager" ||
    normalized === "property_team" ||
    normalized === "property_staff" ||
    normalized === "manager"
  ) {
    return "property_manager";
  }

  return "technician";
}

export function canAccessNavItem(
  role: string | null | undefined,
  key: NavPermissionKey
) {
  return rolePermissions[
    normalizeWorkspaceRole(role)
  ].nav.includes(key);
}

export function canUseDashboardAction(
  role: string | null | undefined,
  key: DashboardActionKey
) {
  return rolePermissions[
    normalizeWorkspaceRole(role)
  ].actions.includes(key);
}

export function canUseWorkPermission(
  role: string | null | undefined,
  key: WorkPermissionKey
) {
  return rolePermissions[
    normalizeWorkspaceRole(role)
  ].work.includes(key);
}

export function navPermissionForPath(
  pathname: string
): NavPermissionKey {
  if (pathname.startsWith("/queue")) {
    return "queue";
  }

  if (pathname.startsWith("/technician")) {
    return "technician";
  }

  if (pathname.startsWith("/job-sessions")) {
    return "job_sessions";
  }

  if (pathname.startsWith("/property-sales")) {
    return "property_sales";
  }

  if (pathname.startsWith("/new-request")) {
    return "queue";
  }

  if (pathname.startsWith("/schedule")) {
    return "schedule";
  }

  if (pathname.startsWith("/estimates")) {
    return "estimates";
  }

  if (pathname.startsWith("/invoices")) {
    return "invoices";
  }

  if (pathname.startsWith("/payments")) {
    return "payments";
  }

  if (pathname.startsWith("/clients")) {
    return "clients";
  }

  if (pathname.startsWith("/imports")) {
    return "imports";
  }

  if (pathname.startsWith("/services")) {
    return "services";
  }

  if (pathname.startsWith("/reports")) {
    return "reports";
  }

  if (pathname.startsWith("/activity")) {
    return "activity";
  }

  if (pathname.startsWith("/settings")) {
    return "settings";
  }

  return "dashboard";
}

export function canAccessPath(
  role: string | null | undefined,
  pathname: string
) {
  return canAccessNavItem(
    role,
    navPermissionForPath(pathname)
  );
}
