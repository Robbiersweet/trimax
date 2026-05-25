"use client";

import { supabase } from "./supabase";

export type WorkspaceAccess = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  role: string;
};

type BusinessUserRow = {
  role: string | null;
  business_id: string | null;
  businesses:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | {
        id: string;
        name: string;
        slug: string;
      }[]
    | null;
};

function normalizeBusiness(
  row: BusinessUserRow
) {
  if (Array.isArray(row.businesses)) {
    return row.businesses[0] ?? null;
  }

  return row.businesses;
}

export async function loadWorkspaceAccess() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return [];
  }

  const userEmail = user.email?.toLowerCase();

  const { data, error } = await supabase
    .from("business_users")
    .select(
      `
        role,
        business_id,
        businesses (
          id,
          name,
          slug
        )
      `
    )
    .or(
      userEmail
        ? `user_id.eq.${user.id},email.ilike.${userEmail}`
        : `user_id.eq.${user.id}`
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.warn(
      "Workspace access table is not ready yet.",
      error
    );

    return [];
  }

  return ((data ?? []) as BusinessUserRow[])
    .map((row) => {
      const business = normalizeBusiness(row);

      if (!business?.id || !business.slug) {
        return null;
      }

      return {
        businessId: business.id,
        businessName: business.name,
        businessSlug: business.slug,
        role: row.role ?? "member",
      };
    })
    .filter(
      (item): item is WorkspaceAccess =>
        Boolean(item)
    );
}

export function preferredWorkspaceSlug(
  access: WorkspaceAccess[]
) {
  return (
    access.find(
      (workspace) =>
        workspace.businessSlug === "rnl-creations"
    )?.businessSlug ??
    access[0]?.businessSlug ??
    "rnl-creations"
  );
}

export function canAccessWorkspace(
  access: WorkspaceAccess[],
  businessSlug: string | null
) {
  if (access.length === 0) {
    return true;
  }

  if (!businessSlug) {
    return true;
  }

  return access.some(
    (workspace) =>
      workspace.businessSlug === businessSlug
  );
}
