"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";
import { TRIMAX_REFRESH_EVENT } from "./TrimaxRefreshControl";

type ActiveJobSession = {
  id: string;
  business_id: string;
  property_name: string | null;
  unit_label: string | null;
  queue_item_id: string | null;
  job_type: string | null;
  started_at: string;
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

function minutesSince(value: string) {
  const startedAt = new Date(value).getTime();

  if (!Number.isFinite(startedAt)) {
    return 0;
  }

  return Math.max(Math.round((Date.now() - startedAt) / 60000), 0);
}

export default function ActiveJobSessionDock() {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const [activeSession, setActiveSession] =
    useState<ActiveJobSession | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const [stoppedNotice, setStoppedNotice] = useState<{
    message: string;
    queueItemId: string | null;
  } | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadActiveSession() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
        return;
      }

      const { data: businessData } = await supabase
        .from("businesses")
        .select("id")
        .eq("slug", businessSlug)
        .limit(1)
        .maybeSingle();

      if (!businessData?.id) {
        return;
      }

      const { data, error } = await supabase
        .from("job_sessions")
        .select(
          "id, business_id, property_name, unit_label, queue_item_id, job_type, started_at"
        )
        .eq("business_id", businessData.id)
        .eq("user_id", userId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (error || !data) {
        setActiveSession(null);
        setElapsedMinutes(0);
        return;
      }

      const session = data as ActiveJobSession;
      setStoppedNotice(null);
      setActiveSession(session);
      setElapsedMinutes(minutesSince(session.started_at));
    }

    loadActiveSession();
    const refreshInterval = window.setInterval(loadActiveSession, 60000);
    window.addEventListener(TRIMAX_REFRESH_EVENT, loadActiveSession);

    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener(TRIMAX_REFRESH_EVENT, loadActiveSession);
    };
  }, [businessSlug]);

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedMinutes(minutesSince(activeSession.started_at));
    }, 30000);

    return () => window.clearInterval(interval);
  }, [activeSession]);

  async function stopActiveSession() {
    if (!activeSession) {
      return;
    }

    setIsStopping(true);

    const stoppedQueueItemId = activeSession.queue_item_id;
    const { data, error } = await supabase
      .from("job_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", activeSession.id)
      .select(
        "id, business_id, property_name, unit_label, queue_item_id, job_type, started_at, ended_at, total_minutes"
      )
      .single();

    setIsStopping(false);

    if (error) {
      setStoppedNotice({
        message: "Session could not be stopped yet. Open the job and try again.",
        queueItemId: stoppedQueueItemId,
      });
      return;
    }

    setActiveSession(null);
    setElapsedMinutes(0);
    const stoppedSession = data as (ActiveJobSession & {
      ended_at: string | null;
      total_minutes: number | null;
    }) | null;

    if (stoppedSession) {
      await logActivity({
        businessId: stoppedSession.business_id,
        action: "job_session.stopped",
        entityType: "queue_item",
        entityId: stoppedSession.queue_item_id,
        entityLabel: `${stoppedSession.property_name || "Property"}${
          stoppedSession.unit_label ? ` / Unit ${stoppedSession.unit_label}` : ""
        }`,
        details: {
          jobSessionId: stoppedSession.id,
          jobType: stoppedSession.job_type,
          startedAt: stoppedSession.started_at,
          endedAt: stoppedSession.ended_at,
          totalMinutes: stoppedSession.total_minutes,
          stoppedFrom: "global_dock",
        },
      });
    }

    setStoppedNotice({
      message: "Session stopped. Open the job when you are ready to break down the time.",
      queueItemId: stoppedQueueItemId,
    });

    window.setTimeout(() => {
      setStoppedNotice(null);
    }, 45000);
  }

  if (!activeSession && !stoppedNotice) {
    return null;
  }

  const href = activeSession?.queue_item_id
    ? `/queue/${activeSession.queue_item_id}?business=${businessSlug}`
    : stoppedNotice?.queueItemId
      ? `/queue/${stoppedNotice.queueItemId}?business=${businessSlug}`
    : `/queue?business=${businessSlug}`;

  return (
    <div className="active-job-session-dock fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xl rounded-3xl border border-emerald-400/35 bg-zinc-950/92 p-3 text-white shadow-2xl shadow-emerald-950/40 backdrop-blur-xl sm:bottom-5 sm:left-6 sm:right-auto sm:mx-0 lg:left-[23rem]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
            {activeSession ? "Job Session Running" : "Job Session Stopped"}
          </p>
          {activeSession ? (
            <>
              <p className="mt-1 truncate text-sm font-black">
                {activeSession.property_name || "Property"}
                {activeSession.unit_label
                  ? ` / Unit ${activeSession.unit_label}`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {activeSession.job_type || "Job"} /{" "}
                {formatDuration(elapsedMinutes)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-bold text-zinc-200">
              {stoppedNotice?.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {activeSession ? (
            <button
              className="rounded-2xl border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:bg-rose-500/25 disabled:opacity-60"
              disabled={isStopping}
              onClick={stopActiveSession}
              type="button"
            >
              Stop
            </button>
          ) : null}
          <Link
            href={href}
            className="rounded-2xl bg-emerald-400 px-4 py-3 text-center text-sm font-black text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-300"
          >
            {activeSession ? "Open" : "Break Down"}
          </Link>
        </div>
      </div>
    </div>
  );
}
