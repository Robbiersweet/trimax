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

assert.equal(
  (page.match(/label: "Invoice connected"/g) ?? []).length,
  0,
  "Invoice-connected rows must not render a duplicate next-action status label."
);

assert(
  page.includes("formatInvoiceRelationship") &&
    page.includes("linkedInvoiceDisplayId") &&
    page.includes("linkedInvoiceStatus") &&
    page.includes("·"),
  "Linked invoice number and status must remain visible as compact relationship metadata."
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
    page.includes("label: \"Review & Send\"") &&
    page.includes("statusKey === \"draft\"") &&
    page.includes("label: \"Edit\""),
  "Draft estimates must show draft-appropriate primary actions."
);

assert(
  page.includes("data-estimate-row-link") &&
    page.includes("aria-label={`Open ${estimateLabel}`}") &&
    page.includes("pointer-events-auto relative z-20") &&
    page.includes("Secondary actions"),
  "Estimate rows must be directly openable while keeping row actions independently clickable."
);

assert(
  page.includes("isDefaultNeedsAttentionView") &&
    page.includes("currentActionableEstimates") &&
    page.includes("completedEstimateResults") &&
    page.includes("Completed / Invoice Connected"),
  "Default Needs Attention must prioritize current actionable estimates and collapse completed connected records."
);

assert(
  page.includes("visibleCompletedEstimates") &&
    page.includes("data-completed-estimate-row") &&
    page.includes("View {hiddenCompletedCount} more converted estimate"),
  "Completed or invoice-connected estimates must remain accessible from the default workspace."
);

assert(
  page.includes("estimate.linkedInvoiceDisplayId") &&
    page.includes("estimate.linkedInvoiceStatus") &&
    page.includes("searchableText"),
  "Invoice-connected estimates must remain searchable by linked invoice metadata."
);

assert(
  page.includes("operationalCue") &&
    page.includes("Needs review ·") &&
    page.includes("Ready to send ·") &&
    page.includes("untouched"),
  "Old actionable drafts must show stale age as an operational cue."
);

assert.equal(
  (page.match(/<Button>New Estimate<\/Button>/g) ?? []).length,
  1,
  "Duplicate New Estimate actions must be removed when they share the same route."
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
