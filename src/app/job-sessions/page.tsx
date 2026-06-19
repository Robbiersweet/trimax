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
  notes: string | null;
  created_at: string | null;
};

type JobSessionBreakdown = {
  id: string;
  job_session_id: string;
  work_type: string | null;
  minutes: number | null;
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
  let setupMessage: string | null = null;

  if (businessError) {
    console.warn("Job Sessions workspace lookup failed:", businessError.message);
    setupMessage =
      "Workspace details could not be loaded. Try signing in again, then reopen Job Sessions.";
  }

  if (selectedBusiness?.id) {
    const [sessionResponse, breakdownResponse] = await Promise.all([
      supabase
        .from("job_sessions")
        .select(
          "id, user_id, property_name, unit_label, queue_item_id, estimate_id, invoice_id, job_type, started_at, ended_at, total_minutes, notes, created_at"
        )
        .eq("business_id", selectedBusiness.id)
        .order("started_at", { ascending: false })
        .limit(80),
      supabase
        .from("job_session_breakdowns")
        .select("id, job_session_id, work_type, minutes")
        .eq("business_id", selectedBusiness.id),
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

    sessions = (sessionResponse.data ?? []) as JobSession[];
    breakdowns = (breakdownResponse.data ?? []) as JobSessionBreakdown[];
  }

  const breakdownSessionIds = new Set(
    breakdowns.map((breakdown) => breakdown.job_session_id)
  );
  const activeSessions = sessions.filter((session) => !session.ended_at);
  const completedSessions = sessions.filter((session) => session.ended_at);
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
              label="This Month"
              value={formatDuration(monthMinutes)}
              detail="Completed labor"
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
        </div>

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
                  detail="Stop a session and save a breakdown to start seeing the mix."
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
                  title="No active job sessions right now"
                  detail="Open a queue item and tap Start Job Session when work begins."
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
                detail="Completed sessions will build a searchable unit labor memory here."
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
                title="No sessions have been recorded yet"
                detail="The first saved session will appear here automatically."
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
      className={`job-session-hub-metric rounded-2xl border p-4 ${
        urgent
          ? "border-amber-300/35 bg-amber-300/10"
          : "border-white/10 bg-black/25"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm text-zinc-400">{detail}</p>
    </div>
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
            {formatDuration(minutes)}
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
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
      <p className="font-black text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-400">{detail}</p>
    </div>
  );
}
