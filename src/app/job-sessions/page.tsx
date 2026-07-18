import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type JobSession = {
  id: string;
  user_id: string | null;
  property_name: string | null;
  unit_label: string | null;
  queue_item_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  job_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  total_minutes: number | null;
  crew_count?: number | null;
  crew_confirmed?: boolean | null;
  labor_minutes?: number | null;
  notes: string | null;
  created_at: string | null;
};

type JobSessionBreakdown = {
  id: string;
  job_session_id: string;
  work_type: string | null;
  minutes: number | null;
};

type ActivityLog = {
  id: string;
  action: string;
  actor_email: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  paint_type: string | null;
  unit_layout: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function minutesBetween(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) {
    return 0;
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return Math.round((end - start) / 60000);
}

function formatDuration(minutes: number) {
  if (minutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function laborMinutesForSession(session: JobSession) {
  const elapsed =
    session.total_minutes ?? minutesBetween(session.started_at, session.ended_at);
  const crewCount =
    typeof session.crew_count === "number" && session.crew_count > 0
      ? session.crew_count
      : 1;

  return session.labor_minutes ?? elapsed * crewCount;
}

function workTypeIncludes(label: string, terms: string[]) {
  const normalized = label.toLowerCase();

  return terms.some((term) => normalized.includes(term));
}

function queueItemHref(businessSlug: string, queueItemId: string | null) {
  return queueItemId
    ? `/queue/${queueItemId}?business=${businessSlug}`
    : `/queue?business=${businessSlug}`;
}

function sessionLabel(session: JobSession) {
  const property = session.property_name?.trim() || "Property";
  const unit = session.unit_label?.trim();

  return unit ? `${property} - Unit ${unit}` : property;
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function dateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function daysUntil(value: string | null) {
  const date = dateValue(value);

  if (!date) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function isClosedQueueItem(item: QueueItem) {
  const status = (item.status || "").trim().toLowerCase();

  return (
    status === "completed" ||
    status === "invoiced" ||
    status === "paid" ||
    Boolean(item.completed_date)
  );
}

function normalizeWorkLabel(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function planningConfidence(sampleCount: number) {
  if (sampleCount >= 5) {
    return "High";
  }

  if (sampleCount >= 2) {
    return "Building";
  }

  if (sampleCount === 1) {
    return "Early";
  }

  return "Learning";
}

function laborActivityLabel(action: string) {
  const labels: Record<string, string> = {
    "job_session.started": "Session Started",
    "job_session.resumed": "Session Resumed",
    "job_session.stopped": "Session Stopped",
    "job_session.breakdown_saved": "Breakdown Saved",
    "job_session.breakdown_skipped": "Breakdown Skipped",
    "job_session.corrected": "Session Corrected",
    "technician.job_session_started": "Technician Started",
    "technician.job_session_resumed": "Technician Resumed",
    "technician.job_session_paused": "Technician Paused",
    "technician.job_session_stopped": "Technician Stopped",
  };

  return labels[action] ?? "Labor Activity";
}

function activityQueueHref(log: ActivityLog, businessSlug: string) {
  const queueItemId =
    log.entity_type === "queue_item" ? log.entity_id : log.details?.queueItemId;

  return typeof queueItemId === "string" && queueItemId
    ? `/queue/${queueItemId}?business=${businessSlug}`
    : `/job-sessions?business=${businessSlug}`;
}

function activityMinutes(log: ActivityLog) {
  const minutes = log.details?.totalMinutes ?? log.details?.assignedMinutes;

  if (typeof minutes === "number") {
    return minutes;
  }

  if (typeof minutes === "string") {
    const parsed = Number(minutes);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export default async function JobSessionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const selectedBusiness = businessData as Business | null;
  let sessions: JobSession[] = [];
  let breakdowns: JobSessionBreakdown[] = [];
  let queueItems: QueueItem[] = [];
  let laborActivityLogs: ActivityLog[] = [];
  let setupMessage: string | null = null;

  if (businessError) {
    console.warn("Job Sessions workspace lookup failed:", businessError.message);
    setupMessage =
      "Workspace details could not be loaded. Try signing in again, then reopen Job Sessions.";
  }

  if (selectedBusiness?.id) {
    const [
      sessionResponse,
      breakdownResponse,
      queueResponse,
      activityResponse,
    ] = await Promise.all([
      supabase
        .from("job_sessions")
        .select(
          "id, user_id, property_name, unit_label, queue_item_id, estimate_id, invoice_id, job_type, started_at, ended_at, total_minutes, crew_count, crew_confirmed, labor_minutes, notes, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("started_at", { ascending: false })
        .limit(80),
      supabase
        .from("job_session_breakdowns")
        .select("id, job_session_id, work_type, minutes")
        .eq("business_id", selectedBusiness.id),
      supabase
        .from("queue_items")
        .select(
          "id, property, unit, status, paint_type, unit_layout, ready_date, scheduled_date, completed_date"
        )
        .eq("business_id", selectedBusiness.id)
        .order("ready_date", { ascending: true, nullsFirst: false })
        .limit(40),
      supabase
        .from("activity_logs")
        .select(
          "id, action, actor_email, entity_type, entity_id, entity_label, details, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .in("action", [
          "job_session.started",
          "job_session.resumed",
          "job_session.stopped",
          "job_session.breakdown_saved",
          "job_session.breakdown_skipped",
          "job_session.corrected",
          "technician.job_session_started",
          "technician.job_session_resumed",
          "technician.job_session_paused",
          "technician.job_session_stopped",
        ])
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    if (sessionResponse.error) {
      console.warn(
        "Job Sessions could not be loaded:",
        sessionResponse.error.message
      );
      setupMessage =
        "Job Sessions are ready in the app, but the Supabase tables are not live yet. Run the Job Sessions SQL file in Supabase to unlock this workspace.";
    }

    if (breakdownResponse.error) {
      console.warn(
        "Job Session breakdowns could not be loaded:",
        breakdownResponse.error.message
      );
    }

    if (queueResponse.error) {
      console.warn(
        "Job Sessions ready work could not be loaded:",
        queueResponse.error.message
      );
    }

    if (activityResponse.error) {
      console.warn(
        "Job Sessions activity could not be loaded:",
        activityResponse.error.message
      );
    }

    sessions = (sessionResponse.data ?? []) as JobSession[];
    breakdowns = (breakdownResponse.data ?? []) as JobSessionBreakdown[];
    queueItems = (queueResponse.data ?? []) as QueueItem[];
    laborActivityLogs = (activityResponse.data ?? []) as ActivityLog[];
  }

  const breakdownSessionIds = new Set(
    breakdowns.map((breakdown) => breakdown.job_session_id)
  );
  const activeSessions = sessions.filter((session) => !session.ended_at);
  const completedSessions = sessions.filter((session) => session.ended_at);
  const hasNoSessionData = sessions.length === 0 && !setupMessage;
  const missingBreakdownSessions = completedSessions.filter(
    (session) => !breakdownSessionIds.has(session.id)
  );
  const currentMonth = monthKey(new Date());
  const monthMinutes = completedSessions.reduce((total, session) => {
    const endedAt = session.ended_at ? new Date(session.ended_at) : null;

    if (!endedAt || Number.isNaN(endedAt.getTime()) || monthKey(endedAt) !== currentMonth) {
      return total;
    }

    return total + (session.total_minutes ?? minutesBetween(session.started_at, session.ended_at));
  }, 0);
  const monthLaborMinutes = completedSessions.reduce((total, session) => {
    const endedAt = session.ended_at ? new Date(session.ended_at) : null;

    if (!endedAt || Number.isNaN(endedAt.getTime()) || monthKey(endedAt) !== currentMonth) {
      return total;
    }

    return total + laborMinutesForSession(session);
  }, 0);
  const averageCompletedMinutes =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce(
            (total, session) =>
              total +
              (session.total_minutes ??
                minutesBetween(session.started_at, session.ended_at)),
            0
          ) / completedSessions.length
        )
      : 0;
  const completedSessionAverages = Array.from(
    completedSessions.reduce((map, session) => {
      const label = session.job_type?.trim() || "General Work";
      const minutes =
        session.total_minutes ??
        minutesBetween(session.started_at, session.ended_at);

      if (minutes <= 0) {
        return map;
      }

      const current = map.get(label) ?? { count: 0, minutes: 0 };
      map.set(label, {
        count: current.count + 1,
        minutes: current.minutes + minutes,
      });

      return map;
    }, new Map<string, { count: number; minutes: number }>())
  )
    .map(([label, value]) => ({
      label,
      averageMinutes: Math.round(value.minutes / value.count),
      count: value.count,
      totalMinutes: value.minutes,
    }))
    .sort(
      (first, second) =>
        second.count - first.count ||
        second.totalMinutes - first.totalMinutes ||
        first.label.localeCompare(second.label)
    );
  const strongestLaborPattern = completedSessionAverages[0] ?? null;
  const completedAveragesByKey = new Map(
    completedSessionAverages.map((item) => [
      normalizeWorkLabel(item.label),
      item,
    ])
  );
  const propertyLaborAverages = Array.from(
    completedSessions.reduce((map, session) => {
      const label = session.property_name?.trim() || "Property";
      const minutes =
        session.total_minutes ??
        minutesBetween(session.started_at, session.ended_at);

      if (minutes <= 0) {
        return map;
      }

      const current = map.get(label) ?? { count: 0, minutes: 0 };
      map.set(label, {
        count: current.count + 1,
        minutes: current.minutes + minutes,
      });

      return map;
    }, new Map<string, { count: number; minutes: number }>())
  ).map(([label, value]) => ({
    label,
    count: value.count,
    averageMinutes: Math.round(value.minutes / value.count),
  }));
  const propertyAveragesByKey = new Map(
    propertyLaborAverages.map((item) => [normalizeWorkLabel(item.label), item])
  );
  const workTypeTotals = Array.from(
    breakdowns.reduce((map, breakdown) => {
      const label = breakdown.work_type?.trim() || "Other";
      map.set(label, (map.get(label) ?? 0) + Math.max(breakdown.minutes ?? 0, 0));
      return map;
    }, new Map<string, number>())
  )
    .map(([label, minutes]) => ({ label, minutes }))
    .filter((item) => item.minutes > 0)
    .sort((first, second) => second.minutes - first.minutes);
  const totalBreakdownMinutes = workTypeTotals.reduce(
    (total, item) => total + item.minutes,
    0
  );
  const topWorkType = workTypeTotals[0] ?? null;
  const primerBreakdownMinutes = workTypeTotals
    .filter((item) => workTypeIncludes(item.label, ["primer"]))
    .reduce((total, item) => total + item.minutes, 0);
  const cabinetBreakdownMinutes = workTypeTotals
    .filter((item) => workTypeIncludes(item.label, ["cabinet"]))
    .reduce((total, item) => total + item.minutes, 0);
  const equipmentBreakdownMinutes = workTypeTotals
    .filter((item) => workTypeIncludes(item.label, ["sprayer", "equipment"]))
    .reduce((total, item) => total + item.minutes, 0);
  const renoBreakdownMinutes =
    primerBreakdownMinutes + cabinetBreakdownMinutes + equipmentBreakdownMinutes;
  const renoBreakdownShare =
    totalBreakdownMinutes > 0
      ? Math.round((renoBreakdownMinutes / totalBreakdownMinutes) * 100)
      : 0;
  const sessionQueueItemIds = new Set(
    sessions
      .map((session) => session.queue_item_id)
      .filter((id): id is string => Boolean(id))
  );
  const readyWorkItems = queueItems
    .filter((item) => !isClosedQueueItem(item))
    .map((item) => {
      const dueInDays = daysUntil(item.ready_date);
      const hasSession = sessionQueueItemIds.has(item.id);
      const isScheduled = Boolean(item.scheduled_date);
      const score =
        (hasSession ? 100 : 0) +
        (isScheduled ? 20 : 0) +
        (dueInDays === null ? 40 : Math.max(dueInDays, -20));

      return {
        ...item,
        dueInDays,
        hasSession,
        isScheduled,
        score,
      };
    })
    .sort(
      (first, second) =>
        first.score - second.score ||
        (first.property || "").localeCompare(second.property || "") ||
        (first.unit || "").localeCompare(second.unit || "")
    )
    .slice(0, 4);
  const activeQueueItems = queueItems.filter((item) => !isClosedQueueItem(item));
  const readyWorkStats = {
    urgent: activeQueueItems.filter((item) => {
      const dueInDays = daysUntil(item.ready_date);
      return dueInDays !== null && dueInDays <= 0;
    }).length,
    unscheduled: activeQueueItems.filter((item) => !item.scheduled_date).length,
    untimed: activeQueueItems.filter((item) => !sessionQueueItemIds.has(item.id))
      .length,
  };
  const nextAction =
    activeSessions.length > 0
      ? {
          label: "Open Running Session",
          detail: "A job is currently on the clock.",
          href: queueItemHref(businessSlug, activeSessions[0].queue_item_id),
        }
      : missingBreakdownSessions.length > 0
        ? {
            label: "Finish Time Breakdown",
            detail: "Stopped labor needs rough categories.",
            href: queueItemHref(
              businessSlug,
              missingBreakdownSessions[0].queue_item_id
            ),
          }
        : {
            label: "Start From Queue",
            detail: "Open the next job and start a session when work begins.",
            href: `/queue?business=${businessSlug}&view=ready-soon`,
          };
  const fieldReadinessScore = Math.max(
    0,
    Math.min(
      100,
      72 +
        Math.min(completedSessions.length, 8) * 2 +
        (readyWorkItems.length > 0 ? 8 : 0) -
        missingBreakdownSessions.length * 10 -
        readyWorkStats.urgent * 6 -
        readyWorkStats.untimed * 3
    )
  );
  const fieldReadinessLabel =
    fieldReadinessScore >= 86
      ? "Field ready"
      : fieldReadinessScore >= 68
        ? "Ready with cleanup"
        : fieldReadinessScore >= 48
          ? "Needs attention"
          : "Needs setup";
  const fieldReadinessItems = [
    {
      label: "Start Path",
      value:
        readyWorkItems.length > 0
          ? `${readyWorkItems.length} ready`
          : "Queue clear",
      detail:
        readyWorkItems.length > 0
          ? "Open the top unit and start from its queue page."
          : "New queue work will appear here when it is added.",
      tone: readyWorkItems.length > 0 ? "emerald" : "sky",
    },
    {
      label: "Cleanup",
      value:
        missingBreakdownSessions.length > 0
          ? `${missingBreakdownSessions.length} split`
          : "Clean",
      detail:
        missingBreakdownSessions.length > 0
          ? "Stopped sessions need a rough breakdown or skip."
          : "No stopped session needs follow-up right now.",
      tone: missingBreakdownSessions.length > 0 ? "amber" : "emerald",
    },
    {
      label: "Memory",
      value:
        completedSessions.length > 0
          ? `${completedSessions.length} saved`
          : "Learning",
      detail:
        completedSessions.length > 0
          ? "Completed sessions are building real job timing."
          : "The first completed session starts labor forecasting.",
      tone: completedSessions.length > 0 ? "sky" : "amber",
    },
    {
      label: "Pressure",
      value:
        readyWorkStats.urgent > 0
          ? `${readyWorkStats.urgent} urgent`
          : `${readyWorkStats.unscheduled} unscheduled`,
      detail:
        readyWorkStats.urgent > 0
          ? "Handle overdue or due-today units before new work."
          : "Unscheduled work is the next planning risk.",
      tone: readyWorkStats.urgent > 0 ? "rose" : "sky",
    },
  ];
  const laborAdvantageLoop = [
    {
      label: "Start",
      title: readyWorkItems.length > 0 ? "Queue-ready" : "Waiting on queue",
      detail:
        readyWorkItems.length > 0
          ? `${readyWorkItems.length} job${readyWorkItems.length === 1 ? "" : "s"} can start from the queue.`
          : "New ready work will appear here automatically.",
      value: readyWorkItems.length,
      tone: readyWorkItems.length > 0 ? "emerald" : "sky",
    },
    {
      label: "Work",
      title: activeSessions.length > 0 ? "Session running" : "No active clock",
      detail:
        activeSessions.length > 0
          ? "Field time is being captured without task switching."
          : "Start once, work normally, then stop when done.",
      value: activeSessions.length,
      tone: activeSessions.length > 0 ? "emerald" : "sky",
    },
    {
      label: "Clean Up",
      title:
        missingBreakdownSessions.length > 0
          ? "Breakdown needed"
          : "Nothing waiting",
      detail:
        missingBreakdownSessions.length > 0
          ? "Stopped sessions need a rough split or intentional skip."
          : "Stopped sessions are clean right now.",
      value: missingBreakdownSessions.length,
      tone: missingBreakdownSessions.length > 0 ? "amber" : "emerald",
    },
    {
      label: "Learn",
      title:
        completedSessions.length > 0
          ? "Memory building"
          : "First session pending",
      detail:
        completedSessions.length > 0
          ? `${completedSessions.length} completed session${
              completedSessions.length === 1 ? "" : "s"
            } can guide future planning.`
          : "The first completed session starts Trimax labor memory.",
      value: completedSessions.length,
      tone: completedSessions.length > 0 ? "violet" : "amber",
    },
  ];
  const unitLaborLedger = Array.from(
    completedSessions.reduce((map, session) => {
      const label = sessionLabel(session);
      const minutes =
        session.total_minutes ??
        minutesBetween(session.started_at, session.ended_at);

      if (minutes <= 0) {
        return map;
      }

      const current = map.get(label) ?? {
        count: 0,
        lastWorkedAt: "",
        minutes: 0,
        missingBreakdowns: 0,
        queueItemId: session.queue_item_id,
      };
      const workedAt = session.ended_at ?? session.started_at ?? "";

      map.set(label, {
        count: current.count + 1,
        lastWorkedAt:
          workedAt > current.lastWorkedAt ? workedAt : current.lastWorkedAt,
        minutes: current.minutes + minutes,
        missingBreakdowns:
          current.missingBreakdowns +
          (breakdownSessionIds.has(session.id) ? 0 : 1),
        queueItemId: current.queueItemId ?? session.queue_item_id,
      });

      return map;
    }, new Map<string, { count: number; lastWorkedAt: string; minutes: number; missingBreakdowns: number; queueItemId: string | null }>())
  )
    .map(([label, value]) => ({ label, ...value }))
    .sort(
      (first, second) =>
        second.minutes - first.minutes ||
        second.count - first.count ||
        first.label.localeCompare(second.label)
    );
  const laborPlanningSignals = readyWorkItems.slice(0, 3).map((item) => {
    const jobKey = normalizeWorkLabel(item.paint_type);
    const propertyKey = normalizeWorkLabel(item.property);
    const matchedJobPattern =
      completedAveragesByKey.get(jobKey) ??
      completedSessionAverages.find((pattern) => {
        const patternKey = normalizeWorkLabel(pattern.label);
        return (
          Boolean(jobKey) &&
          (patternKey.includes(jobKey) || jobKey.includes(patternKey))
        );
      }) ??
      null;
    const propertyPattern = propertyAveragesByKey.get(propertyKey) ?? null;
    const estimatedMinutes =
      matchedJobPattern?.averageMinutes ??
      propertyPattern?.averageMinutes ??
      strongestLaborPattern?.averageMinutes ??
      0;
    const sampleCount =
      matchedJobPattern?.count ??
      propertyPattern?.count ??
      strongestLaborPattern?.count ??
      0;
    const pressure =
      item.dueInDays === null
        ? "No due date"
        : item.dueInDays < 0
          ? `${Math.abs(item.dueInDays)}d late`
          : item.dueInDays === 0
            ? "Due today"
            : `${item.dueInDays}d out`;
    const guidance =
      item.hasSession
        ? "Labor already started. Use history to compare pace."
        : estimatedMinutes > 0
          ? `Plan around ${formatDuration(estimatedMinutes)} before scheduling another tight turn.`
          : "Start one session here to teach Trimax this work pattern.";

    return {
      id: item.id,
      property: item.property || "Property",
      unit: item.unit || "Unit",
      jobType: item.paint_type || "Work",
      estimateLabel:
        estimatedMinutes > 0 ? formatDuration(estimatedMinutes) : "Learning",
      confidence: planningConfidence(sampleCount),
      pressure,
      guidance,
      href: queueItemHref(businessSlug, item.id),
    };
  });
  const laborPauseLogs = laborActivityLogs.filter(
    (log) => log.action === "technician.job_session_paused"
  );
  const laborResumeLogs = laborActivityLogs.filter(
    (log) =>
      log.action === "job_session.resumed" ||
      log.action === "technician.job_session_resumed"
  );
  const laborStopLogs = laborActivityLogs.filter(
    (log) =>
      log.action === "job_session.stopped" ||
      log.action === "technician.job_session_stopped" ||
      log.action === "technician.job_session_paused"
  );
  const skippedBreakdownLogs = laborActivityLogs.filter(
    (log) => log.action === "job_session.breakdown_skipped"
  );
  const interruptionHotspots = Array.from(
    [...laborPauseLogs, ...laborResumeLogs].reduce((map, log) => {
      const label =
        log.entity_label ||
        (typeof log.details?.queueItemId === "string"
          ? `Queue ${log.details.queueItemId}`
          : "Unassigned session");
      const current = map.get(label) ?? {
        label,
        count: 0,
        lastActivityAt: "",
        href: activityQueueHref(log, businessSlug),
      };

      map.set(label, {
        ...current,
        count: current.count + 1,
        lastActivityAt:
          (log.created_at ?? "") > current.lastActivityAt
            ? (log.created_at ?? "")
            : current.lastActivityAt,
      });

      return map;
    }, new Map<string, { label: string; count: number; lastActivityAt: string; href: string }>())
  )
    .map(([, value]) => value)
    .sort(
      (first, second) =>
        second.count - first.count ||
        second.lastActivityAt.localeCompare(first.lastActivityAt)
    )
    .slice(0, 4);
  const recentLaborActivity = laborActivityLogs.slice(0, 6);
  const laborAuditReadiness =
    laborActivityLogs.length === 0
      ? "Waiting for first session event"
      : laborPauseLogs.length > 0
        ? "Interruptions visible"
        : laborResumeLogs.length > 0
          ? "Resumes visible"
          : "Clean labor trail";

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="job-session-hub-hero rounded-3xl border border-sky-500/25 bg-gradient-to-br from-sky-500/12 via-zinc-950 to-emerald-500/10 p-5 shadow-2xl shadow-sky-950/20 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-kicker text-sm font-black uppercase tracking-[0.28em] text-sky-300">
                Job Sessions
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                Real labor time without babysitting a timer
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Start from the queue item, work normally, stop when done, then
                roughly break down the day while it is still fresh.
              </p>
            </div>

            <Link
              href={`/queue?business=${businessSlug}`}
              className="app-button-primary inline-flex rounded-2xl px-5 py-3 text-sm font-black"
            >
              Open Queue to Start
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <HubMetric
              label="Active Now"
              value={activeSessions.length}
              detail="Running sessions"
            />
            <HubMetric
              label="Elapsed Time"
              value={formatDuration(monthMinutes)}
              detail="Clock time this month"
            />
            <HubMetric
              label="Total Labor Hours"
              value={formatDuration(monthLaborMinutes)}
              detail="Person-hours this month"
            />
            <HubMetric
              label="Avg Session"
              value={formatDuration(averageCompletedMinutes)}
              detail="Completed sessions"
            />
            <HubMetric
              label="Need Breakdown"
              value={missingBreakdownSessions.length}
              detail="Review when convenient"
              urgent={missingBreakdownSessions.length > 0}
            />
          </div>

          <div className="job-session-advantage-loop job-session-step-rail mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
                  Field Time System
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  One start, one stop, useful history
                </h2>
              </div>

              <span className="job-session-advantage-badge rounded-full border px-3 py-1 text-xs font-black">
                Same-day reconstruction
              </span>
            </div>

            <div className="job-session-advantage-grid mt-4">
              {laborAdvantageLoop.map((item, index) => (
                <div
                  key={item.label}
                  data-tone={item.tone}
                  className="job-session-advantage-step"
                >
                  <span className="job-session-advantage-index">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="job-session-advantage-label">
                      {item.label}
                    </span>
                    <strong>{item.title}</strong>
                    <em>{item.detail}</em>
                  </span>
                  <span className="job-session-advantage-value">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="job-session-field-readiness mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">
                  Field Readiness
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {fieldReadinessLabel}
                </h2>
              </div>

              <div className="job-session-field-readiness-gauge">
                <span>{fieldReadinessScore}%</span>
                <div
                  aria-label={`Field readiness ${fieldReadinessScore}%`}
                  className="job-session-field-readiness-track"
                >
                  <i style={{ width: `${fieldReadinessScore}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-4">
              {fieldReadinessItems.map((item) => (
                <FieldReadinessChip key={item.label} item={item} />
              ))}
            </div>
          </div>
        </div>

        <Card className="job-session-hub-card job-session-ready-board">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-emerald-300">
                Ready Work
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Open a unit and start the field clock
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                These are live queue items that still need work attention. Open
                one, tap Start Job Session, and Trimax will keep the labor tied
                to the right unit.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ReadyWorkStat label="Urgent" value={readyWorkStats.urgent} />
                <ReadyWorkStat
                  label="Unscheduled"
                  value={readyWorkStats.unscheduled}
                />
                <ReadyWorkStat label="No labor yet" value={readyWorkStats.untimed} />
              </div>
            </div>
            <Link
              href={`/queue?business=${businessSlug}`}
              className="app-button-secondary inline-flex rounded-2xl px-4 py-2 text-sm font-black"
            >
              See Full Queue
            </Link>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            {readyWorkItems.length === 0 ? (
              <EmptyState
                title="No active queue work found"
                detail="New queue work will appear here as soon as it is added."
              />
            ) : (
              readyWorkItems.map((item, index) => (
                <ReadyWorkRow
                  key={item.id}
                  item={item}
                  rank={index + 1}
                  businessSlug={businessSlug}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="job-session-hub-card job-session-planning-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-sky-300">
                Labor Intelligence
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Plan the next work block with real history
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Trimax compares ready queue work against completed sessions so
                you can see which units have enough labor memory to guide the
                schedule.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black">
              {completedSessions.length} completed
            </span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {laborPlanningSignals.length === 0 ? (
              <EmptyState
                title="No planning signals yet"
                detail="Active queue work and completed sessions will create labor guidance here."
              />
            ) : (
              laborPlanningSignals.map((signal) => (
                <LaborPlanningSignal key={signal.id} signal={signal} />
              ))
            )}
          </div>
        </Card>

        {hasNoSessionData ? (
          <Card className="job-session-hub-card job-session-first-run-card">
            <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div>
                <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-emerald-300">
                  Ready To Use
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Your first session will unlock the dashboard
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  The system is connected now. Start from any queue item, stop
                  when the work block is done, then add a rough breakdown if it
                  is useful.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <FirstRunStep
                  number="1"
                  title="Open a queue item"
                  detail="Pick the unit you are about to work on."
                />
                <FirstRunStep
                  number="2"
                  title="Start once"
                  detail="Let the timer run while normal work happens."
                />
                <FirstRunStep
                  number="3"
                  title="Stop and split"
                  detail="Use quick percentages or skip the breakdown."
                />
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="job-session-hub-card job-session-disruption-card border-amber-300/25 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-cyan-500/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-amber-200">
                Session Disruption Trail
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {laborAuditReadiness}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Starts, pauses, resumes, stops, and breakdown choices come from
                the existing activity log, so labor analytics stay tied to the
                same audit history as the rest of Trimax.
              </p>
            </div>

            <Link
              href={`/activity?business=${businessSlug}&type=operations`}
              className="text-sm font-black text-sky-200 transition hover:text-white"
            >
              Open activity trail
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <HubMetric
              label="Pauses"
              value={laborPauseLogs.length}
              detail="Mid-work interruptions"
              urgent={laborPauseLogs.length > 0}
            />
            <HubMetric
              label="Resumes"
              value={laborResumeLogs.length}
              detail="Restarted work blocks"
              urgent={laborResumeLogs.length > 0}
            />
            <HubMetric
              label="Stops"
              value={laborStopLogs.length}
              detail="Closed or paused sessions"
            />
            <HubMetric
              label="Skipped Splits"
              value={skippedBreakdownLogs.length}
              detail="Breakdowns deferred"
              urgent={skippedBreakdownLogs.length > 0}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="job-session-disruption-panel rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                    Hotspots
                  </p>
                  <h3 className="mt-1 text-lg font-black text-white">
                    Jobs with repeated stops or resumes
                  </h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300">
                  {interruptionHotspots.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {interruptionHotspots.length === 0 ? (
                  <EmptyState
                    title="No interruption hotspots yet"
                    detail="Paused or resumed sessions will show which jobs keep getting broken up."
                  />
                ) : (
                  interruptionHotspots.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="job-session-disruption-row block rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-white">{item.label}</p>
                          <p className="mt-1 text-sm text-zinc-400">
                            Last activity {formatDateTime(item.lastActivityAt)}
                          </p>
                        </div>
                        <span className="rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1 text-sm font-black text-amber-200">
                          {item.count}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="job-session-disruption-panel rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                    Recent Trail
                  </p>
                  <h3 className="mt-1 text-lg font-black text-white">
                    Latest labor events
                  </h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300">
                  {laborActivityLogs.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {recentLaborActivity.length === 0 ? (
                  <EmptyState
                    title="No session activity yet"
                    detail="The first start, stop, pause, or breakdown event will appear here."
                  />
                ) : (
                  recentLaborActivity.map((log) => {
                    const minutes = activityMinutes(log);

                    return (
                      <Link
                        key={log.id}
                        href={activityQueueHref(log, businessSlug)}
                        className="job-session-disruption-row block rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:-translate-y-0.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                              {laborActivityLabel(log.action)}
                            </p>
                            <p className="mt-1 font-black text-white">
                              {log.entity_label ?? "Job session"}
                            </p>
                            <p className="mt-1 text-sm text-zinc-400">
                              {formatDateTime(log.created_at)}
                              {log.actor_email ? ` by ${log.actor_email}` : ""}
                            </p>
                          </div>
                          {minutes > 0 ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black text-zinc-200">
                              {formatDuration(minutes)}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="job-session-hub-card job-session-next-card border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-sky-300">
                  Next Move
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {nextAction.label}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {nextAction.detail}
                </p>
              </div>

              <Link
                href={nextAction.href}
                className="app-button-primary inline-flex rounded-2xl px-5 py-3 text-sm font-black"
              >
                Continue
              </Link>
            </div>
          </Card>

          <Card className="job-session-hub-card job-session-mix-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-emerald-300">
                  Time Mix
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {topWorkType
                    ? `${topWorkType.label} is the biggest bucket`
                    : "Breakdowns will build the labor picture"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Once sessions are broken down, Trimax can show where real
                  labor time is going without making anyone switch tasks all
                  day.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black">
                {formatDuration(totalBreakdownMinutes)}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {workTypeTotals.length === 0 ? (
                <EmptyState
                  title="No labor categories yet"
                  detail="Breakdown is optional. One saved split will show prep, primer, paint, material run, and admin time here."
                />
              ) : (
                workTypeTotals.slice(0, 5).map((item) => {
                  const width =
                    totalBreakdownMinutes > 0
                      ? Math.max((item.minutes / totalBreakdownMinutes) * 100, 4)
                      : 0;

                  return (
                    <div key={item.label} className="job-session-mix-row">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <p className="font-black">{item.label}</p>
                        <p className="font-black text-zinc-300">
                          {formatDuration(item.minutes)}
                        </p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-sky-300 to-blue-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {renoBreakdownMinutes > 0 ? (
              <div className="mt-4 rounded-2xl border border-violet-300/25 bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">
                      Reno Labor Signal
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-300">
                      Primer, cabinet, and equipment time are now visible in the
                      labor mix.
                    </p>
                  </div>
                  <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1 text-sm font-black text-violet-100">
                    {renoBreakdownShare}% reno-specific
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Primer", primerBreakdownMinutes],
                    ["Cabinets", cabinetBreakdownMinutes],
                    ["Equipment", equipmentBreakdownMinutes],
                  ].map(([label, minutes]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3"
                    >
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                        {label}
                      </p>
                      <p className="mt-2 text-lg font-black text-white">
                        {formatDuration(Number(minutes))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        {setupMessage ? (
          <Card className="job-session-setup-card border-amber-400/35 bg-amber-500/10">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-amber-200">
              Setup Needed
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Supabase needs the Job Sessions SQL
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-300">
              {setupMessage} The file is saved in Trimax at{" "}
              <span className="font-black text-amber-100">
                supabase/sql/2026-06-18-job-sessions.sql
              </span>
              . Paste and run that in the Supabase SQL editor once.
            </p>
          </Card>
        ) : null}

        <Card className="job-session-hub-card job-session-forecast-card">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-sky-300">
                Labor Forecast
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {strongestLaborPattern
                  ? `${strongestLaborPattern.label} usually runs ${formatDuration(
                      strongestLaborPattern.averageMinutes
                    )}`
                  : "Trimax is learning your labor rhythm"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Completed sessions become simple planning guidance, so future
                jobs can be scheduled with real Trimax history instead of
                guesswork.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {completedSessionAverages.length === 0 ? (
                <EmptyState
                  title="No completed labor history yet"
                  detail="Stop a few sessions and Trimax will begin showing typical job times."
                />
              ) : (
                completedSessionAverages.slice(0, 4).map((item) => (
                  <div key={item.label} className="job-session-forecast-row">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-200">
                        {item.label}
                      </p>
                      <p className="mt-2 text-2xl font-black">
                        {formatDuration(item.averageMinutes)}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black">
                      {item.count}x
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="job-session-hub-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-sky-300">
                  Field Clock
                </p>
                <h2 className="mt-2 text-2xl font-black">Active sessions</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Each person gets their own session, so multiple people can
                  work the same unit without mixing up labor time.
                </p>
              </div>
              <Link
                href={`/queue?business=${businessSlug}&view=ready-soon`}
                className="app-button-secondary inline-flex rounded-2xl px-4 py-2 text-sm font-black"
              >
                Find Ready Work
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {activeSessions.length === 0 ? (
                  <EmptyState
                    title="No one is clocked into a job right now"
                    detail="Open a queue item when work begins; each person keeps their own session."
                  />
              ) : (
                activeSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    businessSlug={businessSlug}
                    highlight
                  />
                ))
              )}
            </div>
          </Card>

          <Card className="job-session-hub-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-amber-300">
                  Follow Up
                </p>
                <h2 className="mt-2 text-2xl font-black">Breakdowns to finish</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  These sessions are stopped, but still need a rough time split
                  or an intentional skip.
                </p>
              </div>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm font-black text-amber-200">
                {missingBreakdownSessions.length}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {missingBreakdownSessions.length === 0 ? (
                <EmptyState
                  title="All stopped sessions are clean"
                  detail="Nothing needs a labor breakdown right now."
                />
              ) : (
                missingBreakdownSessions.slice(0, 5).map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    businessSlug={businessSlug}
                  />
                ))
              )}
            </div>
          </Card>
        </div>

        <Card className="job-session-hub-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-sky-300">
                Unit Labor Ledger
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Where field time is accumulating
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                A quick way to recall which jobs have the most real labor
                attached and whether any stopped sessions still need cleanup.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black">
              {unitLaborLedger.length} jobs
            </span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {unitLaborLedger.length === 0 ? (
                  <EmptyState
                    title="No completed unit labor yet"
                    detail="Once a job session is stopped, each unit keeps its own labor memory here."
                  />
            ) : (
              unitLaborLedger.slice(0, 6).map((item) => (
                <Link
                  key={item.label}
                  href={queueItemHref(businessSlug, item.queueItemId)}
                  className="job-session-ledger-row rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{item.label}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        Last worked {formatDateTime(item.lastWorkedAt)}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black">
                      {formatDuration(item.minutes)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300">
                      {item.count} session{item.count === 1 ? "" : "s"}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-black ${
                        item.missingBreakdowns > 0
                          ? "border-amber-300/35 bg-amber-300/10 text-amber-200"
                          : "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
                      }`}
                    >
                      {item.missingBreakdowns > 0
                        ? `${item.missingBreakdowns} to break down`
                        : "Clean"}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="job-session-hub-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker text-sm font-black uppercase tracking-[0.24em] text-emerald-300">
                Labor Memory
              </p>
              <h2 className="mt-2 text-2xl font-black">Recent job sessions</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                A simple audit-friendly view of recent field labor tied back to
                queue work, estimates, and invoices when available.
              </p>
            </div>

            <Link
              href={`/reports?business=${businessSlug}#labor-intelligence`}
              className="text-sm font-black text-sky-200 transition hover:text-white"
            >
              Open labor reports
            </Link>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {sessions.length === 0 ? (
                <EmptyState
                  title="No saved sessions yet"
                  detail="Start from a queue item and the first saved session will appear here."
                />
            ) : (
              sessions.slice(0, 8).map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  businessSlug={businessSlug}
                  hasBreakdown={breakdownSessionIds.has(session.id)}
                />
              ))
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function HubMetric({
  label,
  value,
  detail,
  urgent = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  urgent?: boolean;
}) {
  return (
    <div
      data-urgent={urgent ? "true" : "false"}
      className={`job-session-hub-metric rounded-2xl border p-4 ${
        urgent
          ? "border-amber-300/35 bg-amber-300/10"
          : "border-white/10 bg-black/25"
      }`}
    >
      <span className="job-session-hub-metric-accent" />
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm text-zinc-400">{detail}</p>
    </div>
  );
}

function FirstRunStep({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="job-session-first-run-step rounded-2xl border border-white/10 bg-black/25 p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-sm font-black text-emerald-200">
        {number}
      </span>
      <p className="mt-3 font-black text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-400">{detail}</p>
    </div>
  );
}

function ReadyWorkStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span className="job-session-ready-stat inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-200">
      <span className="text-emerald-200">{value}</span>
      {label}
    </span>
  );
}

function FieldReadinessChip({
  item,
}: {
  item: {
    label: string;
    value: string;
    detail: string;
    tone: string;
  };
}) {
  return (
    <div
      className="job-session-field-readiness-chip rounded-2xl border p-3"
      data-tone={item.tone}
    >
      <p className="text-[0.68rem] font-black uppercase tracking-[0.18em]">
        {item.label}
      </p>
      <p className="mt-2 text-xl font-black">{item.value}</p>
      <p className="mt-1 text-xs leading-5">{item.detail}</p>
    </div>
  );
}

function ReadyWorkRow({
  item,
  rank,
  businessSlug,
}: {
  item: QueueItem & {
    dueInDays: number | null;
    hasSession: boolean;
    isScheduled: boolean;
  };
  rank: number;
  businessSlug: string;
}) {
  const dueLabel =
    item.dueInDays === null
      ? "No paint due"
      : item.dueInDays < 0
        ? `${Math.abs(item.dueInDays)}d late`
        : item.dueInDays === 0
          ? "Due today"
          : `${item.dueInDays}d out`;
  const statusLabel = item.hasSession
    ? "Has labor"
    : item.isScheduled
      ? "Scheduled"
      : "Ready";
  const startReason =
    item.hasSession
      ? "Labor already started"
      : item.dueInDays !== null && item.dueInDays < 0
        ? "Late work first"
        : item.dueInDays === 0
          ? "Due today"
          : !item.isScheduled
            ? "Needs schedule"
            : "Ready to track";

  return (
    <Link
      href={queueItemHref(businessSlug, item.id)}
      aria-label={`Open ${item.property || "job"} ${item.unit || "unit"} to start or review a job session`}
      className="job-session-ready-row rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="job-session-ready-rank flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-300/10 text-sm font-black text-emerald-200">
            {rank}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">
              {item.property || "Property"}
            </p>
            <p className="mt-1 text-3xl font-black">{item.unit || "Unit"}</p>
          </div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${
            item.dueInDays !== null && item.dueInDays <= 1
              ? "border-amber-300/35 bg-amber-300/10 text-amber-200"
              : "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
          }`}
        >
          {dueLabel}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-zinc-400">
        <p className="truncate">
          {item.paint_type || "Paint work"}{" "}
          {item.unit_layout ? `/ ${item.unit_layout}` : ""}
        </p>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
          {startReason}
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300">
            {statusLabel}
          </span>
          {item.status ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300">
              {item.status}
            </span>
          ) : null}
        </div>
      </div>

      <div className="job-session-ready-row-cta mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <span>Open unit</span>
        <strong>Session controls inside</strong>
      </div>
    </Link>
  );
}

function LaborPlanningSignal({
  signal,
}: {
  signal: {
    href: string;
    property: string;
    unit: string;
    jobType: string;
    estimateLabel: string;
    confidence: string;
    pressure: string;
    guidance: string;
  };
}) {
  const confidenceTone =
    signal.confidence === "High"
      ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
      : signal.confidence === "Building"
        ? "border-sky-300/35 bg-sky-300/10 text-sky-200"
        : "border-amber-300/35 bg-amber-300/10 text-amber-200";

  return (
    <Link
      href={signal.href}
      className="job-session-planning-signal rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">
            {signal.property}
          </p>
          <p className="mt-1 text-3xl font-black">{signal.unit}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${confidenceTone}`}
        >
          {signal.confidence}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
            Expected
          </p>
          <p className="mt-1 text-xl font-black">{signal.estimateLabel}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
            Schedule
          </p>
          <p className="mt-1 text-xl font-black">{signal.pressure}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-400">{signal.guidance}</p>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-sky-200">
        {signal.jobType}
      </p>
    </Link>
  );
}

function SessionRow({
  session,
  businessSlug,
  highlight = false,
  hasBreakdown = false,
}: {
  session: JobSession;
  businessSlug: string;
  highlight?: boolean;
  hasBreakdown?: boolean;
}) {
  const minutes =
    session.total_minutes ?? minutesBetween(session.started_at, session.ended_at);
  const laborMinutes = laborMinutesForSession(session);
  const crewCount =
    typeof session.crew_count === "number" && session.crew_count > 0
      ? session.crew_count
      : 1;
  const isActive = !session.ended_at;

  return (
    <Link
      href={queueItemHref(businessSlug, session.queue_item_id)}
      className={`job-session-hub-row block rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
        highlight
          ? "border-emerald-300/35 bg-emerald-300/10"
          : "border-white/10 bg-black/25"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-white">{sessionLabel(session)}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {session.job_type || "Job"} / Started {formatDateTime(session.started_at)}
          </p>
          {session.notes ? (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-300">
              {session.notes}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
              isActive
                ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
                : hasBreakdown
                  ? "border-sky-300/35 bg-sky-300/10 text-sky-200"
                  : "border-amber-300/35 bg-amber-300/10 text-amber-200"
            }`}
          >
            {isActive ? "Running" : hasBreakdown ? "Broken Down" : "Needs Split"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black">
            Elapsed {formatDuration(minutes)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black">
            Crew {crewCount}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-black">
            Labor {formatDuration(laborMinutes)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="job-session-empty-state rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
      <p className="font-black text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-400">{detail}</p>
    </div>
  );
}
