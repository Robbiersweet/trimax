"use client";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "accountant"
  | "property_manager"
  | "member";

export type NavPermissionKey =
  | "dashboard"
  | "queue"
  | "estimates"
  | "invoices"
  | "clients"
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

const rolePermissions: Record<
  WorkspaceRole,
  {
    nav: NavPermissionKey[];
    actions: DashboardActionKey[];
  }
> = {
  owner: {
    nav: [
      "dashboard",
      "queue",
      "estimates",
      "invoices",
      "clients",
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
  },
  admin: {
    nav: [
      "dashboard",
      "queue",
      "estimates",
      "invoices",
      "clients",
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
  },
  accountant: {
    nav: [
      "dashboard",
      "estimates",
      "invoices",
      "clients",
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
  },
  property_manager: {
    nav: ["dashboard", "queue", "reports"],
    actions: ["new_queue", "review_queue", "reports"],
  },
  member: {
    nav: ["dashboard"],
    actions: [],
  },
};

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
    normalized === "member"
  ) {
    return normalized;
  }

  return "member";
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

export function navPermissionForPath(
  pathname: string
): NavPermissionKey {
  if (pathname.startsWith("/queue")) {
    return "queue";
  }

  if (pathname.startsWith("/new-request")) {
    return "queue";
  }

  if (pathname.startsWith("/estimates")) {
    return "estimates";
  }

  if (pathname.startsWith("/invoices")) {
    return "invoices";
  }

  if (pathname.startsWith("/clients")) {
    return "clients";
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
