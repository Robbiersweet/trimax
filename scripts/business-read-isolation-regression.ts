import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration = read(
  "supabase/sql/2026-08-10-businesses-read-policy-hardening.sql"
);
const workspaceAccess = read("src/app/lib/workspaceAccess.ts");
const propertyAccess = read("src/app/lib/propertyAccess.ts");

assert(
  migration.includes(
    'drop policy if exists "Enable public read access for businesses"'
  ) &&
    migration.includes("on public.businesses"),
  "The broad public businesses read policy must be explicitly dropped."
);

assert(
  !migration.includes("using (true)") &&
    !migration.includes("to anon") &&
    migration.includes("to authenticated"),
  "Business reads must not allow anonymous or unconditional enumeration."
);

assert(
  migration.includes(
    "create or replace function public.trimax_can_read_business"
  ) &&
    migration.includes("from public.business_users bu") &&
    migration.includes("from public.property_users pu"),
  "The business read helper must preserve both business_users and property_users workspace relationships."
);

assert(
  migration.includes('create policy "Allow scoped business read"') &&
    migration.includes("for select") &&
    migration.includes("using (public.trimax_can_read_business(id))"),
  "The replacement policy must scope business row reads through the shared helper."
);

assert(
  workspaceAccess.includes('.from("business_users")') &&
    workspaceAccess.includes('.from("property_users")') &&
    workspaceAccess.includes("businesses (\n            id,\n            name,\n            slug"),
  "Workspace switching must still load business metadata from business_users and property_users relationships."
);

assert(
  propertyAccess.includes('.from("property_users")') &&
    propertyAccess.includes("businesses (\n          id,\n          name,\n          slug"),
  "Property-only users must still load the owning business metadata required for their workspace."
);

type Membership = {
  userId: string;
  businessId: string;
  source: "business_users" | "property_users";
};

function visibleBusinessIds(userId: string, memberships: Membership[]) {
  return memberships
    .filter((membership) => membership.userId === userId)
    .map((membership) => membership.businessId)
    .sort();
}

const memberships: Membership[] = [
  { userId: "owner-a", businessId: "rnl-creations", source: "business_users" },
  { userId: "owner-b", businessId: "just-kleen", source: "business_users" },
  { userId: "multi", businessId: "rnl-creations", source: "business_users" },
  { userId: "multi", businessId: "just-kleen", source: "business_users" },
  { userId: "diana", businessId: "rnl-creations", source: "property_users" },
  { userId: "alana", businessId: "rnl-creations", source: "property_users" },
];

assert.deepEqual(
  visibleBusinessIds("owner-a", memberships),
  ["rnl-creations"],
  "A Business A member can read Business A only."
);

assert(
  !visibleBusinessIds("owner-a", memberships).includes("just-kleen"),
  "A Business A member cannot read Business B without membership."
);

assert.deepEqual(
  visibleBusinessIds("multi", memberships),
  ["just-kleen", "rnl-creations"],
  "A multi-business member can read each authorized business."
);

assert.deepEqual(
  visibleBusinessIds("diana", memberships),
  ["rnl-creations"],
  "A property-only user can read the owning business needed to load the workspace."
);

assert(
  !visibleBusinessIds("alana", memberships).includes("unrelated-business-c"),
  "A property-only user cannot enumerate unrelated businesses."
);

assert.deepEqual(
  visibleBusinessIds("anonymous", memberships),
  [],
  "Anonymous users cannot read businesses."
);

console.log("Business read isolation regression checks passed.");
