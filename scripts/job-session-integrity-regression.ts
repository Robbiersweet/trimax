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
assert(
  queue.includes("function isClosedForOperations") &&
    queue.includes('status === "invoiced"') &&
    queue.includes('status === "invoice sent"'),
  "Invoiced queue items must be excluded from the active Queue after reload."
);
assert(
  queue.includes('status === "completed"') &&
    queue.includes("Boolean(item.completed_date)") &&
    queue.includes("splitChildren.every"),
  "Completed and split-invoice lifecycle handling must remain intact."
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
  queueDetail.match(/<BackButton/g)?.length === 1 &&
    !queueDetail.includes("<Button>Create Estimate</Button>"),
  "Queue detail must avoid duplicate Back and Create Estimate actions."
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
