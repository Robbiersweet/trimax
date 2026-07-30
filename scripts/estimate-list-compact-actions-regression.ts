import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(
  resolve(process.cwd(), "src/app/estimates/page.tsx"),
  "utf8"
);

assert(
  page.includes("visibleEstimates.map") &&
    page.includes("Load More Estimates") &&
    page.includes("const pageSize = 15"),
  "Estimate results must render a compact paged result set."
);

assert(
  page.includes("needs-attention") &&
    page.includes("getEstimateAttentionScore") &&
    page.includes("Highest Value") &&
    page.includes("Estimate Number"),
  "Estimate list must support Needs Attention sorting and the requested sort options."
);

assert(
  page.includes("linkedInvoiceId") &&
    page.includes("linkedInvoiceDisplayId") &&
    page.includes("Open Invoice") &&
    page.includes("href: `/invoices/${estimate.linkedInvoiceId}${businessQuery}`"),
  "Invoice-linked estimates must expose a real Open Invoice action."
);

assert(
  page.includes("getAuthoritativeStatusLabel") &&
    page.includes("Invoice connected") &&
    page.includes("hasLinkedInvoice"),
  "Linked invoices must take precedence over stale estimate status presentation."
);

assert(
  !page.includes("filteredEstimates.map") &&
    !page.includes("estimate-next-action") &&
    !page.includes("estimate-readiness-panel") &&
    !page.includes("style={{ width: `${readiness.score}%` }}"),
  "Completed estimate rows must not render large next-action/readiness cards or progress bars."
);

assert(
  page.includes("isSendableDraft") &&
    page.includes("label: \"Send\"") &&
    page.includes("statusKey === \"draft\"") &&
    page.includes("label: \"Edit\""),
  "Draft estimates must show draft-appropriate primary actions."
);

assert(
  page.includes("More estimate signals") &&
    page.includes("<details") &&
    page.includes("Proposal Pipeline") &&
    page.includes("Highest Open Proposal"),
  "Top analytics must keep core metrics visible and move secondary signals behind an expandable section."
);

assert(
  page.includes("pb-28") &&
    page.includes("Load More Estimates"),
  "Estimate results need bottom spacing so floating controls do not cover row actions or pagination."
);

assert(
  page.includes("Queue-linked") &&
    page.includes("proofLabel") &&
    page.includes("touchedLabel"),
  "Compact rows must retain queue, proof, and touched metadata."
);

console.log("Estimate compact actions regression checks passed.");
