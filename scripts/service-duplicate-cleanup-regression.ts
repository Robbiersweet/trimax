import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildServiceCleanupAudit,
  chooseCanonicalService,
  findCanonicalServiceForCapture,
  serviceExactDuplicateKey,
  serviceIdentityKey,
} from "../src/app/lib/serviceDuplicateCleanup.ts";

const root = process.cwd();
const servicesPage = readFileSync(resolve(root, "src/app/services/page.tsx"), "utf8");
const styles = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
const captureServices = readFileSync(
  resolve(root, "src/app/lib/captureServicesFromLineItems.ts"),
  "utf8"
);

const services = [
  {
    id: "priced-old",
    business_id: "rnl",
    name: " Renovation & Cabinet Paint ",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 550,
    category: "Renovation",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "priced-new",
    business_id: "rnl",
    name: "Renovation and Cabinet Paint",
    description: "Renovation and Cabinet Paint",
    default_quantity: "1",
    default_unit_price: "550.00",
    category: "Renovation",
    is_active: true,
    created_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "zero-auto",
    business_id: "rnl",
    name: "Renovation and Cabinet Paint",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 0,
    category: "Renovation",
    is_active: true,
  },
  {
    id: "price-conflict",
    business_id: "rnl",
    name: "Renovation and Cabinet Paint",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 625,
    category: "Renovation",
    is_active: true,
  },
  {
    id: "other-business",
    business_id: "other",
    name: "Renovation and Cabinet Paint",
    description: "Renovation and Cabinet Paint",
    default_quantity: 1,
    default_unit_price: 550,
    category: "Renovation",
    is_active: true,
  },
  {
    id: "incomplete",
    business_id: "rnl",
    name: "Cabinet",
    description: "",
    default_quantity: 1,
    default_unit_price: 0,
    category: "",
    is_active: true,
  },
];

assert.equal(
  serviceExactDuplicateKey(services[0]),
  serviceExactDuplicateKey(services[1]),
  "Exact duplicate normalization must ignore whitespace, ampersands, and numeric string differences."
);

assert.notEqual(
  serviceIdentityKey(services[0]),
  serviceIdentityKey(services[4]),
  "Duplicate detection must remain scoped by business."
);

const audit = buildServiceCleanupAudit(services);

assert.equal(audit.totalServices, 6);
assert.equal(audit.exactDuplicateGroups.length, 1);
assert.deepEqual(
  audit.exactDuplicateGroups[0].redundantServices.map((service) => service.id),
  ["priced-new"],
  "Only exact duplicates should be eligible for automatic deactivation."
);
assert.equal(
  audit.priceConflictGroups.length,
  1,
  "Same service with different meaningful nonzero prices must be a price conflict, not an auto-merge."
);
assert.equal(
  audit.zeroPriceArtifactGroups.length,
  1,
  "Zero-dollar records with a priced equivalent must be classified as artifacts."
);
assert(
  audit.incompleteServices.some((service) => service.id === "incomplete"),
  "Incomplete active services must stay visible in cleanup."
);

assert.equal(
  chooseCanonicalService([services[1], services[0]]).id,
  "priced-old",
  "Canonical selection must be deterministic and prefer the oldest otherwise equivalent service."
);
assert.equal(
  chooseCanonicalService([services[2], services[0]]).id,
  "priced-old",
  "Canonical selection must prefer a real price over a zero-dollar artifact."
);

const canonicalMatch = findCanonicalServiceForCapture({
  existingServices: services,
  businessId: "rnl",
  name: "Renovation and Cabinet Paint",
  description: "Renovation and Cabinet Paint",
  category: "Renovation",
});

assert.equal(
  canonicalMatch?.id,
  "priced-old",
  "Future auto-capture checks must resolve to the canonical existing service instead of creating another row."
);

assert(
  captureServices.includes("Automatic line-item capture is disabled") &&
    !captureServices.includes(".insert("),
  "Current auto-capture prevention must not silently create service_items rows."
);

assert(
  servicesPage.includes("buildServiceCleanupAudit") &&
    servicesPage.includes("Deactivate exact duplicates") &&
    servicesPage.includes(".eq(\"business_id\", business.id)") &&
    servicesPage.includes(".in(\"id\", redundantIds)"),
  "Cleanup actions must be explicit, business-scoped, and limited to classified exact duplicates."
);

assert(
  servicesPage.includes("cleanupCandidateIds") &&
    servicesPage.includes("Duplicate cleanup") &&
    servicesPage.includes("Price Conflicts"),
  "Services UI must surface duplicate cleanup and price conflicts without deleting records automatically."
);

assert(
  !servicesPage.includes("Ã") &&
    !styles.includes("Ã") &&
    !styles.includes('content: "•"') &&
    !styles.includes("content: \"Ã"),
  "Services summary must not rely on mojibake-prone literal separator text."
);

assert(
  servicesPage.includes("service-cleanup-card") &&
    styles.includes(".service-cleanup-metric") &&
    styles.includes(".service-card-description") &&
    styles.includes("font-size: 0.86rem") &&
    styles.includes(".service-card-actions > button"),
  "Services mobile density and cleanup review styling must remain present."
);

console.log("Service duplicate cleanup regression checks passed.");
