import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateDiscountedDocumentTotals,
  discountDisplayLabel,
  parseDiscountFromLineItem,
} from "../src/app/lib/documentDiscounts.ts";
import {
  detectClientIdentityConflict,
  findExactClientForProperty,
} from "../src/app/lib/clientIdentity.ts";
import {
  getClientSplitPolicy,
  getClientTaxSettings,
  hasClientTaxProfile,
  resolveServicePricing,
} from "../src/app/lib/propertyCommercialSettings.ts";
import { uniqueSavedServices } from "../src/app/lib/savedServicePresentation.ts";
import { getEffectiveTaxRate } from "../src/app/utils/tax.ts";

const root = process.cwd();
const estimateEdit = readFileSync(
  resolve(root, "src/app/estimates/[id]/edit/page.tsx"),
  "utf8"
);
const estimateNew = readFileSync(
  resolve(root, "src/app/estimates/new/page.tsx"),
  "utf8"
);
const estimateDetails = readFileSync(
  resolve(root, "src/app/estimates/[id]/page.tsx"),
  "utf8"
);
const invoiceDetails = readFileSync(
  resolve(root, "src/app/invoices/[id]/page.tsx"),
  "utf8"
);
const estimateSendEmailRoute = readFileSync(
  resolve(root, "src/app/api/estimates/[id]/send-email/route.ts"),
  "utf8"
);
const invoiceSendEmailRoute = readFileSync(
  resolve(root, "src/app/api/invoices/[id]/send-email/route.ts"),
  "utf8"
);
const clientEdit = readFileSync(
  resolve(root, "src/app/clients/[id]/edit/page.tsx"),
  "utf8"
);
const propertyCommercialSettingsMigration = readFileSync(
  resolve(root, "supabase/sql/2026-09-14-property-commercial-settings.sql"),
  "utf8"
);
const invoiceEdit = readFileSync(
  resolve(root, "src/app/invoices/[id]/edit/page.tsx"),
  "utf8"
);
const estimatePrint = readFileSync(
  resolve(root, "src/app/estimates/[id]/print/page.tsx"),
  "utf8"
);
const invoicePrint = readFileSync(
  resolve(root, "src/app/invoices/[id]/print/page.tsx"),
  "utf8"
);
const converter = readFileSync(
  resolve(root, "src/app/components/ConvertEstimateToInvoiceButton.tsx"),
  "utf8"
);
const splitInvoices = readFileSync(
  resolve(root, "src/app/lib/splitInvoices.ts"),
  "utf8"
);
const captureServices = readFileSync(
  resolve(root, "src/app/lib/captureServicesFromLineItems.ts"),
  "utf8"
);

assert.deepEqual(
  calculateDiscountedDocumentTotals({
    lineSubtotal: 1000,
    taxRate: 10,
    discount: {
      enabled: true,
      type: "fixed",
      value: 100,
      label: "Courtesy",
    },
  }),
  {
    lineSubtotal: 1000,
    discountAmount: 100,
    taxableSubtotal: 900,
    taxAmount: 90,
    total: 990,
  },
  "Fixed discounts must apply before tax."
);

assert.deepEqual(
  calculateDiscountedDocumentTotals({
    lineSubtotal: 1000,
    taxRate: 10,
    discount: {
      enabled: true,
      type: "percentage",
      value: 10,
      label: "Volume",
    },
  }),
  {
    lineSubtotal: 1000,
    discountAmount: 100,
    taxableSubtotal: 900,
    taxAmount: 90,
    total: 990,
  },
  "Percentage discounts must apply before tax."
);

assert.equal(
  calculateDiscountedDocumentTotals({
    lineSubtotal: 50,
    taxRate: 10,
    discount: {
      enabled: true,
      type: "fixed",
      value: 500,
      label: "Credit",
    },
  }).total,
  0,
  "Discounts must not accidentally create negative totals."
);

assert.equal(
  discountDisplayLabel({
    enabled: true,
    type: "percentage",
    value: 10,
    label: "Courtesy discount",
  }),
  "Discount - Courtesy discount (10%)",
  "Discount line labels must be customer-readable."
);

assert.deepEqual(
  parseDiscountFromLineItem({
    description: "Discount - Courtesy discount (10%)",
    lineTotal: -150,
    unitPrice: -150,
  }),
  {
    enabled: true,
    type: "percentage",
    value: "10",
    label: "Courtesy discount",
  },
  "Saved discount lines must reopen in the discount editor."
);

assert(
  estimateEdit.includes("Discount") &&
    estimateEdit.includes("Applied before tax") &&
    estimateEdit.includes("discountDisplayLabel") &&
    estimateEdit.includes("calculateDiscountedDocumentTotals") &&
    estimateEdit.includes("documentTotals.taxableSubtotal"),
  "Estimate editor must expose and save a first-class discount control."
);

assert(
  invoiceEdit.includes("Discount") &&
    invoiceEdit.includes("Applied before tax") &&
    invoiceEdit.includes("discountDisplayLabel") &&
    invoiceEdit.includes("Sent invoices cannot be edited directly") &&
    invoiceEdit.includes("documentTotals.taxableSubtotal"),
  "Draft invoice editor must expose discounts and block direct sent-invoice edits."
);

assert(
  converter.includes("estimateLineItems.map") &&
    converter.includes("invoiceLineItems") &&
    converter.includes("line_total: toNumber(item.line_total)") &&
    converter.includes("subtotalAmount: fallbackSubtotal"),
  "Estimate discount line items must carry into converted invoices and split calculations."
);

assert(
  estimatePrint.includes("lineItems") &&
    estimatePrint.includes("line_total") &&
    invoicePrint.includes("lineItems") &&
    invoicePrint.includes("line_total"),
  "Customer PDFs must continue rendering saved line items, including controlled discount rows."
);

assert(
  splitInvoices.includes("subtotalAmount") &&
    splitInvoices.includes("buildSplitInvoicePlan"),
  "Split invoices must continue using the final discounted subtotal passed by the editor/converter."
);

assert(
  captureServices.includes("Automatic line-item capture is disabled") &&
    !captureServices.includes(".from(\"service_items\")") &&
    !captureServices.includes(".insert("),
  "Queue/editor auto-populated line items must not create permanent Saved Services."
);

const uniqueServices = uniqueSavedServices([
  {
    id: "one",
    business_id: "b",
    name: "Renovation and Cabinet Paint",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 1099,
    category: "Auto Captured",
  },
  {
    id: "two",
    business_id: "b",
    name: " renovation & cabinet paint ",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 1099,
    category: "Auto Captured",
  },
  {
    id: "three",
    business_id: "b",
    name: "Full Repaint with Color Change",
    description: "Full Repaint with Color Change",
    default_quantity: 1,
    default_unit_price: 1399,
    category: "Painting",
  },
]);

assert.equal(uniqueServices.length, 2, "Exact duplicate services must collapse in picker presentation.");

const classicPaint = {
  id: "classic-paint",
  name: "Apartment Turns - Classic Paint",
  description: "full interior paint",
  default_unit_price: 875,
};
const northCreekPricing = resolveServicePricing({
  service: classicPaint,
  clientId: "north-creek",
  normalTierPrice: 1000,
  overrides: [
    {
      client_id: "north-creek",
      service_item_id: "classic-paint",
      unit_price: 1000,
      is_active: true,
    },
    {
      client_id: "the-glen",
      service_item_id: "classic-paint",
      unit_price: 1099,
      is_active: true,
    },
  ],
});
const glenPricing = resolveServicePricing({
  service: classicPaint,
  clientId: "the-glen",
  normalTierPrice: 1000,
  overrides: [
    {
      client_id: "north-creek",
      service_item_id: "classic-paint",
      unit_price: 1000,
      is_active: true,
    },
    {
      client_id: "the-glen",
      service_item_id: "classic-paint",
      unit_price: 1099,
      is_active: true,
    },
  ],
});
const fallbackPricing = resolveServicePricing({
  service: classicPaint,
  clientId: "other-property",
  normalTierPrice: null,
  overrides: [],
});

assert.equal(northCreekPricing.unitPrice, 1000, "North Creek can use its own override for a shared service.");
assert.equal(glenPricing.unitPrice, 1099, "The Glen can use a different override for the same shared service.");
assert.equal(fallbackPricing.unitPrice, 875, "Service pricing must fall back to the workspace default when no client override exists.");
assert.equal(
  resolveServicePricing({
    service: classicPaint,
    clientId: "the-glen",
    normalTierPrice: 1000,
    overrides: [
      {
        client_id: "the-glen",
        service_item_id: "classic-paint",
        unit_price: 1200,
        is_active: false,
      },
    ],
  }).unitPrice,
  1000,
  "Inactive overrides must not displace the saved-service tier/default price."
);

const sisterClients = [
  { id: "north-creek", name: "North Creek Apartments" },
  { id: "the-glen", name: "The Glenn At North Creek Apartments" },
  { id: "other", name: "Everett Landing Apartments" },
];

assert.equal(
  findExactClientForProperty(sisterClients, "The Glenn At North Creek Apartments")?.id,
  "the-glen",
  "An exact property/client name should select that exact client."
);
assert.equal(
  findExactClientForProperty(
    sisterClients.filter((client) => client.id !== "the-glen"),
    "The Glenn At North Creek Apartments"
  ),
  null,
  "A sister property must not fall back to North Creek by substring."
);
assert.equal(
  findExactClientForProperty(sisterClients, "North Creek Apartments")?.id,
  "north-creek",
  "Switching back to North Creek should still resolve North Creek exactly."
);
assert.deepEqual(
  detectClientIdentityConflict({
    clients: sisterClients,
    currentClientId: "north-creek",
    customerName: "North Creek Apartments",
    projectTitle: "The Glenn At North Creek Apartments - Unit C127",
  }),
  {
    hasConflict: true,
    message: "Customer and property do not match. Review before continuing.",
    matchedClientId: "the-glen",
    matchedClientName: "The Glenn At North Creek Apartments",
  },
  "A document linked to North Creek with a Glen project title must be blocked before send/convert."
);
assert.equal(
  detectClientIdentityConflict({
    clients: sisterClients,
    currentClientId: "the-glen",
    customerName: "The Glenn At North Creek Apartments",
    projectTitle: "The Glenn At North Creek Apartments - Unit C127",
  }).hasConflict,
  false,
  "A matching authoritative client and project title should remain sendable."
);

const taxableClient = {
  tax_mode: "taxable",
  tax_label: "Snohomish",
  tax_rate: "9.9",
  tax_number: "WA-1",
};
const nonTaxableClient = {
  tax_mode: "no_tax",
  tax_label: "Snohomish",
  tax_rate: "9.9",
  tax_number: "WA-1",
};
const taxableSettings = getClientTaxSettings(taxableClient);
const nonTaxableSettings = getClientTaxSettings(nonTaxableClient);

assert.equal(hasClientTaxProfile(taxableClient), true, "Saved client tax settings must be detectable.");
assert.equal(
  calculateDiscountedDocumentTotals({
    lineSubtotal: 1000,
    taxRate: getEffectiveTaxRate({
      taxMode: taxableSettings.taxMode,
      taxRate: taxableSettings.taxRate,
    }),
    discount: {
      enabled: false,
      type: "fixed",
      value: 0,
    },
  }).taxAmount,
  99,
  "A taxable client configured at 9.9% must calculate $99.00 on $1,000."
);
assert.equal(
  getEffectiveTaxRate({
    taxMode: nonTaxableSettings.taxMode,
    taxRate: nonTaxableSettings.taxRate,
  }),
  0,
  "Non-taxable client settings must calculate zero tax even when a stored rate exists."
);

assert.deepEqual(
  getClientSplitPolicy(
    {
      auto_split_enabled: true,
      split_target_amount: 1300,
    },
    1500
  ),
  {
    autoSplitEnabled: true,
    splitTargetAmount: 1300,
  },
  "Client split policy must override the workspace fallback."
);
assert.deepEqual(
  getClientSplitPolicy(
    {
      auto_split_enabled: false,
      split_target_amount: null,
    },
    1500
  ),
  {
    autoSplitEnabled: false,
    splitTargetAmount: 1500,
  },
  "Workspace split target remains only a fallback, not an auto-enable flag."
);

assert(
  estimateNew.includes("client_service_overrides") &&
    estimateNew.includes("resolveServicePricing") &&
    estimateNew.includes("getClientTaxSettings") &&
    estimateNew.includes("repriceSavedServiceLinesForClient") &&
    estimateNew.includes("setSplitWarningEnabled(splitPolicy.autoSplitEnabled)") &&
    estimateNew.includes("const effectiveSplitWarningEnabled = splitWarningEnabled") &&
    estimateNew.includes("findExactClientForProperty"),
  "New estimates must resolve client-specific price, tax, and split settings without prior-client leakage."
);

assert(
  estimateEdit.includes("client_service_overrides") &&
    estimateEdit.includes("resolveServicePricing") &&
    estimateEdit.includes("getClientTaxSettings") &&
    estimateEdit.includes("repriceSavedServiceLinesForClient") &&
    estimateEdit.includes("Boolean(estimate.split_warning_enabled)") &&
    estimateEdit.includes("const effectiveSplitWarningEnabled = splitWarningEnabled"),
  "Edited estimates must preserve their saved split preference while resolving client-specific tax and service pricing."
);

assert(
  clientEdit.includes("Service Price Overrides") &&
    clientEdit.includes("auto_split_enabled") &&
    clientEdit.includes("tax_rate") &&
    clientEdit.includes("upsert("),
  "Client edit must expose property commercial settings without duplicating saved service identities."
);

assert(
  propertyCommercialSettingsMigration.includes("create table if not exists public.client_service_overrides") &&
    propertyCommercialSettingsMigration.includes("unique (business_id, client_id, service_item_id)") &&
    propertyCommercialSettingsMigration.includes("auto_split_enabled") &&
    propertyCommercialSettingsMigration.includes("split_target_amount"),
  "Property commercial settings migration must store service overrides and client split policy in normalized form."
);

assert(
  !estimateNew.includes("normalizedClient.includes(normalizedProperty)") &&
    !estimateNew.includes("normalizedProperty.includes(normalizedClient)"),
  "Queue/client matching must not use broad substring fallback between sister properties."
);

assert(
  converter.includes("client_id: estimate.client_id") &&
    converter.includes("customer_name:") &&
    converter.includes("estimate.customer_name ?? customerName") &&
    converter.includes("disabledReason"),
  "Estimate-to-invoice conversion must preserve the estimate client identity and honor identity blocks."
);

assert(
  estimateDetails.includes("detectClientIdentityConflict") &&
    estimateDetails.includes("Customer and property do not match. Review before continuing.") &&
    estimateDetails.includes("disabledReason={clientIdentityConflict.message}") &&
    invoiceDetails.includes("detectClientIdentityConflict") &&
    invoiceDetails.includes("Customer and property do not match. Review before continuing.") &&
    invoiceDetails.includes("sendDisabledReason={draftSendDisabledReason}"),
  "Estimate and invoice details must warn and block Send/Convert when customer and property conflict."
);

assert(
  estimateSendEmailRoute.includes("client_identity_conflict") &&
    estimateSendEmailRoute.includes(".select(\"id, name, property_aliases, email, cc_email\")") &&
    invoiceSendEmailRoute.includes("client_identity_conflict") &&
    invoiceSendEmailRoute.includes(".select(\"id, name, property_aliases, email, cc_email\")") &&
    invoiceSendEmailRoute.includes("targetInvoices"),
  "Email APIs must verify recipient eligibility from the authoritative document client identity."
);

assert(
  estimateEdit.includes("Find Saved Service") &&
    invoiceEdit.includes("Find Saved Service") &&
    estimateEdit.includes("visibleServiceItems.map") &&
    invoiceEdit.includes("visibleServiceItems.map"),
  "Estimate and invoice editors must present searchable, deduped saved services."
);

assert(
  estimateEdit.includes("Line Items") &&
    invoiceEdit.includes("Line Items"),
  "Line Items must remain expanded in document editors."
);

console.log("Discount and saved-service regression checks passed.");
