"use client";

import { supabase } from "./supabase";

export type PropertyAccess = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  propertyName: string;
  propertyKey: string;
  role: string;
  canCreateQueueItems: boolean;
  canUpdateQueueItems: boolean;
  canViewReports: boolean;
};

type PropertyUserRow = {
  id: string;
  role: string | null;
  property_name: string;
  can_create_queue_items: boolean | null;
  can_update_queue_items: boolean | null;
  can_view_reports: boolean | null;
  business_id: string | null;
  user_id: string | null;
  email: string | null;
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

function normalizeBusiness(row: PropertyUserRow) {
  if (Array.isArray(row.businesses)) {
    return row.businesses[0] ?? null;
  }

  return row.businesses;
}

export function propertyKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function loadPropertyAccess() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return [];
  }

  const userEmail = user.email?.toLowerCase();

  const { data, error } = await supabase
    .from("property_users")
    .select(
      `
        id,
        role,
        property_name,
        can_create_queue_items,
        can_update_queue_items,
        can_view_reports,
        business_id,
        user_id,
        email,
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
      "Property access table is not ready yet.",
      error
    );

    return [];
  }

  const rows = (data ?? []) as PropertyUserRow[];
  const pendingRows = rows.filter(
    (row) =>
      !row.user_id &&
      row.email?.toLowerCase() === userEmail
  );

  if (pendingRows.length > 0) {
    await Promise.all(
      pendingRows.map((row) =>
        supabase
          .from("property_users")
          .update({
            user_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
      )
    );
  }

  return rows
    .map((row) => {
      const business = normalizeBusiness(row);

      if (!business?.id || !business.slug || !row.property_name) {
        return null;
      }

      return {
        businessId: business.id,
        businessName: business.name,
        businessSlug: business.slug,
        propertyName: row.property_name,
        propertyKey: propertyKey(row.property_name),
        role: row.role ?? "property_team",
        canCreateQueueItems: row.can_create_queue_items ?? true,
        canUpdateQueueItems: row.can_update_queue_items ?? true,
        canViewReports: row.can_view_reports ?? true,
      };
    })
    .filter(
      (item): item is PropertyAccess =>
        Boolean(item)
    );
}

export function allowedPropertiesForBusiness(
  access: PropertyAccess[],
  businessSlug: string
) {
  return access.filter(
    (item) => item.businessSlug === businessSlug
  );
}

export function canAccessProperty(
  access: PropertyAccess[],
  businessSlug: string,
  requestedProperty: string | null
) {
  const allowed = allowedPropertiesForBusiness(access, businessSlug);

  if (allowed.length === 0) {
    return true;
  }

  if (!requestedProperty || requestedProperty === "all") {
    return false;
  }

  return allowed.some(
    (item) => item.propertyKey === requestedProperty
  );
}

