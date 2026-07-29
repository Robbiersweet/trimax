import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSplitChildSourceRelationship,
  buildSplitSourceRelationshipItems,
} from "../src/app/lib/splitInvoiceRelationships.ts";

const root = process.cwd();
const children = [
  {
    id: "19171cb2-cd38-43a0-aa62-f7cad82cff2e",
    display_id: "INV-0521",
    status: "Draft",
    split_sequence: 1,
    split_count: 2,
  },
  {
    id: "c5a1ce10-aa95-4337-9ba8-967bf7a9c308",
    display_id: "INV-0522",
    status: "Draft",
    split_sequence: 2,
    split_count: 2,
  },
];
const childSnapshot = structuredClone(children);

assert.deepEqual(buildSplitSourceRelationshipItems(children), [
  {
    id: "19171cb2-cd38-43a0-aa62-f7cad82cff2e",
    displayId: "INV-0521",
    status: "Draft",
    splitLabel: "Split 1 of 2",
  },
  {
    id: "c5a1ce10-aa95-4337-9ba8-967bf7a9c308",
    displayId: "INV-0522",
    status: "Draft",
    splitLabel: "Split 2 of 2",
  },
]);
assert.deepEqual(children, childSnapshot, "relationship mapping must not mutate invoice records");

assert.deepEqual(
  buildSplitChildSourceRelationship({
    id: "cb5f3e82-e63c-42c6-bc7a-210b9982e8fc",
    display_id: "INV-0517",
    status: "Draft",
    split_sequence: null,
    split_count: null,
  }),
  {
    id: "cb5f3e82-e63c-42c6-bc7a-210b9982e8fc",
    displayId: "INV-0517",
    status: "Draft",
    splitLabel: "Split invoice",
  }
);
assert.equal(buildSplitChildSourceRelationship(null), null);
assert.deepEqual(
  buildSplitSourceRelationshipItems([
    {
      id: null,
      display_id: "INV-9999",
      status: "Draft",
      split_sequence: 1,
      split_count: 2,
    },
  ]),
  [],
  "missing authoritative child IDs must produce no guessed links"
);

const componentSource = readFileSync(
  resolve(root, "src/app/components/SplitInvoiceRelationshipDisplay.tsx"),
  "utf8"
);
assert(
  componentSource.includes("href={`/invoices/${child.id}${businessQuery}`}"),
  "child links must use immutable child invoice IDs"
);
assert(
  componentSource.includes("href={`/invoices/${source.id}${businessQuery}`}"),
  "source links must use immutable source invoice IDs"
);

const invoicePage = readFileSync(
  resolve(root, "src/app/invoices/[id]/page.tsx"),
  "utf8"
);
assert(
  invoicePage.includes("originalDisplayId") &&
    invoicePage.includes("Correction of ${originalDisplayId}") &&
    invoicePage.includes("SplitInvoiceRelationshipDisplay"),
  "source and correction relationships must remain separate displays"
);

const splitLogicSource = readFileSync(
  resolve(root, "src/app/lib/splitInvoices.ts"),
  "utf8"
);
assert(
  splitLogicSource.includes("buildSplitInvoicePlan") &&
    splitLogicSource.includes("getMaxSubtotalCentsForGrandTotal"),
  "existing split calculation module must remain present for unchanged split regression coverage"
);

console.log("Split source relationship regression checks passed.");
