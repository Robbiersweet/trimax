"use client";

import { useEffect, useState } from "react";
import {
  WorkspaceRole,
  normalizeWorkspaceRole,
} from "../lib/rolePermissions";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";

type RoleVisibleProps = {
  businessSlug: string;
  allow: WorkspaceRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function RoleVisible({
  businessSlug,
  allow,
  children,
  fallback = null,
}: RoleVisibleProps) {
  const [role, setRole] =
    useState<WorkspaceRole | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRole() {
      const access = await loadWorkspaceAccess();
      const workspace = access.find(
        (item) =>
          item.businessSlug === businessSlug
      );

      if (!isMounted) {
        return;
      }

      setRole(
        normalizeWorkspaceRole(
          workspace?.role ?? "owner"
        )
      );
    }

    loadRole();

    return () => {
      isMounted = false;
    };
  }, [businessSlug]);

  if (!role) {
    return null;
  }

  if (!allow.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

