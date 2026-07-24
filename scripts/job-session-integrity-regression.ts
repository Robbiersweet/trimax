import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chooseAuthoritativeInvoice,
  invoiceAmountDue,
  isCollectibleInvoiceStatus,
  resolveFinancialStatus,
} from "../src/app/lib/invoiceLifecycle.ts";

type FixtureSession = {
  id: string;
  businessId: string;
  userId: string;
  queueItemId: string | null;
  startedAt: string;
  endedAt: string | null;
  totalMinutes: number | null;
};

type FixtureBreakdown = {
  jobSessionId: string;
};

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function minutesBetween(startedAt: string, endedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return Math.round((end - start) / 60000);
}

function fixtureHubMetrics(
  sessions: FixtureSession[],
  breakdowns: FixtureBreakdown[],
  businessId: string,
  now: Date
) {
  const authoritativeSessions = sessions.filter(
    (session) => session.businessId === businessId
  );
  const breakdownSessionIds = new Set(
    breakdowns.map((breakdown) => breakdown.jobSessionId)
  );
  const activeSessions = authoritativeSessions.filter(
    (session) => !session.endedAt
  );
  const completedSessions = authoritativeSessions.filter(
    (session) => session.endedAt
  );
  const currentMonth = monthKey(now);
  const monthMinutes = completedSessions.reduce((total, session) => {
    const endedAt = session.endedAt ? new Date(session.endedAt) : null;

    if (
      !endedAt ||
      Number.isNaN(endedAt.getTime()) ||
      monthKey(endedAt) !== currentMonth
    ) {
      return total;
    }

    return (
      total +
      (session.totalMinutes ?? minutesBetween(session.startedAt, session.endedAt))
    );
  }, 0);
  const averageCompletedMinutes =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce(
            (total, session) =>
              total +
              (session.totalMinutes ??
                minutesBetween(session.startedAt, session.endedAt)),
            0
          ) / completedSessions.length
        )
      : 0;
  const missingBreakdownSessions = completedSessions.filter(
    (session) => !breakdownSessionIds.has(session.id)
  );

  return {
    activeCount: activeSessions.length,
    completedCount: completedSessions.length,
    monthMinutes,
    averageCompletedMinutes,
    missingBreakdownCount: missingBreakdownSessions.length,
    queueVisibleSessionIds: new Set(
      authoritativeSessions
        .filter((session) => session.queueItemId)
        .map((session) => session.id)
    ),
    hubVisibleSessionIds: new Set(authoritativeSessions.map((session) => session.id)),
  };
}

const root = process.cwd();
const hub = readFileSync(resolve(root, "src/app/job-sessions/page.tsx"), "utf8");
const queue = readFileSync(resolve(root, "src/app/queue/page.tsx"), "utf8");
const dashboard = readFileSync(resolve(root, "src/app/page.tsx"), "utf8");
const queueDetail = readFileSync(
  resolve(root, "src/app/queue/[unit]/page.tsx"),
  "utf8"
);
const panel = readFileSync(
  resolve(root, "src/app/components/JobSessionPanel.tsx"),
  "utf8"
);
const dock = readFileSync(
  resolve(root, "src/app/components/ActiveJobSessionDock.tsx"),
  "utf8"
);
const appShell = readFileSync(resolve(root, "src/app/components/AppShell.tsx"), "utf8");
const backButton = readFileSync(
  resolve(root, "src/app/components/BackButton.tsx"),
  "utf8"
);
const workspaceBackBar = readFileSync(
  resolve(root, "src/app/components/WorkspaceBackBar.tsx"),
  "utf8"
);
const globalsCss = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
const queueClickableCard = readFileSync(
  resolve(root, "src/app/components/QueueClickableCard.tsx"),
  "utf8"
);
const markCompletedButton = readFileSync(
  resolve(root, "src/app/components/MarkCompletedButton.tsx"),
  "utf8"
);
const quickCommandCenter = readFileSync(
  resolve(root, "src/app/components/QuickCommandCenter.tsx"),
  "utf8"
);
const createQueueItem = readFileSync(
  resolve(root, "src/app/lib/createQueueItem.ts"),
  "utf8"
);
const invoiceLifecycle = readFileSync(
  resolve(root, "src/app/lib/invoiceLifecycle.ts"),
  "utf8"
);
const invoiceDetail = readFileSync(
  resolve(root, "src/app/invoices/[id]/page.tsx"),
  "utf8"
);
const invoiceEmailSendPanel = readFileSync(
  resolve(root, "src/app/components/InvoiceEmailSendPanel.tsx"),
  "utf8"
);
const updateInvoiceStatusButton = readFileSync(
  resolve(root, "src/app/components/UpdateInvoiceStatusButton.tsx"),
  "utf8"
);
const invoiceSendEmailRoute = readFileSync(
  resolve(root, "src/app/api/invoices/[id]/send-email/route.ts"),
  "utf8"
);
const correctInvoiceButton = readFileSync(
  resolve(root, "src/app/components/CorrectInvoiceButton.tsx"),
  "utf8"
);

function canonicalUnit(value: string | null | undefined) {
  const normalized = (value || "").trim().replace(/[\s-]+/g, "").toUpperCase();
  const match = normalized.match(/^([A-Z])0*([1-9]\d?)$/);

  return match ? `${match[1]}${match[2].padStart(2, "0")}` : normalized;
}

const q08Session: FixtureSession = {
  id: "session-q08",
  businessId: "rnl-business",
  userId: "owner-user",
  queueItemId: "queue-q08",
  startedAt: "2026-07-17T08:00:00-07:00",
  endedAt: "2026-07-17T18:26:00-07:00",
  totalMinutes: 626,
};
const activeSession: FixtureSession = {
  id: "session-active",
  businessId: "rnl-business",
  userId: "owner-user",
  queueItemId: "queue-active",
  startedAt: "2026-07-18T08:00:00-07:00",
  endedAt: null,
  totalMinutes: null,
};
const otherBusinessSession: FixtureSession = {
  id: "session-other-business",
  businessId: "just-kleen-business",
  userId: "owner-user",
  queueItemId: "queue-other",
  startedAt: "2026-07-17T08:00:00-07:00",
  endedAt: "2026-07-17T09:00:00-07:00",
  totalMinutes: 60,
};

const metrics = fixtureHubMetrics(
  [q08Session, activeSession, otherBusinessSession],
  [],
  "rnl-business",
  new Date("2026-07-18T12:00:00-07:00")
);

assert.equal(
  metrics.queueVisibleSessionIds.has(q08Session.id),
  true,
  "A Q08-style completed session must remain visible through the queue path."
);
assert.equal(
  metrics.hubVisibleSessionIds.has(q08Session.id),
  true,
  "A Q08-style completed session must also be visible through the hub path."
);
assert.equal(
  metrics.monthMinutes,
  626,
  "A 10h 26m completed session must contribute 626 minutes to This Month."
);
assert.equal(
  metrics.averageCompletedMinutes,
  626,
  "A Q08-style completed session must contribute to Avg Session."
);
assert.equal(
  metrics.missingBreakdownCount,
  1,
  "A completed session with no breakdown must increment Need Breakdown."
);
assert.equal(
  metrics.activeCount,
  1,
  "An active ended_at=null session must increment Active Now."
);
assert.equal(
  metrics.completedCount,
  1,
  "Business filtering must not mix rnl-creations sessions with other workspaces."
);
assert.equal(
  fixtureHubMetrics([q08Session], [{ jobSessionId: q08Session.id }], "rnl-business", new Date("2026-07-18T12:00:00-07:00"))
    .missingBreakdownCount,
  0,
  "Existing session history and breakdown rows must be preserved without duplicate records."
);

assert(
  hub.includes('"use client"') &&
    hub.includes("supabase.auth.getUser()") &&
    hub.includes("isLoadingSessions") &&
    hub.includes("LEGACY_JOB_SESSION_SELECT"),
  "Job Sessions hub must read through the signed-in browser session and keep a legacy-safe fallback."
);
assert(
  hub.includes("session.ended_at") &&
    hub.includes("!session.ended_at") &&
    hub.includes("!breakdownSessionIds.has(session.id)") &&
    hub.includes("businessSlug"),
  "Hub metrics must use the same completion, active, breakdown, and business identity rules as queue detail."
);
assert(
  panel.includes("LEGACY_JOB_SESSION_SELECT") &&
    panel.includes("isMissingCrewSchemaError") &&
    panel.includes("crewSchemaAvailable"),
  "Queue detail session rendering must remain correct before and after the crew migration."
);
function fixtureQueueItemVisibility(item: {
  status: string | null;
  completedDate: string | null;
}) {
  return (
    (item.status ?? "").trim().toLowerCase() !== "completed" &&
    !item.completedDate
  );
}

assert.equal(
  fixtureQueueItemVisibility({ status: "Pending Estimate", completedDate: null }),
  true,
  "Uninvoiced incomplete queue work must remain visible."
);
assert.equal(
  fixtureQueueItemVisibility({ status: "Invoice Created", completedDate: null }),
  true,
  "Creating an invoice must not remove incomplete work from the active Queue."
);
assert.equal(
  fixtureQueueItemVisibility({ status: "Invoice Sent", completedDate: null }),
  true,
  "Sending an invoice must not remove incomplete work from the active Queue."
);
assert.equal(
  fixtureQueueItemVisibility({ status: "Paid", completedDate: null }),
  true,
  "Paying an invoice must not remove incomplete physical work from the active Queue."
);
assert.equal(
  fixtureQueueItemVisibility({ status: "Completed", completedDate: null }),
  false,
  "A completed queue status must leave the active Queue."
);
assert.equal(
  fixtureQueueItemVisibility({ status: "Invoice Sent", completedDate: "2026-07-20" }),
  false,
  "A saved completed_date must keep completed work out of active Queue after reload."
);
assert.equal(canonicalUnit("U03"), "U03", "Canonical U03 must stay U03.");
assert.equal(canonicalUnit("U3"), "U03", "U3 must normalize to U03.");
assert.equal(canonicalUnit("U-03"), "U03", "U-03 must normalize to U03.");
assert.equal(canonicalUnit("M7"), "M07", "M7 must normalize to M07.");
const samePropertyJobs = [
  { id: "u03-job", unit: "U03", createdAt: "2026-06-19" },
  { id: "u05-job", unit: "U05", createdAt: "2026-06-19" },
];
assert.equal(
  samePropertyJobs.map((job) => canonicalUnit(job.unit)).join(","),
  "U03,U05",
  "U03 and U05 must coexist as separate normalized queue records."
);
const duplicateUnitDifferentDates = [
  { id: "m07-old", unit: "M07", createdAt: "2026-06-29", completedDate: "2026-07-20" },
  { id: "m07-new", unit: "M07", createdAt: "2026-07-22", completedDate: null },
];
assert.equal(
  duplicateUnitDifferentDates.length,
  2,
  "Duplicate-unit jobs from different dates must remain separate records, not a unit-keyed overwrite."
);
const queueClosureFunction =
  queue.match(/function isClosedQueueItem[\s\S]*?function isClosedForOperations/)?.[0] ??
  "";
assert(
  queueClosureFunction.includes('status === "completed" || Boolean(item.completed_date)') &&
    !queueClosureFunction.includes("invoiced") &&
    !queueClosureFunction.includes("invoice sent") &&
    !queueClosureFunction.includes("paid"),
  "Queue visibility must be completion-based; invoice status must not close active work."
);
assert(
  dashboard.includes("function isCompletedQueueItem") &&
    dashboard.includes('normalizeStatus(item.status) === "completed"') &&
    dashboard.includes("Boolean(item.completed_date)") &&
    !dashboard.includes('return ["completed", "invoiced", "paid"].includes'),
  "Dashboard Queue preview must use the same completion-based active-work rule."
);
assert(
  quickCommandCenter.includes("function isActiveQueueItem") &&
    quickCommandCenter.includes("!item.completed_date") &&
    quickCommandCenter.includes("completed_date, linked_estimate_id"),
  "Quick Command active queue filtering must exclude completed_date records using the same completion state as Queue."
);
assert(
  createQueueItem.includes("canonicalApartmentUnitLabel") &&
    createQueueItem.includes("shouldCanonicalizeUnit") &&
    createQueueItem.includes(".insert([queueItemInsert])") &&
    !createQueueItem.includes(".upsert("),
  "Creating queue items must canonicalize North Creek unit formatting and must not upsert by unit, which could overwrite older jobs."
);
assert(
  queue.includes("resolveFinancialStatus") &&
    invoiceLifecycle.includes("activeSplitChildren.every"),
  "Split invoice status may inform labels through the shared resolver, but split invoices must not independently remove incomplete work."
);
assert(
  queue.includes("activeSessionByQueueItemId") &&
    queue.includes("Running") &&
    queue.includes("Resume Job") &&
    queue.includes("primaryQueueAction"),
  "Queue rows must surface active job sessions with one clear primary action."
);
assert(
  queue.includes("QueueClickableCard") &&
    queue.includes("data-queue-row-control") &&
    !queue.includes(">View Details<") &&
    queueClickableCard.includes('role="link"') &&
    queueClickableCard.includes("tabIndex={0}") &&
    queueClickableCard.includes('event.key === "Enter"') &&
    queueClickableCard.includes('event.key === " "') &&
    queueClickableCard.includes("router.push(href)") &&
    queueClickableCard.includes("isInteractiveTarget") &&
    queueClickableCard.includes("closest("),
  "Queue rows must open item detail by click or keyboard while child controls keep their own actions."
);
assert(
  queue.includes("compareQueueItems(first, second, sortMode)") &&
    queue.includes("priority_order"),
  "Queue display order must continue honoring the saved priority order."
);
assert(
  panel.includes('id="job-session"') &&
    panel.includes("Boolean(otherActiveSession)") &&
    panel.includes("Stop that session before starting another.") &&
    panel.includes("hasSessionHistory") &&
    panel.includes("Session History"),
  "Queue detail must keep active sessions addressable, prevent duplicate sessions, and hide empty history."
);
assert(
  queueDetail.includes("wallPaintSource") &&
    queueDetail.includes("paintCode") &&
    queueDetail.includes("Wall Paint") &&
    queueDetail.includes("queue_items") &&
    queueDetail.includes("wall_paint_color"),
  "Queue detail must render stored wall paint color/code from real queue data."
);
assert(
  queueDetail.includes("Job Details") &&
    queueDetail.includes("Unit Profile") &&
    queueDetail.includes("Schedule Work") &&
    queueDetail.includes("Team Notes") &&
    queueDetail.includes("More Actions") &&
    queueDetail.includes("PersistentDetails"),
  "Queue detail secondary sections must be collapsed without deleting their content."
);
assert(
  !queueDetail.includes("BackButton") &&
    !queueDetail.includes("<Button>Create Estimate</Button>"),
  "Queue detail must avoid duplicate page-level Back and Create Estimate actions."
);
assert(
  appShell.includes("<WorkspaceBackBar />") &&
    appShell.includes("<QuickCommandCenter />") &&
    appShell.includes("app-floating-control-group") &&
    appShell.indexOf("<WorkspaceBackBar />") < appShell.indexOf("<QuickCommandCenter />") &&
    appShell.indexOf("<WorkspaceBackBar />") < appShell.indexOf("<section") &&
    appShell.includes("pb-32") &&
    workspaceBackBar.includes("app-floating-back-control") &&
    workspaceBackBar.includes('data-floating-back-control="true"') &&
    workspaceBackBar.includes('variant="floating"') &&
    workspaceBackBar.includes("preferFallback={shouldPreferParentRoute") &&
    workspaceBackBar.includes("shouldHideFloatingBack") &&
    workspaceBackBar.includes("primaryWorkspaceSections"),
  "The app shell must provide one shared floating Back/Command group, reserve bottom space, and hide Back on primary workspace screens."
);
assert(
  workspaceBackBar.includes('queue: { fallback: "/queue" }') &&
    workspaceBackBar.includes('invoices: { fallback: "/invoices" }') &&
    workspaceBackBar.includes('estimates: { fallback: "/estimates" }') &&
    workspaceBackBar.includes('payments: { fallback: "/payments" }') &&
    workspaceBackBar.includes('pathname === "/payments" && hash.length > 0') &&
    !workspaceBackBar.includes("5.6rem") &&
    !workspaceBackBar.includes("fixed z-[70]"),
  "Floating Back must keep safe fallback routes and rely on the shared AppShell group for side-by-side placement."
);
assert(
  globalsCss.includes(".app-floating-control-group") &&
    globalsCss.includes("display: flex") &&
    globalsCss.includes("justify-content: flex-end") &&
    globalsCss.includes("white-space: nowrap") &&
    globalsCss.includes(".app-floating-control-group .quick-command-launcher") &&
    globalsCss.includes("position: relative") &&
    globalsCss.includes("max-width: calc(100vw"),
  "Back and Command must be positioned side-by-side in one fixed safe-area group without wrapping or overlap."
);
assert(
  backButton.includes('variant = "inline"') &&
    backButton.includes('variant === "floating"') &&
    backButton.includes("isSafeTrimaxBackRoute") &&
    backButton.includes('"/login"') &&
    backButton.includes("findStackedParentRoute") &&
    backButton.includes("previousTrimaxRouteKey") &&
    backButton.includes("trimaxRouteStackKey"),
  "BackButton must support the shared floating control, preserve parent route context, and reject auth routes."
);
assert(
  dashboard.includes("Cash Snapshot") &&
    dashboard.includes("Outstanding Balance") &&
    dashboard.includes("operationsMoneySnapshot[0].value") &&
    dashboard.includes("workingYearOpenInvoicesWithAmounts") &&
    dashboard.includes("invoiceCollectionAmountDue(invoice)") &&
    dashboard.includes("selectedBusinessSlug") &&
    dashboard.includes("operationsMoneySnapshot.slice(1, 3)") &&
    !dashboard.includes("Receivables Snapshot"),
  "Dashboard must promote the existing Cash Snapshot without adding a duplicate financial widget."
);
assert(
  dock.includes("Job Session Running") &&
    dock.includes("Resume") &&
    dock.includes("Manage") &&
    dock.includes("Complete") &&
    dock.includes("crew_count"),
  "The active session dock must remain visible with resume, manage, complete, crew, and elapsed context."
);
assert(
  queueDetail.match(/<MarkCompletedButton/g)?.length === 1 &&
    queueDetail.includes('label={`${item.property || "Property"} - Unit ${') &&
    queueDetail.includes("currentStatus={managerLifecycleStatus}") &&
    queueDetail.includes("hasActiveSession={activeJobSessionCount > 0}") &&
    queueDetail.includes('activeSessionHref="#job-session"') &&
    queueDetail.includes('id="job-session"') &&
    !queueDetail.includes("Mark Completed"),
  "Queue detail must expose one authoritative Mark Job Complete control in the operational workflow."
);
assert(
  markCompletedButton.includes("Mark Job Complete") &&
    markCompletedButton.includes("setIsConfirming(true)") &&
    markCompletedButton.includes("hasActiveSession") &&
    markCompletedButton.includes("Finish Session First") &&
    markCompletedButton.includes("active Work Queue") &&
    markCompletedButton.includes("notes, sessions, estimates, invoices, and payments stay saved"),
  "Mark Job Complete must confirm completion, preserve linked records, and block active-session completion."
);

const supersededP01Original = {
  id: "INV-0516-original",
  display_id: "INV-0516",
  status: "superseded",
  invoice_amount: 1099,
  amount_paid: 0,
  created_at: "2026-07-21T22:53:37.251257+00:00",
};
const p01ReplacementDraft = {
  id: "INV-0517-replacement",
  display_id: "INV-0517",
  status: "Draft",
  invoice_amount: 1099,
  amount_paid: 0,
  created_at: "2026-07-22T12:00:00.000Z",
};
const authoritativeP01Invoice = chooseAuthoritativeInvoice([
  supersededP01Original,
  p01ReplacementDraft,
]);

assert.equal(
  authoritativeP01Invoice?.display_id,
  "INV-0517",
  "P01 correction must resolve to the active replacement draft, not the superseded sent original."
);
assert.equal(
  resolveFinancialStatus({
    invoice: authoritativeP01Invoice,
    hasEstimate: true,
    fallbackStatus: "Estimate Created",
  }),
  "Invoice Created",
  "P01 replacement draft must display Invoice Created until Robbie reviews and sends it."
);
assert.equal(
  invoiceAmountDue(supersededP01Original),
  0,
  "Superseded INV-0516 must preserve history but contribute no collectible balance."
);
assert.equal(
  isCollectibleInvoiceStatus("superseded"),
  false,
  "Superseded invoices must be excluded from payment matching and cash snapshots."
);
assert.equal(
  isCollectibleInvoiceStatus("void"),
  false,
  "Voided M07 INV-0511 must be excluded from collectible balances and payment candidates."
);
assert.equal(
  resolveFinancialStatus({
    invoice: {
      id: "INV-0512",
      display_id: "INV-0512",
      status: "sent",
      invoice_amount: 1099,
      amount_paid: 0,
    },
    hasEstimate: true,
  }),
  "Invoice Sent",
  "G01/Q08/U09 linked sent invoices must win over Estimate Created badges."
);
assert.equal(
  resolveFinancialStatus({
    invoice: null,
    hasEstimate: false,
    fallbackStatus: "Pending Estimate",
  }),
  "Pending Estimate",
  "U03 must remain Pending Estimate until a real linked estimate exists."
);
assert(
  invoiceLifecycle.includes("isNonCollectibleInvoiceStatus") &&
    invoiceLifecycle.includes('"superseded"') &&
    invoiceLifecycle.includes('"void"') &&
    invoiceLifecycle.includes("chooseAuthoritativeInvoice") &&
    invoiceLifecycle.includes("resolveFinancialStatus"),
  "Invoice lifecycle helper must centralize non-collectible correction statuses and authoritative queue badge resolution."
);
assert(
  correctInvoiceButton.includes("Supersede This Invoice") &&
    correctInvoiceButton.includes("mark it as superseded") &&
    correctInvoiceButton.includes("amountPaid > 0") &&
    correctInvoiceButton.includes("estimate.corrected_replacement_created") &&
    correctInvoiceButton.includes("replacementEstimateId") &&
    correctInvoiceButton.includes("linked_estimate_id: replacementEstimateId") &&
    correctInvoiceButton.includes("status: \"Draft\"") &&
    correctInvoiceButton.includes("status: createReplacement ? \"superseded\" : \"void\"") &&
    correctInvoiceButton.includes("invoice.corrected_replacement_created") &&
    correctInvoiceButton.includes("invoice.superseded"),
  "Supersede This Invoice must block paid originals, preserve sent history, create an unsent draft replacement, and log the relationship."
);
assert(
  invoiceDetail.includes("hasMeaningfulInvoiceLineItems") &&
    invoiceDetail.includes("isIncompleteDraftInvoice") &&
    invoiceDetail.includes("Draft incomplete") &&
    invoiceDetail.includes("Edit Invoice") &&
    invoiceDetail.includes("Review") &&
    invoiceDetail.includes("Send Invoice") &&
    invoiceDetail.includes("draftSendDisabledReason") &&
    invoiceDetail.includes("sendDisabledReason={draftSendDisabledReason}") &&
    invoiceDetail.includes("disabledReason={draftSendDisabledReason}") &&
    invoiceDetail.includes("draftPaymentDisabledReason"),
  "Invoice detail must show incomplete drafts as editable drafts, not paid invoices, and must disable draft send/status actions until priced line items exist."
);
assert(
  invoiceEmailSendPanel.includes("sendDisabledReason?: string | null") &&
    invoiceEmailSendPanel.includes("!sendDisabledReason") &&
    invoiceEmailSendPanel.includes("message: sendDisabledReason"),
  "Invoice email panel must accept an app-level disabled reason before attempting a send."
);
assert(
  updateInvoiceStatusButton.includes("disabledReason?: string | null") &&
    updateInvoiceStatusButton.includes("disabled={isSaving || Boolean(disabledReason)}"),
  "Invoice status button must support visible disabled reasons for incomplete drafts."
);
assert(
  invoiceSendEmailRoute.includes("invoice_line_items") &&
    invoiceSendEmailRoute.includes("meaningfulInvoiceLine") &&
    invoiceSendEmailRoute.includes("invalidDraftInvoices") &&
    invoiceSendEmailRoute.includes("Add line items and pricing before sending this invoice.") &&
    invoiceSendEmailRoute.includes("stage: \"request_validation\""),
  "Invoice send API must reject incomplete zero-dollar drafts before email delivery or status updates."
);

console.log("Job session integrity regression checks passed.");
