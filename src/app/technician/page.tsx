"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string | null;
  slug: string | null;
};

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  paint_type: string | null;
  unit_layout: string | null;
  flooring: string | null;
  ready_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  smoked_in: boolean | null;
  renovation_needed: boolean | null;
  notes: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type JobSession = {
  id: string;
  business_id: string;
  user_id: string;
  property_name: string | null;
  unit_label: string | null;
  queue_item_id: string | null;
  job_type: string | null;
  started_at: string;
  ended_at: string | null;
  total_minutes: number | null;
  notes: string | null;
  created_at: string | null;
};

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function minutesBetween(startedAt: string | null, endedAt?: string | null) {
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

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(Math.round(minutes), 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;

  if (hours <= 0) {
    return `${remainder}m`;
  }

  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysUntil(value: string | null) {
  if (!value) {
    return null;
  }

  const target = new Date(`${value.slice(0, 10)}T00:00:00`).getTime();
  const today = todayStart().getTime();

  if (!Number.isFinite(target)) {
    return null;
  }

  return Math.ceil((target - today) / 86400000);
}

function fieldPriorityText(item: QueueItem) {
  const days = daysUntil(item.ready_date);

  if (days === null) {
    return "Ready date needed";
  }

  if (days < 0) {
    return `${Math.abs(days)} days past ready`;
  }

  if (days === 0) {
    return "Ready today";
  }

  if (days === 1) {
    return "Ready tomorrow";
  }

  return `Ready in ${days} days`;
}

function isOpenFieldJob(item: QueueItem) {
  const status = (item.status ?? "").trim().toLowerCase();

  return (
    !item.completed_date &&
    !["completed", "invoiced", "paid", "closed"].includes(status)
  );
}

function jobTitle(item: QueueItem) {
  return `${item.property ?? "Property"}${item.unit ? ` - Unit ${item.unit}` : ""}`;
}

export default function TechnicianDashboard() {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const [business, setBusiness] = useState<Business | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [sessions, setSessions] = useState<JobSession[]>([]);
  const [activeSession, setActiveSession] = useState<JobSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  async function loadTechnicianWorkspace(slug = businessSlug) {
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id ?? null;
    setLoading(true);
    setMessage(null);
    setUserId(currentUserId);

    const { data: businessData, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, slug")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (businessError || !businessData?.id || !currentUserId) {
      setBusiness(null);
      setQueueItems([]);
      setSessions([]);
      setActiveSession(null);
      setLoading(false);
      setMessage("Technician workbench could not load this workspace.");
      return;
    }

    const selectedBusiness = businessData as Business;
    setBusiness(selectedBusiness);

    const [queueResponse, sessionResponse] = await Promise.all([
      supabase
        .from("queue_items")
        .select(
          "id, property, unit, status, priority, paint_type, unit_layout, flooring, ready_date, scheduled_date, completed_date, smoked_in, renovation_needed, notes, updated_at, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("ready_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("job_sessions")
        .select(
          "id, business_id, user_id, property_name, unit_label, queue_item_id, job_type, started_at, ended_at, total_minutes, notes, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .eq("user_id", currentUserId)
        .order("started_at", { ascending: false })
        .limit(40),
    ]);

    if (queueResponse.error) {
      console.warn("Technician queue could not load:", queueResponse.error.message);
    }

    if (sessionResponse.error) {
      console.warn("Technician sessions could not load:", sessionResponse.error.message);
      setSetupMissing(true);
    } else {
      setSetupMissing(false);
    }

    const loadedSessions = (sessionResponse.data ?? []) as JobSession[];
    setQueueItems(((queueResponse.data ?? []) as QueueItem[]).filter(isOpenFieldJob));
    setSessions(loadedSessions);
    setActiveSession(
      loadedSessions.find((session) => !session.ended_at) ?? null
    );
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTechnicianWorkspace(businessSlug);
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessSlug]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const completedSessions = useMemo(
    () => sessions.filter((session) => Boolean(session.ended_at)),
    [sessions]
  );

  const todayMinutes = useMemo(() => {
    const start = todayStart().getTime();

    return sessions.reduce((total, session) => {
      const sessionStart = new Date(session.started_at).getTime();
      const sessionEnd = session.ended_at
        ? new Date(session.ended_at).getTime()
        : currentTime ?? sessionStart;

      if (!Number.isFinite(sessionEnd) || sessionEnd < start) {
        return total;
      }

      const effectiveStart = Math.max(sessionStart, start);
      return total + Math.max(Math.round((sessionEnd - effectiveStart) / 60000), 0);
    }, 0);
  }, [currentTime, sessions]);

  const recentCompletedItems = useMemo(() => completedSessions.slice(0, 4), [
    completedSessions,
  ]);

  const fieldJobs = useMemo(
    () =>
      [...queueItems].sort((left, right) => {
        const leftDays = daysUntil(left.ready_date) ?? 999;
        const rightDays = daysUntil(right.ready_date) ?? 999;

        if (leftDays !== rightDays) {
          return leftDays - rightDays;
        }

        const leftScheduled = left.scheduled_date ? 0 : 1;
        const rightScheduled = right.scheduled_date ? 0 : 1;

        if (leftScheduled !== rightScheduled) {
          return leftScheduled - rightScheduled;
        }

        return jobTitle(left).localeCompare(jobTitle(right));
      }),
    [queueItems]
  );

  async function startSession(item: QueueItem) {
    if (!business?.id || !userId || activeSession) {
      return;
    }

    setBusyId(item.id);
    setMessage(null);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("job_sessions")
      .insert({
        business_id: business.id,
        user_id: userId,
        property_name: item.property,
        unit_label: item.unit,
        queue_item_id: item.id,
        job_type: item.paint_type || "Field Work",
        started_at: now,
        notes: null,
      })
      .select()
      .single();

    if (error) {
      console.warn("Technician session could not start:", error.message);
      setBusyId(null);
      setMessage("Job session could not start yet.");
      return;
    }

    await supabase
      .from("queue_items")
      .update({
        status: "In Progress",
        updated_at: now,
      })
      .eq("id", item.id)
      .eq("business_id", business.id);

    await logActivity({
      businessId: business.id,
      action: "technician.job_session_started",
      entityType: "queue_item",
      entityId: item.id,
      entityLabel: jobTitle(item),
      details: {
        jobSessionId: (data as JobSession).id,
        jobType: item.paint_type,
      },
    });

    setMessage(`Started work on ${jobTitle(item)}.`);
    setBusyId(null);
    await loadTechnicianWorkspace();
  }

  async function stopSession(mode: "stop" | "pause" = "stop") {
    if (!business?.id || !activeSession) {
      return;
    }

    setBusyId(activeSession.id);
    setMessage(null);

    const { data, error } = await supabase
      .from("job_sessions")
      .update({
        ended_at: new Date().toISOString(),
      })
      .eq("id", activeSession.id)
      .eq("business_id", business.id)
      .select()
      .single();

    if (error) {
      console.warn("Technician session could not stop:", error.message);
      setBusyId(null);
      setMessage("Job session could not stop yet.");
      return;
    }

    await logActivity({
      businessId: business.id,
      action:
        mode === "pause"
          ? "technician.job_session_paused"
          : "technician.job_session_stopped",
      entityType: "job_session",
      entityId: activeSession.id,
      entityLabel: `${activeSession.property_name ?? "Property"}${
        activeSession.unit_label ? ` / ${activeSession.unit_label}` : ""
      }`,
      details: {
        totalMinutes: (data as JobSession).total_minutes,
        queueItemId: activeSession.queue_item_id,
      },
    });

    setMessage(
      mode === "pause"
        ? "Session paused. Start another session on this job when work resumes."
        : "Session stopped. You can break down the time from Job Sessions when ready."
    );
    setBusyId(null);
    await loadTechnicianWorkspace();
  }

  async function markComplete(item: QueueItem) {
    if (!business?.id) {
      return;
    }

    setBusyId(item.id);
    setMessage(null);

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("queue_items")
      .update({
        status: "Completed",
        completed_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("business_id", business.id);

    if (error) {
      console.warn("Technician status update failed:", error.message);
      setMessage("Job status could not be updated yet.");
      setBusyId(null);
      return;
    }

    await logActivity({
      businessId: business.id,
      action: "technician.job_completed",
      entityType: "queue_item",
      entityId: item.id,
      entityLabel: jobTitle(item),
      details: {
        completedDate: today,
      },
    });

    setMessage(`${jobTitle(item)} marked complete.`);
    setBusyId(null);
    await loadTechnicianWorkspace();
  }

  return (
    <AppShell>
      <div className="technician-page space-y-6">
        <section className="technician-hero rounded-[1.75rem] border border-cyan-400/25 bg-zinc-950/80 p-5 shadow-2xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="dashboard-readable-label text-sm font-black uppercase tracking-[0.22em] text-cyan-200">
                Technician Workbench
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                Daily work without the accounting clutter
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-300">
                Start from the job, track real labor time, save field notes, and keep proof moving. No invoices, revenue, settings, or admin tools live on this screen.
              </p>
            </div>

            <Link
              href={`/queue?business=${businessSlug}`}
              className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-5 py-3 text-sm font-black text-white shadow-xl shadow-sky-950/30 transition hover:-translate-y-0.5 hover:bg-sky-400"
            >
              Open Queue
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TechnicianMetric label="Active session" value={activeSession ? "1" : "0"} detail="Running now" />
            <TechnicianMetric label="Today" value={formatMinutes(todayMinutes)} detail="Your labor time" />
            <TechnicianMetric label="Field jobs" value={String(fieldJobs.length)} detail="Ready to review" />
            <TechnicianMetric label="Finished" value={String(completedSessions.length)} detail="Your completed sessions" />
          </div>
        </section>

        <section className="technician-field-safe-strip rounded-[1.5rem] border border-cyan-400/20 bg-zinc-900/70 p-4">
          <div>
            <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
              Field-Safe Screen
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Technicians can work, pause, stop, add notes, and upload proof without touching accounting or workspace administration.
            </p>
          </div>
          <div className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-100 sm:grid-cols-3">
            <span>Time</span>
            <span>Notes</span>
            <span>Photos</span>
          </div>
        </section>

        {message ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
            {message}
          </div>
        ) : null}

        {setupMissing ? (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
            Job Sessions tables are not live in Supabase yet. Run the Job Sessions SQL before field time can save.
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-900/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em] text-emerald-200">
                  Active Session
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {activeSession ? "Work in progress" : "No session running"}
                </h2>
              </div>
              {activeSession ? (
                <button
                  type="button"
                  onClick={() => stopSession()}
                  disabled={busyId === activeSession.id}
                  className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Stop Session
                </button>
              ) : null}
            </div>

            {activeSession ? (
              <div className="mt-5 rounded-2xl border border-sky-400/25 bg-sky-400/10 p-4">
                <p className="text-xl font-black text-white">
                  {activeSession.property_name ?? "Property"}
                  {activeSession.unit_label ? ` - Unit ${activeSession.unit_label}` : ""}
                </p>
                <p className="mt-2 text-sm font-bold text-cyan-100">
                  {activeSession.job_type ?? "Field Work"} / {formatMinutes(minutesBetween(activeSession.started_at))}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => stopSession("pause")}
                    disabled={busyId === activeSession.id}
                    className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-100 transition hover:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Pause Session
                  </button>
                  {activeSession.queue_item_id ? (
                    <>
                      <Link
                        href={`/queue/${activeSession.queue_item_id}?business=${businessSlug}`}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white transition hover:border-cyan-300/50"
                      >
                        Add Notes
                      </Link>
                      <Link
                        href={`/queue/${activeSession.queue_item_id}?business=${businessSlug}#job-media`}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white transition hover:border-cyan-300/50"
                      >
                        Upload Photos
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="technician-empty-state mt-5 rounded-2xl border border-dashed p-4">
                <p className="font-black text-white">Ready when the next unit is ready.</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose a field job below and tap Start Session when work begins.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-zinc-900/70 p-5">
            <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
              Recent Completed Jobs
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Your latest finished sessions
            </h2>

            <div className="mt-5 grid gap-3">
              {recentCompletedItems.length > 0 ? (
                recentCompletedItems.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <p className="font-black text-white">
                      {session.property_name ?? "Property"}
                      {session.unit_label ? ` - ${session.unit_label}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {session.job_type ?? "Field Work"} / {formatMinutes(session.total_minutes ?? minutesBetween(session.started_at, session.ended_at))}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-zinc-400">
                  Completed sessions will appear here after your first stop.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-white/10 bg-zinc-900/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="dashboard-readable-label text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                Field Jobs
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Start from the next unit
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Showing open field work in ready-date order. Financial details stay hidden so this remains a clean workbench for the field.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-200">
              {fieldJobs.length} active
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm font-bold text-zinc-300">
                Loading today&apos;s field work...
              </div>
            ) : fieldJobs.length > 0 ? (
              fieldJobs.slice(0, 12).map((item) => (
                <article
                  key={item.id}
                  className="technician-job-card grid gap-4 rounded-3xl border border-white/10 bg-black/25 p-4 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-black text-white">
                        {jobTitle(item)}
                      </p>
                      <span className="rounded-full bg-sky-400/15 px-3 py-1 text-xs font-black text-sky-100">
                        {item.status ?? "Open"}
                      </span>
                      <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">
                        {fieldPriorityText(item)}
                      </span>
                      {item.smoked_in || item.renovation_needed ? (
                        <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-100">
                          Extra prep
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-4">
                      <span>Paint due: {formatDate(item.ready_date)}</span>
                      <span>Scheduled: {formatDate(item.scheduled_date)}</span>
                      <span>{item.paint_type ?? "Paint type not set"}</span>
                      <span>{item.flooring ?? item.unit_layout ?? "Unit info ready"}</span>
                    </div>

                    {item.notes ? (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => startSession(item)}
                      disabled={Boolean(activeSession) || busyId === item.id}
                      className="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-black text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Start Session
                    </button>
                    <Link
                      href={`/queue/${item.id}?business=${businessSlug}`}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:border-cyan-300/50"
                    >
                      Add Notes
                    </Link>
                    <Link
                      href={`/queue/${item.id}?business=${businessSlug}#job-media`}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:border-cyan-300/50"
                    >
                      Upload Photos
                    </Link>
                    <button
                      type="button"
                      onClick={() => markComplete(item)}
                      disabled={busyId === item.id}
                      className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Mark Complete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="technician-empty-state rounded-2xl border border-dashed p-5">
                <p className="text-lg font-black text-white">
                  No field jobs are ready on this workbench right now.
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  When a queue item is ready for field work, it will appear here with only the job details needed to perform the work.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/queue?business=${businessSlug}`}
                    className="rounded-2xl border border-sky-300/40 bg-sky-400/15 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5"
                  >
                    Open Queue
                  </Link>
                  <Link
                    href={`/job-sessions?business=${businessSlug}`}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:border-cyan-300/50"
                  >
                    View Sessions
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function TechnicianMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">
        {value}
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        {detail}
      </p>
    </div>
  );
}
