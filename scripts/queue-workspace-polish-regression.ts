import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const queueList = readFileSync(join(root, "src/app/queue/page.tsx"), "utf8");
const queueDetail = readFileSync(join(root, "src/app/queue/[unit]/page.tsx"), "utf8");
const correctionButton = readFileSync(
  join(root, "src/app/components/CorrectInvoiceButton.tsx"),
  "utf8"
);

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source: string, needle: string, message: string) {
  assert(source.includes(needle), message);
}

function assertMatches(source: string, pattern: RegExp, message: string) {
  assert(pattern.test(source), message);
}

assertIncludes(
  queueList,
  "function isClosedForOperations",
  "Queue list must keep a single active-queue close rule."
);
assertMatches(
  queueList,
  /function isClosedForOperations[\s\S]*return isClosedQueueItem\(item\);/,
  "Queue item removal must still depend on explicit queue completion, not estimate, invoice, sent, or paid state."
);
assertIncludes(
  queueList,
  "derivedQueueStatusFromInvoicePackage",
  "Queue badge source must keep using linked invoice package state."
);
assertIncludes(
  queueList,
  "resolveFinancialStatus",
  "Queue badge source must keep the shared financial status resolver."
);
assertIncludes(
  queueList,
  "chooseAuthoritativeInvoice",
  "Queue badge source must keep authoritative invoice selection for corrections and splits."
);
assertMatches(
  queueList,
  /splitChildrenByParentInvoiceId[\s\S]*derivedQueueStatusFromInvoicePackage/,
  "Split invoice children must remain part of Queue status derivation."
);
assertIncludes(
  queueList,
  'label: "Manage Session"',
  "Active queue sessions should present a single Manage Session action."
);
assert(
  !queueList.includes(">View Details<"),
  "Queue list must not require a separate View Details button."
);
assertMatches(
  queueList,
  /<CompactQueueField\s+label="Priority"[\s\S]*<CompactQueueField label="Work"[\s\S]*<CompactQueueField label="Needed"/,
  "Queue rows must keep priority, work type, and needed-by visible."
);
assertMatches(
  queueList,
  /item\.property \|\| "Unknown Property"/,
  "Queue rows must keep property visible without expanding details."
);
assertIncludes(
  queueList,
  '<StatusBadge\n                          status={queueLifecycleDisplayStatus(lifecycleStatus)}',
  "Queue rows must display the authoritative lifecycle status."
);

assertIncludes(
  queueDetail,
  "<StatusBadge status={managerLifecycleStatus} />",
  "Queue detail top summary must show one authoritative workflow status."
);
assertIncludes(
  queueDetail,
  "MarkCompletedButton",
  "Mark Job Complete must remain available as a separate operation."
);
assertIncludes(
  queueDetail,
  "JobSessionPanel",
  "Active Job Session controls must remain available."
);
assertIncludes(
  queueDetail,
  "Edit Queue Item",
  "Queue editing must remain available to authorized roles."
);
assertMatches(
  queueDetail,
  /allow=\{\["owner", "admin", "property_manager"\]\}[\s\S]*Edit Queue Item/,
  "Edit Queue Item must remain available to owner, admin, and property manager roles."
);
assertIncludes(
  queueDetail,
  "wallPaintCode",
  "Sherwin-Williams paint code must remain preserved and visible."
);
assertIncludes(
  queueDetail,
  'label="Move Out Date"',
  "Move-out date must remain separate from Needed By date."
);
assertIncludes(
  queueDetail,
  'label="Needed By Date"',
  "Needed By date must remain separate from Move Out date."
);
assertIncludes(
  queueDetail,
  "Open Estimate",
  "Linked estimate navigation must remain available."
);
assertIncludes(
  queueDetail,
  "Open Invoice",
  "Linked invoice navigation must remain available."
);
assertMatches(
  queueDetail,
  /linkedInvoiceStatus = linkedInvoiceLifecycleStatus/,
  "Linked invoice status must remain distinct from Queue completion."
);
assertIncludes(
  queueList,
  "split_parent_invoice_id",
  "Split invoice relationships must remain distinct from correction relationships."
);
assertIncludes(
  correctionButton,
  "correctionReason",
  "Correction invoice relationships must remain distinct from split relationships."
);
assertIncludes(
  queueDetail,
  "PersistentDetails",
  "Queue detail secondary sections must continue using the persistent collapse pattern."
);
assertMatches(
  queueDetail,
  /storageKey=\{`queue-detail-manager-update-\$\{item\.id\}`\}/,
  "Manager update must remain collapsed with remembered state."
);
assertMatches(
  queueDetail,
  /storageKey=\{`queue-detail-job-details-\$\{item\.id\}`\}/,
  "Job details must remain collapsed with remembered state."
);
assertMatches(
  queueDetail,
  /storageKey=\{`queue-detail-more-actions-\$\{item\.id\}`\}/,
  "More actions must remain collapsed with remembered state."
);
assert(
  !queueDetail.includes("Back to Queue"),
  "Queue detail must not render an extra in-page Back button."
);

console.log("Queue workspace polish regression checks passed.");
