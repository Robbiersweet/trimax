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
        .select("id, job_session_id")
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
