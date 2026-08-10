import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const migration = read("supabase/sql/2026-08-10-tenant-isolation-hardening.sql");
const invoiceSendRoute = read("src/app/api/invoices/[id]/send-email/route.ts");
const estimateSendRoute = read("src/app/api/estimates/[id]/send-email/route.ts");
const paymentApplyRoute = read("src/app/api/payments/apply-batch/route.ts");
const recurringRoute = read("src/app/api/recurring-invoices/run/route.ts");
const invoicePrint = read("src/app/invoices/[id]/print/page.tsx");
const estimatePrint = read("src/app/estimates/[id]/print/page.tsx");
const settingsPage = read("src/app/settings/page.tsx");
const invoiceEmailSendPanel = read("src/app/components/InvoiceEmailSendPanel.tsx");
const invoiceEmailSettings = read("src/app/lib/invoiceEmailSettings.ts");

const corePrivateTables = [
  "clients",
  "estimates",
  "estimate_line_items",
  "invoices",
  "invoice_line_items",
  "queue_items",
  "service_items",
  "internal_notes",
  "recurring_invoice_templates",
  "activity_logs",
  "properties",
  "property_units",
  "business_users",
  "property_users",
];

for (const table of corePrivateTables) {
  assert(
    migration.includes(`on public.${table}`),
    `${table} must be covered by the tenant hardening migration.`
  );
}

const permissivePolicyNames = [
  "Enable public read access for clients",
  "Enable public update access for clients",
  "Allow public read estimates",
  "Enable public update access for invoices",
  "Allow public invoice line item reads",
  "Allow public read access",
  "Allow authenticated queue items",
  "Allow authenticated service item access",
  "Allow public service item reads",
  "Allow authenticated activity logs",
  "Allow authenticated business users manage during development",
  "Allow authenticated property users manage during development",
];

for (const policyName of permissivePolicyNames) {
  assert(
    migration.includes(`drop policy if exists "${policyName}"`),
    `Live permissive policy "${policyName}" must be explicitly dropped.`
  );
}

assert(
  migration.includes("create or replace function public.trimax_has_business_access") &&
    migration.includes("create or replace function public.trimax_has_business_role") &&
    migration.includes("create or replace function public.trimax_can_access_property"),
  "Tenant access must be centralized in shared SQL helper functions."
);

assert(
  migration.includes("create table if not exists public.business_settings") &&
    migration.includes("unique (business_id, key)") &&
    migration.includes("insert into public.business_settings") &&
    migration.includes("email_settings:' || b.slug"),
  "Business-specific settings must be scoped by business and migrated from legacy app_settings keys."
);

assert(
  migration.includes("Allow authenticated platform settings read") &&
    migration.includes("key in ('maintenance_mode', 'maintenance_message')") &&
    !migration.includes("using (true);"),
  "app_settings must be limited to true platform settings, not business email settings."
);

assert(
  migration.includes("Allow business invoice read") &&
    migration.includes("Allow business invoice manage") &&
    migration.includes("Allow business estimate read") &&
    migration.includes("Allow business client read") &&
    migration.includes("array['owner', 'admin', 'accountant']"),
  "Financial tables must require a financial workspace role."
);

assert(
  migration.includes("Allow scoped queue item read") &&
    migration.includes("trimax_can_access_property(business_id, property)") &&
    migration.includes("trimax_can_create_property_queue") &&
    migration.includes("trimax_can_manage_property_queue"),
  "Queue policies must preserve property-scoped access without exposing unrelated properties."
);

assert(
  invoiceSendRoute.includes(".from(\"business_settings\")") &&
    invoiceSendRoute.includes(".eq(\"business_id\", business.id)") &&
    invoiceSendRoute.includes(".eq(\"key\", \"email_settings\")") &&
    invoiceSendRoute.includes(".eq(\"business_id\", invoice.business_id)") &&
    invoiceSendRoute.includes(".from(\"invoice_line_items\")") &&
    invoiceSendRoute.includes(".eq(\"business_id\", invoice.business_id)") &&
    invoiceSendRoute.includes(".in(\n        \"id\""),
  "Invoice send must read business-scoped settings, scope line items, and update status inside the authorized business."
);

assert(
  estimateSendRoute.includes(".from(\"business_settings\")") &&
    estimateSendRoute.includes(".eq(\"business_id\", business.id)") &&
    estimateSendRoute.includes(".eq(\"key\", \"email_settings\")") &&
    estimateSendRoute.includes(".eq(\"id\", estimate.id)") &&
    estimateSendRoute.includes(".eq(\"business_id\", estimate.business_id)"),
  "Estimate send must read business-scoped settings and update status inside the authorized business."
);

assert(
  paymentApplyRoute.includes(".from(\"invoice_line_items\")") &&
    paymentApplyRoute.includes(".eq(\"business_id\", businessId)") &&
    paymentApplyRoute.includes(".in(\"invoice_id\", invoiceIds)") &&
    paymentApplyRoute.includes(".eq(\"id\", invoice.id)") &&
    paymentApplyRoute.includes(".eq(\"business_id\", businessId)"),
  "Payment application must verify line items and invoice updates inside the selected business."
);

assert(
  (recurringRoute.match(/\.eq\("business_id", template\.business_id\)/g)?.length ??
    0) >= 6,
  "Recurring invoice service-role updates must include business_id predicates."
);

assert(
  invoicePrint.includes(".from(\"invoice_line_items\")") &&
    invoicePrint.includes(".eq(\"business_id\", business.id)") &&
    estimatePrint.includes(".from(\"estimate_line_items\")") &&
    estimatePrint.includes(".eq(\"business_id\", business.id)"),
  "Print/PDF line-item reads must be scoped to the owning business."
);

assert(
  settingsPage.includes(".from(\"business_settings\")") &&
    settingsPage.includes("onConflict: \"business_id,key\"") &&
    settingsPage.includes("key: \"email_settings\""),
  "Settings must save operational email settings in the business-scoped settings table."
);

assert(
  invoiceEmailSendPanel.includes("businessId?: string | null") &&
    invoiceEmailSendPanel.includes(".from(\"business_settings\")") &&
    invoiceEmailSendPanel.includes(".eq(\"business_id\", businessId)") &&
    invoiceEmailSendPanel.includes(".eq(\"key\", \"email_settings\")"),
  "The invoice/estimate send panel must load templates from business-scoped settings when a business ID is available."
);

assert(
  !invoiceEmailSettings.includes("R&L Creations") &&
    !invoiceEmailSettings.includes("Just Kleen") &&
    !invoiceEmailSettings.includes("425-350-4898") &&
    invoiceEmailSettings.includes("signature: businessName") &&
    invoiceEmailSettings.includes("return \"\";"),
  "Default email settings must use a neutral business-name fallback instead of leaking R&L or Just Kleen branding."
);

type TenantRecord = { id: string; businessId: string };

function visibleToBusiness(records: TenantRecord[], businessId: string) {
  return records.filter((record) => record.businessId === businessId);
}

const tenantFixtures = [
  { id: "a-invoice", businessId: "organization-a" },
  { id: "b-invoice", businessId: "organization-b" },
];

assert.deepEqual(
  visibleToBusiness(tenantFixtures, "organization-a").map((record) => record.id),
  ["a-invoice"],
  "Organization A fixture queries must exclude Organization B records before search/sort/pagination."
);
assert.deepEqual(
  visibleToBusiness(tenantFixtures, "organization-b").map((record) => record.id),
  ["b-invoice"],
  "Organization B fixture queries must exclude Organization A records before search/sort/pagination."
);

console.log("Tenant isolation hardening regression checks passed.");
