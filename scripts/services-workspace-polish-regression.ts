import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const servicesPage = read("src/app/services/page.tsx");
const styles = read("src/app/globals.css");
const savedServiceIntegration = read("scripts/discounts-and-services-regression.ts");

assert(
  servicesPage.startsWith("\"use client\"") &&
    servicesPage.includes(".from(\"service_items\")") &&
    servicesPage.includes(".eq(\"business_id\", selectedBusiness.id)"),
  "Services must remain browser-authenticated and business-scoped."
);

assert(
  servicesPage.includes("Search services") &&
    servicesPage.includes("setSearchTerm") &&
    servicesPage.includes("service-filter-pill") &&
    servicesPage.includes("categorySummaries.map"),
  "Search and category filters must remain available at the top of the workspace."
);

assert(
  servicesPage.includes("builderOpen") &&
    servicesPage.includes("setBuilderOpen(true)") &&
    servicesPage.includes("service-builder-collapsed"),
  "New Service builder must be collapsed by default and open explicitly."
);

assert(
  servicesPage.includes("pricingTiersOpen") &&
    servicesPage.includes("Pricing tiers") &&
    servicesPage.includes("Easy Unit Price") &&
    servicesPage.includes("Normal Unit Price") &&
    servicesPage.includes("Difficult Unit Price"),
  "Pricing tiers must remain available behind a compact control."
);

assert(
  servicesPage.includes("starterOpen") &&
    servicesPage.includes("Browse templates") &&
    servicesPage.includes("starterServices.map"),
  "Starter templates must remain available without dominating the default page."
);

assert(
  servicesPage.includes("healthOpen") &&
    servicesPage.includes("Cleanup {cleanupSignalCount}") &&
    servicesPage.includes("buildServiceCleanupAudit") &&
    servicesPage.includes("Price book health") &&
    servicesPage.includes("Build cleaner bids from the price book"),
  "Analytics and cleanup sections must remain available behind the compact health toggle."
);

assert(
  servicesPage.includes("service-card-compact") &&
    servicesPage.includes("service-card-main") &&
    servicesPage.includes("service-card-price") &&
    servicesPage.includes("More actions") &&
    servicesPage.includes("Duplicate") &&
    servicesPage.includes("Deactivate"),
  "Saved-service cards must use the repaired compact layout with secondary actions tucked behind More actions."
);

assert(
  styles.includes(".services-workspace") &&
    styles.includes(".service-library-controls") &&
    styles.includes(".service-library-results") &&
    styles.includes("order: 3") &&
    styles.includes(".service-card-main > :first-child") &&
    styles.includes("flex: 1 1 16rem") &&
    styles.includes("@media (max-width: 640px)") &&
    styles.includes(".service-card-actions > button"),
  "Services CSS must keep the library high on the page and prevent narrow mobile card columns."
);

assert(
  !styles.includes("grid-template-columns: 40px") &&
    !styles.includes("grid-template-columns: 80px"),
  "Mobile service cards must not use tiny fixed metadata columns."
);

assert(
  savedServiceIntegration.includes("Exact duplicate services must collapse in picker presentation."),
  "Existing estimate/invoice Saved Service integration coverage must remain present."
);

console.log("Services workspace polish regression checks passed.");
