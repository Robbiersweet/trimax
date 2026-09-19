"use client";
import type { RemittanceAttempt } from "../lib/remittanceAttempt";
import { useEffect, useState, useRef } from "react";
import { debugFile, failureSummary, type ScanRecord } from "../lib/ocrHistory";
import {
  flushScans,
  pendingScans,
  recentScans,
  scanDiagnostics,
  pinScan,
} from "../lib/ocrHistoryClient";

type Props = {
  businessId: string;
  role: string | null | undefined;
  savedStatus: string;
};
export default function RecentScans({ businessId, role, savedStatus }: Props) {
  const [open, setOpen] = useState(false),
    [records, setRecords] = useState<ScanRecord[]>([]),
    [selected, setSelected] = useState<ScanRecord | null>(null);
  const [payload, setPayload] = useState<unknown>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState<{ url: string; file: File } | null>(null);
  const selectionVersion = useRef(0);
  const allowed = role === "owner" || role === "admin";
  useEffect(() => {
    if (!allowed) return;
    const flush = () => {
      void flushScans(businessId).catch(() => {});
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [businessId, allowed]);
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );
  async function load(older = false) {
    setBusy(true);
    setError("");
    try {
      const remote = await recentScans(
        businessId,
        older ? records.at(-1)?.created_at : undefined,
      ).catch((e) => {
        setError(String(e));
        return [];
      });
      const pending = await pendingScans(businessId).catch(() => []);
      const local = new Map<string, ScanRecord>();
      for (const item of pending.sort((a, b) => a.phase - b.phase))
        local.set(item.summary.attemptId, {
          id: item.summary.attemptId,
          created_at: item.summary.timestamp,
          original_id: item.summary.originalId,
          parent_id: item.summary.parentId,
          result: item.summary.result,
          summary: item.summary,
          pinned: false,
          diagnostics_expires_at: null,
          diagnostic_bytes: item.payloadBytes,
        });
      const merged = new Map(
        [
          ...(!older ? [] : records),
          ...remote,
          ...(!older ? [...local.values()] : []),
        ].map((record) => [record.id, record]),
      );
      setRecords(
        [...merged.values()].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recent scans.");
    } finally {
      setBusy(false);
    }
  }
  async function details() {
    const version = selectionVersion.current;
    if (!selected) return null;
    if (payload) return payload;
    setBusy(true);
    setError("");
    try {
      const value = await scanDiagnostics(businessId, selected.id);
      if (version !== selectionVersion.current) return null;
      setPayload(value);
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load diagnostics.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function createFile() {
    if (!selected) return;
    const value = await details();
    if (!value) return;
    const report = debugFile(selected.summary, value);
    const blob = new File([report.text], report.name, {
      type: "text/plain;charset=utf-8",
    });
    setFile({ url: URL.createObjectURL(blob), file: blob });
  }
  if (!allowed) return null;
  const s = selected?.summary;
  const button =
    "rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50";
  return (
    <section className="my-3 rounded-xl border border-white/15 p-3 text-white">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={button}
          onClick={() => {
            setOpen(!open);
            if (!open) void load();
          }}
        >
          Recent Scans
        </button>
        <span role="status" className="text-xs text-slate-300">
          {savedStatus}
        </span>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          {error && (
            <p role="alert" className="text-sm text-amber-200">
              {error}
            </p>
          )}
          {selected && s ? (
            <div className="space-y-3">
              <button
                type="button"
                className={button}
                onClick={() => {
                  selectionVersion.current++;
                  setSelected(null);
                  setPayload(null);
                  setFile(null);
                }}
              >
                Back to scans
              </button>
              <h3 className="font-bold">
                {s.kind === "retry" ? "Retry Reading" : "Original Scan"} ·{" "}
                {selected.result}
              </h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt>Scanned</dt>
                <dd>{new Date(s.timestamp).toLocaleString()}</dd>
                <dt>Attempt</dt>
                <dd className="break-all">{s.attemptId}</dd>
                <dt>Source</dt>
                <dd>{s.selectedSource}</dd>
                <dt>Check number</dt>
                <dd>{s.checkNumber ?? "Unknown"}</dd>
                <dt>Check date</dt>
                <dd>{s.checkDate ?? "Unknown"}</dd>
                <dt>Total</dt>
                <dd>
                  {s.documentTotal == null
                    ? "Unknown"
                    : `$${s.documentTotal.toFixed(2)}`}
                </dd>
                <dt>Invoices resolved</dt>
                <dd>
                  {s.invoicesResolved}/{s.rowsDetected}
                </dd>
                <dt>Reconciliation</dt>
                <dd>{s.reconciled ? "Complete" : "Needs review"}</dd>
                <dt>Apply allowed</dt>
                <dd>{s.paymentCanApply ? "Yes" : "No"}</dd>
              </dl>
              <h4 className="font-semibold">Why Trimax decided this</h4>
              <ul className="list-disc pl-5 text-sm">
                {s.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(failureSummary(s))
                      .then(() => setError("Summary copied."))
                      .catch(() =>
                        setError(
                          "Clipboard unavailable. Use Create Debug File.",
                        ),
                      );
                  }}
                >
                  Copy Failure Summary
                </button>
                {selected.result !== "success" && (
                  <>
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => void createFile()}
                    >
                      Create Debug File
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={busy || selected.diagnostic_bytes === 0}
                      onClick={() => {
                        void pinScan(selected.id, !selected.pinned)
                          .then(() => {
                            setSelected({
                              ...selected,
                              pinned: !selected.pinned,
                            });
                            void load();
                          })
                          .catch((e) => setError(String(e)));
                      }}
                    >
                      {selected.pinned ? "Unpin" : "Pin for Debugging"}
                    </button>
                  </>
                )}
              </div>
              {file && (
                <div className="flex flex-wrap gap-2">
                  <a
                    className={button}
                    href={file.url}
                    download={file.file.name}
                  >
                    Download debug file
                  </a>
                  {typeof navigator !== "undefined" &&
                    navigator.canShare?.({ files: [file.file] }) && (
                      <button
                        type="button"
                        className={button}
                        onClick={() => {
                          void navigator
                            .share({
                              files: [file.file],
                              title: "Trimax scan report",
                            })
                            .catch((e) => {
                              if (e.name !== "AbortError")
                                setError(
                                  "Use Download debug file to save this report.",
                                );
                            });
                        }}
                      >
                        Share debug file
                      </button>
                    )}
                </div>
              )}
              <p className="text-xs text-slate-400">
                {selected.result === "success"
                  ? "Only this summary is retained. Submitted payment images remain in payment history."
                  : selected.pinned
                    ? "Pinned: full diagnostics stay until unpinned."
                    : selected.diagnostics_expires_at
                      ? `Full diagnostics retained until ${new Date(selected.diagnostics_expires_at).toLocaleDateString()}.`
                      : "Full diagnostics may be waiting to sync from this device."}
              </p>
              {selected.result !== "success" && (
                <>
                  <details
                    onToggle={(event) => {
                      if (event.currentTarget.open) void details();
                    }}
                  >
                    <summary className="cursor-pointer font-semibold">
                      What Trimax saw
                    </summary>
                    {payload ? (
                      <ObservationView payload={payload} />
                    ) : (
                      <p className="text-sm">
                        {busy
                          ? "Loading report…"
                          : "Open to load observed rows and header evidence."}
                      </p>
                    )}
                  </details>
                  <details
                    onToggle={(event) => {
                      if (event.currentTarget.open) void details();
                    }}
                  >
                    <summary className="cursor-pointer font-semibold">
                      Candidate decisions
                    </summary>
                    {Boolean(payload) && <DecisionView payload={payload} />}
                  </details>
                  <details
                    onToggle={(event) => {
                      if (event.currentTarget.open) void details();
                    }}
                  >
                    <summary className="cursor-pointer font-semibold">
                      Raw diagnostics
                    </summary>
                    {Boolean(payload) && (
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    )}
                  </details>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-300">
                Newest scans first. Retry entries link to their original scan.
              </p>
              {!records.length && !busy && <p>No recent scans yet.</p>}
              {records.map((record) => (
                <button
                  type="button"
                  key={record.id}
                  className={`block w-full rounded-lg bg-white/5 p-3 text-left ${record.parent_id ? "border-l-2 border-sky-400 pl-5" : ""}`}
                  onClick={() => {
                    selectionVersion.current++;
                    setSelected(record);
                    setPayload(null);
                    setFile(null);
                    setError("");
                  }}
                >
                  <span className="font-semibold">
                    {record.parent_id ? "↳ Retry" : "Original Scan"} ·{" "}
                    {record.result}
                    {record.pinned ? " · Pinned" : ""}
                  </span>
                  <span className="block text-sm text-slate-300">
                    {new Date(record.created_at).toLocaleString()} ·{" "}
                    {record.summary.invoicesResolved}/
                    {record.summary.rowsDetected} invoices ·{" "}
                    {record.summary.documentTotal == null
                      ? "Total unknown"
                      : `$${record.summary.documentTotal.toFixed(2)}`}
                  </span>
                  {record.parent_id && (
                    <span className="text-xs text-slate-400">
                      Original: {record.original_id.slice(0, 8)}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => void load(true)}
              >
                {busy ? "Loading…" : "Older scans"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
function ObservationView({ payload }: { payload: unknown }) {
  const report = payload as {
    attempt?: {
      evidence?: {
        physicalRows?: Array<{
          rowId: string;
          text: string;
          normalizedInvoiceCandidates: string[];
          unitLikeTokens: string[];
          amountCandidates: Array<{ raw: string }>;
        }>;
        headerEvidence?: unknown;
      };
    };
    response?: {
      evidence?: {
        physicalRows?: Array<{
          rowId: string;
          text: string;
          normalizedInvoiceCandidates: string[];
          unitLikeTokens: string[];
          amountCandidates: Array<{ raw: string }>;
        }>;
        headerEvidence?: unknown;
      };
    };
  };
  const evidence = report.attempt?.evidence ?? report.response?.evidence;
  return (
    <div className="space-y-2 text-sm">
      {evidence?.physicalRows?.map((row) => (
        <div key={row.rowId}>
          <p className="font-semibold">
            {row.rowId}:{" "}
            {row.normalizedInvoiceCandidates.join(", ") || "Invoice unknown"}
          </p>
          <p>
            Unit: {row.unitLikeTokens.join(", ") || "Unknown"} · Amount
            observations:{" "}
            {row.amountCandidates.map((a) => a.raw).join(", ") || "Unknown"}
          </p>
          <p className="text-slate-400">{row.text}</p>
        </div>
      ))}
      <details>
        <summary>Header candidates and reasons</summary>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
          {JSON.stringify(
            evidence?.headerEvidence ?? "No header evidence retained.",
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function DecisionView({ payload }: { payload: unknown }) {
  const report = payload as {
    attempt?: RemittanceAttempt;
    capture?: RemittanceAttempt["evidence"]["capture"];
    preparation?: string[];
    reason?: string;
  };
  const attempt = report.attempt;
  return (
    <div className="space-y-2 text-sm">
      {(attempt?.evidence.capture.sources ?? report.capture?.sources ?? []).map(
        (source) => (
          <p key={source.id}>
            {source.id}: {source.status}
            {source.error ? " — " + source.error : ""}
          </p>
        ),
      )}
      {attempt?.resolverResult.matchTrace.map((trace, i) => (
        <p key={i}>
          {trace.displayId ?? trace.ocrInvoiceIdentifier}:{" "}
          {trace.accepted ? "Selected" : "Not selected"} —{" "}
          {trace.resolutionReason ||
            trace.rejectionReason ||
            "See retained evidence"}
        </p>
      ))}
      {report.reason && <p>{report.reason}</p>}
      {report.preparation?.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}
