import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const queuePage = readFileSync(
  resolve(process.cwd(), "src/app/queue/page.tsx"),
  "utf8"
);

assert(
  queuePage.includes('data-queue-compact-toolbar="true"') &&
    queuePage.includes("Search Queue") &&
    queuePage.includes("View") &&
    queuePage.includes("Status") &&
    queuePage.includes("Sort"),
  "Queue controls must render as one compact search, view, status, and sort toolbar."
);

assert.equal(
  (queuePage.match(/className="queue-filter-bar/g) ?? []).length,
  0,
  "Queue list must not return to separate full-width filter bars."
);

assert(
  !queuePage.includes("{activeView.title}") &&
    !queuePage.includes("{displayQueueItems.length} of {propertyScopedQueueItems.length}"),
  "The redundant Active Work summary bar must stay removed."
);

assert(
  queuePage.includes('label: "Active Work"') &&
    queuePage.includes('label: "Due Soon"') &&
    queuePage.includes('label: "Needs Estimate"') &&
    queuePage.includes('label: "Remediation"') &&
    queuePage.includes('label: "All History"') &&
    queuePage.includes("data-queue-view-filter={filter.value}"),
  "All existing Queue view filters must remain available."
);

assert(
  queuePage.includes('label: "All"') &&
    queuePage.includes("...statuses.map") &&
    queuePage.includes("statusLabel(status)") &&
    queuePage.includes("data-queue-status-filter={filter.value}"),
  "All status filters, including dynamic production statuses, must remain available."
);

assert(
  queuePage.includes('{ label: "Priority", value: "priority" }') &&
    queuePage.includes('{ label: "Deadline", value: "deadline" }') &&
    queuePage.includes('{ label: "Status", value: "status" }') &&
    !queuePage.includes("Sort by Requested Priority") &&
    !queuePage.includes("Sort by Deadline") &&
    !queuePage.includes("Sort by Status"),
  "Sort controls must use compact labels while preserving the same sort modes."
);

assert(
  queuePage.includes('resolvedSearchParams.sort?.trim().toLowerCase() ?? "priority"') &&
    queuePage.includes('const selectedSortLink =') &&
    queuePage.includes("Sort: {selectedSortLink.label}"),
  "Default sort must remain Priority and show the selected ordering once."
);

assert(
  queuePage.includes('data-zero-count={isEmpty ? "true" : undefined}') &&
    queuePage.includes("queue-filter-link-muted") &&
    queuePage.includes("filter.count === 0"),
  "Zero-count filters must remain selectable but visually muted."
);

assert(
  queuePage.includes('filter.value === "history"') &&
    queuePage.includes("isHistory") &&
    queuePage.includes("hover:border-zinc-600"),
  "History must remain accessible with quieter styling."
);

assert(
  queuePage.includes("const filtersAreDefault =") &&
    queuePage.includes("!filtersAreDefault ? (") &&
    queuePage.includes("Clear filters") &&
    queuePage.includes("statusFilter === \"all\"") &&
    queuePage.includes("viewFilter === \"all\"") &&
    queuePage.includes("sortMode === \"priority\""),
  "Clear filters must appear only when the toolbar is not in the default state."
);

assert(
  queuePage.includes("name=\"q\"") &&
    queuePage.includes("defaultValue={searchTerm}") &&
    queuePage.includes("searchableText.includes(searchTerm.toLowerCase())"),
  "Search behavior must remain available and keep the existing matching logic."
);

assert(
  queuePage.includes("q: searchTerm") &&
    queuePage.includes("property: propertyFilter") &&
    queuePage.includes("status: statusFilter") &&
    queuePage.includes("view: viewFilter") &&
    queuePage.includes("sort: sortMode") &&
    queuePage.includes("scroll={false}"),
  "Toolbar links must preserve search, property, status, view, sort, and normal browser history."
);

assert(
  queuePage.includes("flex flex-wrap") &&
    queuePage.includes("min-h-10") &&
    queuePage.includes("min-w-0") &&
    !queuePage.includes("overflow-x-auto"),
  "Toolbar controls must wrap on mobile without relying on horizontal overflow."
);

assert(
  queuePage.includes("QueueClickableCard") &&
    queuePage.includes("compareQueueItems(first, second, sortMode)") &&
    queuePage.includes("primaryQueueAction"),
  "Queue row navigation, ordering, and primary actions must remain untouched."
);

console.log("Queue compact toolbar regression checks passed.");
