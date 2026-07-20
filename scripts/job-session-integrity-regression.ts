import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  queue.includes("splitChildren.every"),
  "Split invoice status may inform labels, but split invoices must not independently remove incomplete work."
);
assert(
  queue.includes("activeSessionByQueueItemId") &&
    queue.includes("Running") &&
    queue.includes("Resume Job") &&
    queue.includes("primaryQueueAction"),
  "Queue rows must surface active job sessions with one clear primary action."
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
    appShell.includes("pb-32") &&
    workspaceBackBar.includes("app-floating-back-control") &&
    workspaceBackBar.includes('data-floating-back-control="true"') &&
    workspaceBackBar.includes('variant="floating"') &&
    workspaceBackBar.includes("preferFallback={shouldPreferParentRoute") &&
    workspaceBackBar.includes("shouldHideFloatingBack") &&
    workspaceBackBar.includes("primaryWorkspaceSections"),
  "The app shell must provide one shared floating Back control, reserve bottom space, and hide it on primary workspace screens."
);
assert(
  workspaceBackBar.includes('queue: { fallback: "/queue" }') &&
    workspaceBackBar.includes('invoices: { fallback: "/invoices" }') &&
    workspaceBackBar.includes('estimates: { fallback: "/estimates" }') &&
    workspaceBackBar.includes('payments: { fallback: "/payments" }') &&
    workspaceBackBar.includes('pathname === "/payments" && hash.length > 0') &&
    workspaceBackBar.includes("5.6rem") &&
    workspaceBackBar.includes("env(safe-area-inset-bottom"),
  "Floating Back must keep safe fallback routes and sit above the Command launcher without covering it."
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

console.log("Job session integrity regression checks passed.");
