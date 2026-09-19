import { immutableSnapshot } from "./remittanceAttempt.ts";
import type { RemittanceAttempt, ScanCapture } from "./remittanceAttempt.ts";
export type ScanResult =
  | "processing"
  | "success"
  | "review"
  | "failed"
  | "duplicate"
  | "apply blocked";
export type ScanSummary = {
  attemptId: string;
  timestamp: string;
  build: string;
  kind: "scan" | "retry";
  originalId: string;
  parentId: string | null;
  inputSource: string;
  selectedSource: string;
  result: ScanResult;
  checkNumber: string | null;
  checkDate: string | null;
  documentTotal: number | null;
  rowsDetected: number;
  invoicesResolved: number;
  reconciled: boolean;
  paymentCanApply: boolean;
  rowNotes?: string[];
  sourceNotes?: string[];
  headerAuthority?: string;
  reasons: string[];
  durationMs: number;
  subtotal: number | null;
  difference: number | null;
};
export type ScanWrite = {
  businessId: string;
  phase: 0 | 1 | 2;
  summary: ScanSummary;
  payload: unknown | null;
};
export type ScanRecord = {
  id: string;
  created_at: string;
  original_id: string;
  parent_id: string | null;
  result: ScanResult;
  summary: ScanSummary;
  pinned: boolean;
  diagnostics_expires_at: string | null;
  diagnostic_bytes: number;
};
export function scanSummary(
  id: string,
  original: string,
  parent: string | null,
  source: string,
  build: string,
): ScanSummary {
  return {
    attemptId: id,
    originalId: original,
    parentId: parent,
    timestamp: new Date().toISOString(),
    build,
    kind: parent ? "retry" : "scan",
    inputSource: source,
    selectedSource: source,
    result: "processing",
    checkNumber: null,
    checkDate: null,
    documentTotal: null,
    rowsDetected: 0,
    invoicesResolved: 0,
    reconciled: false,
    paymentCanApply: false,
    reasons: [],
    durationMs: 0,
    subtotal: null,
    difference: null,
  };
}
export function finishScan(
  base: ScanSummary,
  attempt: RemittanceAttempt | null,
  result: ScanResult,
  durationMs: number,
  reasons: string[] = [],
): ScanSummary {
  const evidence = attempt?.evidence,
    proof = attempt?.reconciliationResult;
  return {
    ...base,
    rowNotes: evidence?.physicalRows
      .slice(0, 20)
      .map((row) =>
        [
          row.rowId,
          row.normalizedInvoiceCandidates.join("/"),
          row.unitLikeTokens.join("/"),
          row.amountCandidates.map((a) => a.raw).join("/"),
        ]
          .join(" · ")
          .slice(0, 200),
      ),
    sourceNotes: evidence?.capture.sources
      .slice(0, 8)
      .map((source) =>
        [source.id, source.status, source.error ?? ""].join(": ").slice(0, 200),
      ),
    headerAuthority:
      evidence?.headerEvidence.documentTotal?.source ?? "UNKNOWN",
    result,
    durationMs: Math.max(0, Math.round(durationMs)),
    selectedSource: evidence?.capture.source ?? base.selectedSource,
    checkNumber: evidence?.headerEvidence.checkNumber ?? null,
    checkDate: evidence?.headerEvidence.checkDate ?? null,
    documentTotal: proof?.documentTotal ?? null,
    rowsDetected: evidence?.physicalRows.length ?? 0,
    invoicesResolved: proof?.reviewIds.length ?? 0,
    reconciled: proof?.eligible ?? false,
    paymentCanApply: result === "success" && Boolean(proof?.eligible),
    subtotal: proof?.resolvedTotal ?? null,
    difference:
      proof?.documentTotal == null
        ? null
        : Math.round((proof.documentTotal - proof.resolvedTotal) * 100) / 100,
    reasons: [...new Set([...reasons, ...(proof?.blockers ?? [])])]
      .slice(0, 8)
      .map((reason) => reason.slice(0, 400)),
  };
}
// Optical images are explicitly bounded; other image bytes and credentials are excluded. All OCR observations and decision evidence remain intact.
export function diagnosticPayload(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value ?? null, (key, entry) =>
      key === "optical"
        ? boundedOptical(entry)
        : /^(imageDataUrl|imageBuffer|selectedImageDataUrl|access_token|refresh_token|password|authorization)$/i.test(
              key,
            ) ||
            (typeof entry === "string" && /^data:image\//.test(entry))
          ? undefined
          : entry,
    ),
  );
}
export function failureSummary(summary: ScanSummary) {
  const money = (n: number | null) =>
    n == null ? "UNKNOWN" : `$${n.toFixed(2)}`;
  return [
    "TRIMAX OCR FAILURE REPORT",
    `Attempt: ${summary.attemptId}`,
    `Build: ${summary.build}`,
    `Timestamp: ${summary.timestamp}`,
    `Result: ${summary.result}; duration: ${summary.durationMs}ms`,
    "",
    "SOURCE",
    `Selected: ${summary.selectedSource}`,
    ...(summary.sourceNotes ?? []),
    "",
    "HEADER",
    `Check #: ${summary.checkNumber ?? "UNKNOWN"}`,
    `Date: ${summary.checkDate ?? "UNKNOWN"}`,
    `Total: ${money(summary.documentTotal)}`,
    `Authority: ${summary.headerAuthority ?? "UNKNOWN"}`,
    "",
    "ROWS",
    ...(summary.rowNotes ?? []),
    `${summary.invoicesResolved}/${summary.rowsDetected} invoices resolved`,
    "",
    "PRIMARY FAILURE REASONS",
    ...summary.reasons.map((reason, i) => `${i + 1}. ${reason}`),
    "",
    "RECONCILIATION",
    `Subtotal: ${money(summary.subtotal)}`,
    `Document total: ${money(summary.documentTotal)}`,
    `Difference: ${money(summary.difference)}`,
    `paymentCanApply: ${summary.paymentCanApply}`,
    `Full diagnostics retained under attempt ID ${summary.attemptId}.`,
  ].join("\n");
}
export function debugFile(summary: ScanSummary, payload: unknown) {
  return {
    name: `Trimax-OCR-${summary.result.toUpperCase().replaceAll(" ", "-")}-${summary.timestamp.replace(/[:.]/g, "-")}-Attempt-${summary.attemptId}.txt`,
    text:
      failureSummary(summary) +
      "\n\nFULL RETAINED DIAGNOSTICS\n" +
      JSON.stringify(payload, null, 2),
  };
}
export function slimAttempt(attempt: RemittanceAttempt): RemittanceAttempt {
  // Review authority is retained verbatim. Remove only verbose observation copies after durable handoff.
  return immutableSnapshot({
    ...attempt,
    evidence: {
      ...attempt.evidence,
      rawPasses: [],
      assignments: [],
      physicalRows: attempt.evidence.physicalRows.map((row) => ({
        ...row,
        rawTokens: [],
      })),
    },
    corroboration: { ...attempt.corroboration, invoices: [], activities: [] },
    diagnostics: {
      ...attempt.diagnostics,
      FACT: { ...attempt.diagnostics.FACT, rawPasses: [], assignments: [] },
      NORMALIZATION: {
        ...attempt.diagnostics.NORMALIZATION,
        rows: attempt.evidence.physicalRows.map((row) => ({
          ...row,
          rawTokens: [],
        })),
      },
    },
  });
}
export function captureReport(
  capture: ScanCapture | null,
  preparation: string[],
) {
  return { capture, preparation };
}

function boundedOptical(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const e = value as {
    images?: Array<Record<string, unknown>>;
    notes?: string[];
    probe?: unknown;
    timings?: unknown;
  };
  let budget = 11000000;
  const notes = [...(e.notes ?? [])];
  const priority = (label:unknown) => {const index=["Chosen OCR variant","Original capture","Normalized image","Final OCR input","Orientation OCR variant"].indexOf(String(label));return index<0?99:index;};
  const images = (e.images ?? []).slice().sort((a,b)=>priority(a.label)-priority(b.label)).slice(0,6).map((image) => {
    const b = typeof image.base64 === "string" ? image.base64 : "";
    if (
      !/^(image\/jpeg|image\/png)$/.test(String(image.mime)) ||
      !/^[A-Za-z0-9+/=]*$/.test(b) ||
      b.length > budget
    ) {
      notes.push(
        String(image.label) + ": bytes omitted by bounded diagnostic retention",
      );
      return { ...image, base64: "" };
    }
    budget -= b.length;
    return image;
  });
  return { images, notes, probe: e.probe, timings:e.timings };
}
