import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const estimatesPage = readFileSync(
  resolve(root, "src/app/estimates/page.tsx"),
  "utf8"
);

assert(
  estimatesPage.includes('const businessQuery = `?business=${businessSlug}`'),
  "Estimates page must preserve the selected business context."
);

assert(
  estimatesPage.includes(".eq(\"business_id\", selectedBusiness.id)"),
  "Estimates list queries must stay scoped to the selected business."
);

assert(
  estimatesPage.includes(
    '"id, business_id, client_id, queue_item_id, display_id, customer_name, project_title, project_address, service_address, reference, estimate_amount, status, notes, terms, created_at"'
  ),
  "Primary estimate list query must use production-safe columns."
);

assert(
  !estimatesPage.includes(
    "project_address, service_address, reference, estimate_amount, status, notes, terms, created_at, updated_at"
  ),
  "Primary estimate list query must not require the missing production updated_at column."
);

assert(
  estimatesPage.includes("let estimatesLoadFailed") &&
    estimatesPage.includes("estimatesLoadFailed = true"),
  "Estimate load failures must be tracked separately from an empty successful result."
);

assert(
  estimatesPage.includes("{!estimatesLoadFailed ? (") &&
    estimatesPage.includes("Estimate Command Center") &&
    estimatesPage.includes("estimateHealthCards.map"),
  "Metrics must be hidden when the list query fails so zero values are not shown as authoritative."
);

assert(
  estimatesPage.includes("Retry the estimate list") &&
    estimatesPage.includes("<Button className=\"w-full sm:w-auto\">Retry</Button>"),
  "Failed estimate loads must provide a clear retry action."
);

assert(
  estimatesPage.includes("Search Estimates") &&
    estimatesPage.includes("statusFilter") &&
    estimatesPage.includes("filteredEstimates"),
  "Search and status filters must remain available for successful estimate loads."
);

assert(
  estimatesPage.includes("queueLinkedEstimates") &&
    estimatesPage.includes("href={`/estimates/${estimate.id}${businessQuery}`}"),
  "Queue-linked estimates must remain openable from the list."
);

assert(
  estimatesPage.includes("getEstimateFreshnessDate") &&
    estimatesPage.includes("estimate.updated_at ??") &&
    estimatesPage.includes("estimate.created_at"),
  "Recently edited/freshness logic must tolerate older rows without updated_at."
);

assert(
  estimatesPage.includes("Estimate Workspace Ready") &&
    estimatesPage.includes("Start the first proposal") &&
    estimatesPage.includes("border-sky-500/40 bg-zinc-950/80") &&
    estimatesPage.includes("text-white") &&
    estimatesPage.includes("text-zinc-400"),
  "Estimate empty-state text must use readable dark-mode classes with theme-light overrides."
);

assert(
  !estimatesPage.includes("app-empty-state border-sky-200 bg-sky-50") &&
    !estimatesPage.includes("app-empty-state border-dashed border-slate-300 bg-white"),
  "Low-contrast light empty-state cards must not return to the Estimates page."
);

console.log("Estimate list loading regression checks passed.");
