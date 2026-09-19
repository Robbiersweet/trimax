"use client";
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import {
  attemptPath,
  debugStatuses,
  type DebugAttempt,
  type DebugStatus,
} from "../lib/ocrDebug";
export default function OcrDebugMetadata({
  attempt,
  businessSlug,
}: {
  attempt: DebugAttempt;
  businessSlug: string;
}) {
  const [status, setStatus] = useState<DebugStatus>(attempt.debug_status),
    [note, setNote] = useState(attempt.investigation_note),
    [fixture, setFixture] = useState(attempt.regression_id);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dates, setDates] = useState({
      investigated_at: attempt.investigated_at,
      resolved_at: attempt.resolved_at,
    });
  const path = attemptPath(attempt.id, businessSlug);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("trimax_update_ocr_debug", {
        p_id: attempt.id,
        p_status: status,
        p_note: note,
        p_regression_id: fixture,
      });
      if (error) throw new Error(error.message);
      const { data, error: readError } = await supabase
        .from("ocr_attempt_debug")
        .select("investigated_at,resolved_at")
        .eq("attempt_id", attempt.id)
        .single();
      if (readError) throw new Error(readError.message);
      setDates(data);
      setMessage("Investigation metadata saved. OCR evidence is unchanged.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save investigation metadata.",
      );
    } finally {
      setBusy(false);
    }
  }
  const button =
    "rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50";
  return (
    <section className="space-y-3" aria-label="Investigation metadata">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={button}
          onClick={() => {
            void navigator.clipboard
              .writeText(new URL(path, window.location.origin).href)
              .then(() =>
                setMessage(
                  "Attempt link copied. Sign-in and owner/admin access are required.",
                ),
              )
              .catch(() =>
                setMessage(
                  "Clipboard unavailable. Copy the attempt address from your browser.",
                ),
              );
          }}
        >
          Copy Attempt Link
        </button>
        <a className="break-all text-sm underline" href={path}>
          Permanent attempt link
        </a>
      </div>
      <p className="text-sm text-slate-400">
        This link requires owner/admin access to this workspace.
      </p>
      {attempt.debug_worthy ? (
        <form onSubmit={save} className="grid gap-3">
          <h2 className="font-bold">Debug metadata</h2>
          <label className="grid gap-1 text-sm">
            Debug status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DebugStatus)}
              className="rounded-lg border border-white/20 bg-zinc-900 p-2"
            >
              {debugStatuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Investigation note
            <textarea
              value={note}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-lg border border-white/20 bg-zinc-900 p-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Related regression or fixture
            <input
              value={fixture}
              maxLength={160}
              onChange={(e) => setFixture(e.target.value)}
              className="rounded-lg border border-white/20 bg-zinc-900 p-2"
            />
          </label>
          <p className="text-xs text-slate-400">
            Mark Resolved only after the repair and required acceptance are
            complete. Deployment alone does not resolve a case.
          </p>
          <div className="text-sm">
            Investigated:{" "}
            {dates.investigated_at
              ? new Date(dates.investigated_at).toLocaleString()
              : "Not yet"}{" "}
            · Resolved:{" "}
            {dates.resolved_at
              ? new Date(dates.resolved_at).toLocaleString()
              : "Not yet"}
          </div>
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Saving…" : "Save debug metadata"}
          </button>
        </form>
      ) : (
        <p className="text-sm">
          Clean successful scan. Available in history; not part of the default
          Debug Queue.
        </p>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
