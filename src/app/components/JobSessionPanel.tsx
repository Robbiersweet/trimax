"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";

const WORK_TYPES = [
  "Prep",
  "Paint",
  "Cabinets",
  "Cleaning",
  "Material Run",
  "Inspection",
  "Admin",
  "Touch Ups",
  "Other",
] as const;

type JobSession = {
  id: string;
  business_id: string;
  user_id: string;
  property_name: string | null;
  unit_label: string | null;
  queue_item_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  job_type: string | null;
  started_at: string;
  ended_at: string | null;
  total_minutes: number | null;
  notes: string | null;
  created_at: string | null;
};

type JobSessionBreakdown = {
  id: string;
  job_session_id: string;
  work_type: string;
  minutes: number;
  percentage: number | null;
  notes: string | null;
  created_at: string | null;
};

type BreakdownDraft = {
  workType: string;
  minutes: string;
  percentage: string;
  notes: string;
};

type JobSessionPanelProps = {
  businessId: string;
  businessSlug?: string | null;
  propertyName: string | null;
  unitLabel: string | null;
  queueItemId: string;
  estimateId?: string | null;
  invoiceId?: string | null;
  jobType?: string | null;
};

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(Math.round(minutes), 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;

  if (hours <= 0) {
    return `${remainder}m`;
  }

  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
}

function minutesBetween(startedAt: string, endedAt?: string | null) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }

  return Math.max(Math.round((end - start) / 60000), 0);
}

function formatTime(value: string | null | undefined) {
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

function blankBreakdown(): BreakdownDraft {
  return {
    workType: "Prep",
    minutes: "",
    percentage: "",
    notes: "",
  };
}

function defaultBreakdownDrafts(jobType?: string | null): BreakdownDraft[] {
  const normalized = (jobType ?? "").toLowerCase();

  if (normalized.includes("cabinet")) {
    return [
      { workType: "Prep", minutes: "", percentage: "20", notes: "" },
      { workType: "Cabinets", minutes: "", percentage: "70", notes: "" },
      { workType: "Touch Ups", minutes: "", percentage: "10", notes: "" },
    ];
  }

  if (normalized.includes("clean")) {
    return [
      { workType: "Cleaning", minutes: "", percentage: "80", notes: "" },
      { workType: "Inspection", minutes: "", percentage: "20", notes: "" },
    ];
  }

  if (normalized.includes("admin") || normalized.includes("estimate")) {
    return [
      { workType: "Admin", minutes: "", percentage: "100", notes: "" },
    ];
  }

  return [
    { workType: "Prep", minutes: "", percentage: "15", notes: "" },
    { workType: "Paint", minutes: "", percentage: "75", notes: "" },
    { workType: "Touch Ups", minutes: "", percentage: "10", notes: "" },
  ];
}

export default function JobSessionPanel({
  businessId,
  businessSlug,
  propertyName,
  unitLabel,
  queueItemId,
  estimateId,
  invoiceId,
  jobType,
}: JobSessionPanelProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<JobSession | null>(null);
  const [otherActiveSession, setOtherActiveSession] =
    useState<JobSession | null>(null);
  const [sessions, setSessions] = useState<JobSession[]>([]);
  const [businessSessions, setBusinessSessions] = useState<JobSession[]>([]);
  const [breakdowns, setBreakdowns] = useState<JobSessionBreakdown[]>([]);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [showStartModal, setShowStartModal] = useState(false);
  const [jobTypeDraft, setJobTypeDraft] = useState(jobType || "Paint");
  const [notesDraft, setNotesDraft] = useState("");
  const [stoppedSession, setStoppedSession] = useState<JobSession | null>(null);
  const [breakdownDrafts, setBreakdownDrafts] = useState<BreakdownDraft[]>([
    blankBreakdown(),
  ]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);

  const displayJobType = jobTypeDraft || jobType || "Paint";

  async function loadSessions(
    currentUserId?: string | null,
    options?: { preserveMessage?: boolean }
  ) {
    if (!options?.preserveMessage) {
      setMessage(null);
    }

    let activeAnywhere: JobSession | null = null;

    if (currentUserId) {
      const { data: activeData, error: activeError } = await supabase
        .from("job_sessions")
        .select(
          "id, business_id, user_id, property_name, unit_label, queue_item_id, estimate_id, invoice_id, job_type, started_at, ended_at, total_minutes, notes, created_at"
        )
        .eq("business_id", businessId)
        .eq("user_id", currentUserId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeError) {
        activeAnywhere = activeData as JobSession | null;
      }
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from("job_sessions")
      .select(
        "id, business_id, user_id, property_name, unit_label, queue_item_id, estimate_id, invoice_id, job_type, started_at, ended_at, total_minutes, notes, created_at"
      )
      .eq("business_id", businessId)
      .eq("queue_item_id", queueItemId)
      .order("started_at", { ascending: false })
      .limit(20);

    if (sessionError) {
      console.warn("Job sessions could not be loaded:", sessionError.message);
      setSetupMissing(true);
      setMessage(
        "Job Sessions need the new Supabase SQL before time tracking can save."
      );
      return;
    }

    const loadedSessions = (sessionData ?? []) as JobSession[];
    const loadedActive =
      loadedSessions.find(
        (session) =>
          !session.ended_at &&
          (!currentUserId || session.user_id === currentUserId)
      ) ?? null;

    setSetupMissing(false);
    setSessions(loadedSessions);
    setActiveSession(loadedActive ?? null);
    setOtherActiveSession(
      activeAnywhere && activeAnywhere.queue_item_id !== queueItemId
        ? activeAnywhere
        : null
    );
    setElapsedMinutes(
      loadedActive
        ? minutesBetween(loadedActive.started_at)
        : activeAnywhere
          ? minutesBetween(activeAnywhere.started_at)
          : 0
    );

    const { data: businessSessionData, error: businessSessionError } =
      await supabase
        .from("job_sessions")
        .select(
          "id, business_id, user_id, property_name, unit_label, queue_item_id, estimate_id, invoice_id, job_type, started_at, ended_at, total_minutes, notes, created_at"
        )
        .eq("business_id", businessId)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(100);

    if (!businessSessionError) {
      setBusinessSessions((businessSessionData ?? []) as JobSession[]);
    }

    const sessionIds = loadedSessions.map((session) => session.id);

    if (sessionIds.length === 0) {
      setBreakdowns([]);
      return;
    }

    const { data: breakdownData, error: breakdownError } = await supabase
      .from("job_session_breakdowns")
      .select("id, job_session_id, work_type, minutes, percentage, notes, created_at")
      .eq("business_id", businessId)
      .in("job_session_id", sessionIds);

    if (breakdownError) {
      console.warn(
        "Job session breakdowns could not be loaded:",
        breakdownError.message
      );
      setBreakdowns([]);
      return;
    }

    setBreakdowns((breakdownData ?? []) as JobSessionBreakdown[]);
  }

  useEffect(() => {
    let isActive = true;

    async function load() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;

      if (!isActive) {
        return;
      }

      setUserId(currentUserId);
      await loadSessions(currentUserId);
    }

    load();

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, queueItemId]);

  useEffect(() => {
    const timerSession = activeSession ?? otherActiveSession;

    if (!timerSession) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedMinutes(minutesBetween(timerSession.started_at));
    }, 30000);

    return () => window.clearInterval(interval);
  }, [activeSession, otherActiveSession]);

  const breakdownTotals = useMemo(() => {
    const total = stoppedSession?.total_minutes ?? 0;
    const effectiveMinutes = breakdownDrafts.reduce((sum, draft) => {
      const minutes = Number(draft.minutes);
      const percentage = Number(draft.percentage);

      if (Number.isFinite(minutes) && minutes > 0) {
        return sum + minutes;
      }

      if (Number.isFinite(percentage) && percentage > 0 && total > 0) {
        return sum + Math.round((percentage / 100) * total);
      }

      return sum;
    }, 0);

    const tolerance = Math.max(5, Math.round(total * 0.05));
    const variance = effectiveMinutes - total;
    const remainingMinutes = Math.max(total - effectiveMinutes, 0);
    const overMinutes = Math.max(effectiveMinutes - total, 0);
    const statusLabel =
      total === 0
        ? "Ready"
        : Math.abs(variance) <= tolerance
          ? "Close enough"
          : variance < 0
            ? `${formatDuration(remainingMinutes)} left`
            : `${formatDuration(overMinutes)} over`;

    return {
      effectiveMinutes,
      isClose: total === 0 || Math.abs(effectiveMinutes - total) <= tolerance,
      overMinutes,
      remainingMinutes,
      statusLabel,
    };
  }, [breakdownDrafts, stoppedSession?.total_minutes]);

  async function startSession() {
    if (!userId) {
      setMessage("Sign in again before starting a job session.");
      return;
    }

    setIsBusy(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("job_sessions")
      .insert({
        business_id: businessId,
        user_id: userId,
        property_name: propertyName,
        unit_label: unitLabel,
        queue_item_id: queueItemId,
        estimate_id: estimateId ?? null,
        invoice_id: invoiceId ?? null,
        job_type: jobTypeDraft || "General",
        started_at: new Date().toISOString(),
        notes: notesDraft.trim() || null,
      })
      .select()
      .single();

    setIsBusy(false);

    if (error) {
      console.warn("Job session could not be started:", error.message);
      setMessage(
        error.message.includes("duplicate")
          ? "You already have an active session. Stop it before starting another one."
          : "Job session could not be started yet."
      );
      return;
    }

    setShowStartModal(false);
    setNotesDraft("");
    setActiveSession(data as JobSession);
    await logActivity({
      businessId,
      action: "job_session.started",
      entityType: "queue_item",
      entityId: queueItemId,
      entityLabel: `${propertyName || "Property"}${
        unitLabel ? ` / Unit ${unitLabel}` : ""
      }`,
      details: {
        jobSessionId: (data as JobSession).id,
        jobType: (data as JobSession).job_type,
        startedAt: (data as JobSession).started_at,
        notes: (data as JobSession).notes,
      },
    });
    await loadSessions(userId);
  }

  async function stopSession() {
    if (!activeSession) {
      return;
    }

    setIsBusy(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("job_sessions")
      .update({
        ended_at: new Date().toISOString(),
      })
      .eq("id", activeSession.id)
      .eq("business_id", businessId)
      .select()
      .single();

    setIsBusy(false);

    if (error) {
      console.warn("Job session could not be stopped:", error.message);
      setMessage("Job session could not be stopped yet.");
      return;
    }

    const stopped = data as JobSession;
    setActiveSession(null);
    setStoppedSession(stopped);
    setBreakdownDrafts(defaultBreakdownDrafts(stopped.job_type));
    await logActivity({
      businessId,
      action: "job_session.stopped",
      entityType: "queue_item",
      entityId: queueItemId,
      entityLabel: `${propertyName || "Property"}${
        unitLabel ? ` / Unit ${unitLabel}` : ""
      }`,
      details: {
        jobSessionId: stopped.id,
        jobType: stopped.job_type,
        startedAt: stopped.started_at,
        endedAt: stopped.ended_at,
        totalMinutes: stopped.total_minutes,
      },
    });
    await loadSessions(userId);
  }

  async function saveBreakdown(skip = false) {
    if (!stoppedSession) {
      return;
    }

    if (skip) {
      setStoppedSession(null);
      setMessage("Session saved. Breakdown skipped for now.");
      await logActivity({
        businessId,
        action: "job_session.breakdown_skipped",
        entityType: "queue_item",
        entityId: queueItemId,
        entityLabel: `${propertyName || "Property"}${
          unitLabel ? ` / Unit ${unitLabel}` : ""
        }`,
        details: {
          jobSessionId: stoppedSession.id,
          jobType: stoppedSession.job_type,
          totalMinutes: stoppedSession.total_minutes,
        },
      });
      await loadSessions(userId, { preserveMessage: true });
      return;
    }

    if (!breakdownTotals.isClose) {
      setMessage(
        "Breakdown should roughly match the total session time before saving."
      );
      return;
    }

    const total = stoppedSession.total_minutes ?? 0;
    const rows = breakdownDrafts
      .map((draft) => {
        const minutes = Number(draft.minutes);
        const percentage = Number(draft.percentage);
        const effectiveMinutes =
          Number.isFinite(minutes) && minutes > 0
            ? Math.round(minutes)
            : Number.isFinite(percentage) && percentage > 0 && total > 0
              ? Math.round((percentage / 100) * total)
              : 0;

        return {
          business_id: businessId,
          job_session_id: stoppedSession.id,
          work_type: draft.workType,
          minutes: effectiveMinutes,
          percentage:
            Number.isFinite(percentage) && percentage > 0
              ? percentage
              : total > 0 && effectiveMinutes > 0
                ? Math.round((effectiveMinutes / total) * 1000) / 10
                : null,
          notes: draft.notes.trim() || null,
        };
      })
      .filter((row) => row.minutes > 0 || row.notes);

    if (rows.length === 0) {
      setMessage("Add at least one breakdown row, or skip the breakdown.");
      return;
    }

    setIsBusy(true);
    setMessage(null);

    const { error } = await supabase
      .from("job_session_breakdowns")
      .insert(rows);

    setIsBusy(false);

    if (error) {
      console.warn("Job session breakdown could not be saved:", error.message);
      setMessage("Breakdown could not be saved yet.");
      return;
    }

    setStoppedSession(null);
    setMessage("Session and breakdown saved.");
    await logActivity({
      businessId,
      action: "job_session.breakdown_saved",
      entityType: "queue_item",
      entityId: queueItemId,
      entityLabel: `${propertyName || "Property"}${
        unitLabel ? ` / Unit ${unitLabel}` : ""
      }`,
      details: {
        jobSessionId: stoppedSession.id,
        jobType: stoppedSession.job_type,
        totalMinutes: stoppedSession.total_minutes,
        assignedMinutes: breakdownTotals.effectiveMinutes,
        workTypes: rows.map((row) => row.work_type).join(", "),
      },
    });
    await loadSessions(userId, { preserveMessage: true });
  }

  function applyBreakdownPreset(
    preset: "paint" | "cabinet" | "material" | "admin"
  ) {
    if (preset === "paint") {
      setBreakdownDrafts([
        { workType: "Prep", minutes: "", percentage: "15", notes: "" },
        { workType: "Paint", minutes: "", percentage: "75", notes: "" },
        { workType: "Touch Ups", minutes: "", percentage: "10", notes: "" },
      ]);
      return;
    }

    if (preset === "cabinet") {
      setBreakdownDrafts([
        { workType: "Prep", minutes: "", percentage: "20", notes: "" },
        { workType: "Cabinets", minutes: "", percentage: "70", notes: "" },
        { workType: "Touch Ups", minutes: "", percentage: "10", notes: "" },
      ]);
      return;
    }

    if (preset === "material") {
      setBreakdownDrafts([
        { workType: "Material Run", minutes: "", percentage: "100", notes: "" },
      ]);
      return;
    }

    setBreakdownDrafts([
      { workType: "Admin", minutes: "", percentage: "100", notes: "" },
    ]);
  }

  function updateBreakdown(index: number, field: keyof BreakdownDraft, value: string) {
    setBreakdownDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft
      )
    );
  }

  function openBreakdownForSession(session: JobSession) {
    setMessage(null);
    setStoppedSession(session);
    setBreakdownDrafts(defaultBreakdownDrafts(session.job_type));
  }

  const breakdownBySession = useMemo(() => {
    const map = new Map<string, JobSessionBreakdown[]>();

    breakdowns.forEach((breakdown) => {
      const current = map.get(breakdown.job_session_id) ?? [];
      current.push(breakdown);
      map.set(breakdown.job_session_id, current);
    });

    return map;
  }, [breakdowns]);

  const sessionSummary = useMemo(() => {
    const completedSessions = sessions.filter((session) => session.ended_at);
    const completedMinutes = completedSessions.reduce(
      (total, session) =>
        total +
        Math.max(
          session.total_minutes ??
            minutesBetween(session.started_at, session.ended_at),
          0
        ),
      0
    );
    const missingBreakdownCount = completedSessions.filter(
      (session) => (breakdownBySession.get(session.id) ?? []).length === 0
    ).length;
    const workerCount = new Set(sessions.map((session) => session.user_id)).size;
    const latestSession = sessions[0] ?? null;

    return {
      completedMinutes,
      missingBreakdownCount,
      workerCount,
      latestSession,
    };
  }, [breakdownBySession, sessions]);

  const laborGuide = useMemo(() => {
    const normalizedJobType = displayJobType.trim().toLowerCase();
    const completedBusinessSessions = businessSessions.filter(
      (session) => session.ended_at
    );
    const matchingSessions = completedBusinessSessions.filter(
      (session) =>
        (session.job_type || "General").trim().toLowerCase() ===
        normalizedJobType
    );
    const sourceSessions =
      matchingSessions.length > 0 ? matchingSessions : completedBusinessSessions;
    const averageMinutes =
      sourceSessions.length > 0
        ? Math.round(
            sourceSessions.reduce(
              (total, session) =>
                total +
                Math.max(
                  session.total_minutes ??
                    minutesBetween(session.started_at, session.ended_at),
                  0
                ),
              0
            ) / sourceSessions.length
          )
        : 0;
    const remainingMinutes =
      averageMinutes > 0
        ? Math.max(averageMinutes - sessionSummary.completedMinutes, 0)
        : 0;
    const overMinutes =
      averageMinutes > 0
        ? Math.max(sessionSummary.completedMinutes - averageMinutes, 0)
        : 0;
    const paceLabel =
      averageMinutes <= 0
        ? "Learning"
        : overMinutes > 0
          ? `${formatDuration(overMinutes)} over`
          : remainingMinutes > 0
            ? "On pace"
            : "At target";
    const progressPercent =
      averageMinutes > 0
        ? Math.min(
            Math.round((sessionSummary.completedMinutes / averageMinutes) * 100),
            140
          )
        : 0;

    return {
      averageMinutes,
      overMinutes,
      paceLabel,
      progressPercent,
      remainingMinutes,
      sampleCount: sourceSessions.length,
      matchedJobType: matchingSessions.length > 0,
    };
  }, [businessSessions, displayJobType, sessionSummary.completedMinutes]);

  const activeElsewhereHref = otherActiveSession?.queue_item_id
    ? `/queue/${otherActiveSession.queue_item_id}?business=${
        businessSlug ?? "rnl-creations"
      }`
    : `/queue?business=${businessSlug ?? "rnl-creations"}`;

  return (
    <section className="job-session-panel rounded-3xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/10 p-4 shadow-2xl shadow-sky-950/20 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
            Job Sessions
          </p>
          <h2 className="mt-2 text-2xl font-black">Track real labor time</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
            Start once when work begins, stop when finished, then optionally
            split the time into rough categories. No GPS, no surveillance, no
            constant switching.
          </p>
        </div>

        {!activeSession ? (
          <div className="job-session-start-actions grid gap-2 sm:grid-cols-2 lg:min-w-[22rem]">
            <button
              className="app-button-primary rounded-2xl px-5 py-4 text-base font-black"
              disabled={setupMissing || isBusy || Boolean(otherActiveSession)}
              onClick={startSession}
              type="button"
            >
              Start {displayJobType} Session
            </button>
            <button
              className="app-button-secondary rounded-2xl px-5 py-4 text-base font-black"
              disabled={setupMissing || isBusy || Boolean(otherActiveSession)}
              onClick={() => setShowStartModal(true)}
              type="button"
            >
              Options
            </button>
          </div>
        ) : null}
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-sky-500/25 bg-black/25 px-4 py-3 text-sm font-semibold text-sky-100">
          {message}
        </p>
      ) : null}

      <div className="job-session-snapshot mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">
            Job Labor
          </p>
          <p className="mt-3 text-2xl font-black">
            {formatDuration(sessionSummary.completedMinutes)}
          </p>
          <p className="mt-1 text-sm text-zinc-400">Completed time</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">
            Crew
          </p>
          <p className="mt-3 text-2xl font-black">
            {sessionSummary.workerCount || "-"}
          </p>
          <p className="mt-1 text-sm text-zinc-400">People with sessions</p>
        </div>

        <div
          className={`rounded-2xl border p-4 ${
            sessionSummary.missingBreakdownCount > 0
              ? "border-amber-300/35 bg-amber-300/10"
              : "border-emerald-300/25 bg-emerald-400/10"
          }`}
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">
            Breakdown
          </p>
          <p className="mt-3 text-2xl font-black">
            {sessionSummary.missingBreakdownCount}
          </p>
          <p className="mt-1 text-sm text-zinc-400">Sessions to finish</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">
            Latest
          </p>
          <p className="mt-3 truncate text-base font-black">
            {sessionSummary.latestSession?.job_type || "No session yet"}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {sessionSummary.latestSession
              ? formatTime(
                  sessionSummary.latestSession.ended_at ??
                    sessionSummary.latestSession.started_at
                )
              : "Start when work begins"}
          </p>
        </div>
      </div>

      <div className="job-session-labor-guide mt-5 rounded-3xl border border-sky-300/20 bg-black/25 p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">
              Field Guide
            </p>
            <h3 className="mt-2 text-xl font-black">
              {laborGuide.sampleCount > 0
                ? `${displayJobType} usually takes ${formatDuration(
                    laborGuide.averageMinutes
                  )}`
                : "Trimax will learn this job rhythm"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {laborGuide.sampleCount > 0
                ? `Based on ${laborGuide.sampleCount} completed ${
                    laborGuide.matchedJobType ? displayJobType : "job"
                  } session${laborGuide.sampleCount === 1 ? "" : "s"}.`
                : "After a few completed sessions, this card will show a realistic planning target for future work."}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                Recorded
              </p>
              <p className="mt-2 text-2xl font-black">
                {formatDuration(sessionSummary.completedMinutes)}
              </p>
            </div>
            <div
              className={`rounded-2xl border p-3 ${
                laborGuide.overMinutes > 0
                  ? "border-amber-300/30 bg-amber-300/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                Pace
              </p>
              <p className="mt-2 text-2xl font-black">
                {laborGuide.paceLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                Target Left
              </p>
              <p className="mt-2 text-2xl font-black">
                {laborGuide.sampleCount > 0
                  ? formatDuration(laborGuide.remainingMinutes)
                : "-"}
              </p>
            </div>
          </div>
        </div>
        {laborGuide.sampleCount > 0 ? (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${
                laborGuide.overMinutes > 0
                  ? "bg-gradient-to-r from-amber-300 to-rose-400"
                  : "bg-gradient-to-r from-emerald-300 via-sky-300 to-blue-500"
              }`}
              style={{ width: `${Math.max(laborGuide.progressPercent, 4)}%` }}
            />
          </div>
        ) : null}
      </div>

      {otherActiveSession ? (
        <div className="job-session-active-elsewhere mt-5 rounded-3xl border border-amber-400/35 bg-amber-500/10 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">
                Active Somewhere Else
              </p>
              <h3 className="mt-2 text-2xl font-black">
                {formatDuration(elapsedMinutes)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-amber-50/85">
                {otherActiveSession.property_name || "Property"}{" "}
                {otherActiveSession.unit_label
                  ? `/ Unit ${otherActiveSession.unit_label}`
                  : ""}{" "}
                / {otherActiveSession.job_type || "Job"}
              </p>
            </div>

            <p className="rounded-2xl border border-amber-300/25 bg-black/25 px-4 py-3 text-sm font-bold text-amber-100">
              Stop that session before starting another.
            </p>
            <Link
              href={activeElsewhereHref}
              className="app-button-secondary rounded-2xl px-4 py-3 text-center text-sm font-black"
            >
              Open Active Job
            </Link>
          </div>
        </div>
      ) : null}

      {activeSession ? (
        <div className="job-session-active mt-5 rounded-3xl border border-emerald-400/35 bg-emerald-500/10 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
                Active Session
              </p>
              <h3 className="mt-2 text-3xl font-black">
                {formatDuration(elapsedMinutes)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-emerald-50/85">
                {activeSession.property_name || propertyName || "Property"}{" "}
                {activeSession.unit_label || unitLabel
                  ? `/ Unit ${activeSession.unit_label || unitLabel}`
                  : ""}{" "}
                / {activeSession.job_type || displayJobType}
              </p>
              <p className="mt-1 text-xs font-semibold text-emerald-100/70">
                Started {formatTime(activeSession.started_at)}
              </p>
              {activeSession.notes ? (
                <p className="mt-3 rounded-2xl border border-emerald-300/20 bg-black/20 px-3 py-2 text-sm font-semibold text-emerald-50/85">
                  {activeSession.notes}
                </p>
              ) : null}
            </div>

            <button
              className="rounded-2xl bg-white px-5 py-4 text-base font-black text-emerald-950 shadow-xl shadow-emerald-950/20 transition hover:-translate-y-0.5 disabled:opacity-60"
              disabled={isBusy}
              onClick={stopSession}
              type="button"
            >
              Stop Session
            </button>
          </div>
        </div>
      ) : null}

      {showStartModal ? (
        <div className="job-session-modal mt-5 rounded-3xl border border-white/10 bg-black/35 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-zinc-300">Job Type</span>
              <select
                className="app-form-input mt-2 w-full rounded-2xl border px-4 py-3"
                value={jobTypeDraft}
                onChange={(event) => setJobTypeDraft(event.target.value)}
              >
                <option>Paint</option>
                <option>Cabinets</option>
                <option>Cleaning</option>
                <option>Inspection</option>
                <option>Admin</option>
                <option>Other</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-zinc-300">
                Quick Note
              </span>
              <input
                className="app-form-input mt-2 w-full rounded-2xl border px-4 py-3"
                placeholder="Optional"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              className="app-button-primary rounded-2xl px-5 py-4 text-base font-black"
              disabled={isBusy}
              onClick={startSession}
              type="button"
            >
              Start Now
            </button>
            <button
              className="app-button-secondary rounded-2xl px-5 py-4 text-base font-black"
              disabled={isBusy}
              onClick={() => setShowStartModal(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {stoppedSession ? (
        <div className="job-session-breakdown mt-5 rounded-3xl border border-violet-400/30 bg-violet-500/10 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">
                Break Down Your Time
              </p>
              <h3 className="mt-2 text-2xl font-black">
                Total: {formatDuration(stoppedSession.total_minutes ?? 0)}
              </h3>
              <p className="mt-1 text-sm text-violet-100/80">
                Rough categories are enough. You can also skip this for now.
              </p>
            </div>
            <div
              className={`rounded-2xl px-4 py-3 text-sm font-black ${
                breakdownTotals.isClose
                  ? "bg-emerald-400 text-emerald-950"
                  : "bg-amber-300 text-amber-950"
              }`}
            >
              <p>{formatDuration(breakdownTotals.effectiveMinutes)} assigned</p>
              <p className="mt-1 text-xs opacity-80">
                {breakdownTotals.statusLabel}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <button
              className="job-session-preset rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-black transition hover:border-sky-300/50"
              onClick={() => applyBreakdownPreset("paint")}
              type="button"
            >
              Paint Day
            </button>
            <button
              className="job-session-preset rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-black transition hover:border-sky-300/50"
              onClick={() => applyBreakdownPreset("cabinet")}
              type="button"
            >
              Cabinets
            </button>
            <button
              className="job-session-preset rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-black transition hover:border-sky-300/50"
              onClick={() => applyBreakdownPreset("material")}
              type="button"
            >
              Material Run
            </button>
            <button
              className="job-session-preset rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm font-black transition hover:border-sky-300/50"
              onClick={() => applyBreakdownPreset("admin")}
              type="button"
            >
              Admin
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {breakdownDrafts.map((draft, index) => (
              <div
                key={`${draft.workType}-${index}`}
                className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 md:grid-cols-[1.1fr_0.7fr_0.7fr_1.4fr]"
              >
                <select
                  className="app-form-input rounded-2xl border px-3 py-3"
                  value={draft.workType}
                  onChange={(event) =>
                    updateBreakdown(index, "workType", event.target.value)
                  }
                >
                  {WORK_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <input
                  className="app-form-input rounded-2xl border px-3 py-3"
                  inputMode="numeric"
                  placeholder="Minutes"
                  value={draft.minutes}
                  onChange={(event) =>
                    updateBreakdown(index, "minutes", event.target.value)
                  }
                />
                <input
                  className="app-form-input rounded-2xl border px-3 py-3"
                  inputMode="decimal"
                  placeholder="%"
                  value={draft.percentage}
                  onChange={(event) =>
                    updateBreakdown(index, "percentage", event.target.value)
                  }
                />
                <input
                  className="app-form-input rounded-2xl border px-3 py-3"
                  placeholder="Notes"
                  value={draft.notes}
                  onChange={(event) =>
                    updateBreakdown(index, "notes", event.target.value)
                  }
                />
              </div>
            ))}
          </div>

          <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-violet-100/80">
            Use either minutes or percentages. Trimax accepts a close match, so
            this can stay quick at the end of the day.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              className="app-button-secondary rounded-2xl px-5 py-3 font-black"
              onClick={() =>
                setBreakdownDrafts((current) => [...current, blankBreakdown()])
              }
              type="button"
            >
              Add Row
            </button>
            <button
              className="app-button-primary rounded-2xl px-5 py-3 font-black"
              disabled={isBusy}
              onClick={() => saveBreakdown(false)}
              type="button"
            >
              Save Breakdown
            </button>
            <button
              className="rounded-2xl border border-white/10 px-5 py-3 font-black text-zinc-200 transition hover:border-sky-300/50"
              disabled={isBusy}
              onClick={() => saveBreakdown(true)}
              type="button"
            >
              Skip Breakdown
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-zinc-400">
            Session History
          </p>
          <p className="text-sm font-semibold text-zinc-400">
            {sessions.length} saved
          </p>
        </div>

        <div className="mt-3 space-y-3">
          {sessions.length > 0 ? (
            sessions.slice(0, 5).map((session) => {
              const sessionBreakdowns = breakdownBySession.get(session.id) ?? [];
              const totalMinutes =
                session.total_minutes ?? minutesBetween(session.started_at, session.ended_at);

              return (
                <div
                  key={session.id}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black">
                        {session.job_type || "Job"} / {formatDuration(totalMinutes)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {formatTime(session.started_at)}{" "}
                        {session.ended_at ? `to ${formatTime(session.ended_at)}` : "active now"}
                      </p>
                      {session.notes ? (
                        <p className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-300">
                          {session.notes}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        sessionBreakdowns.length > 0
                          ? "bg-emerald-400 text-emerald-950"
                          : session.ended_at
                            ? "bg-amber-300 text-amber-950"
                            : "bg-sky-400 text-sky-950"
                      }`}
                    >
                      {sessionBreakdowns.length > 0
                        ? "Breakdown saved"
                        : session.ended_at
                          ? "Needs breakdown"
                        : "Active"}
                    </span>
                  </div>

                  {session.ended_at && sessionBreakdowns.length === 0 ? (
                    <div className="mt-3 flex justify-start">
                      <button
                        className="job-session-history-action rounded-2xl border border-amber-300/30 bg-amber-300/15 px-4 py-2 text-sm font-black text-amber-100 transition hover:-translate-y-0.5 hover:bg-amber-300/25"
                        onClick={() => openBreakdownForSession(session)}
                        type="button"
                      >
                        Break Down Time
                      </button>
                    </div>
                  ) : null}

                  {sessionBreakdowns.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sessionBreakdowns.map((breakdown) => (
                        <span
                          key={breakdown.id}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-zinc-200"
                        >
                          {breakdown.work_type}: {formatDuration(breakdown.minutes)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-zinc-400">
              No job sessions saved for this queue item yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
