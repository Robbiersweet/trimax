import type { ScanRecord } from "./ocrHistory";
export const debugStatuses = [
  "Needs Investigation",
  "Investigated",
  "Regression Covered",
  "Resolved",
] as const;
export type DebugStatus = (typeof debugStatuses)[number];
export const debugFilters = [
  "Needs Investigation",
  "Failed",
  "Review Required",
  "Pinned",
  "All Recent",
] as const;
export type DebugFilter = (typeof debugFilters)[number];
export type DebugAttempt = ScanRecord & {
  business_id: string;
  debug_status: DebugStatus;
  investigation_note: string;
  regression_id: string;
  investigated_at: string | null;
  resolved_at: string | null;
  debug_updated_at: string | null;
  debug_worthy: boolean;
};
export const debugColumns =
  "id,business_id,created_at,original_id,parent_id,result,summary,pinned,diagnostics_expires_at,diagnostic_bytes,debug_status,investigation_note,regression_id,investigated_at,resolved_at,debug_updated_at,debug_worthy";
export const summaryColumns =
  "id,created_at,original_id,parent_id,result,summary,pinned,diagnostics_expires_at,diagnostic_bytes";
export function attemptPath(id: string, business: string) {
  return `/admin/ocr-attempts/${encodeURIComponent(id)}?business=${encodeURIComponent(business)}`;
}
export function debugQueuePath(
  business: string,
  filter: DebugFilter = "Needs Investigation",
  cursor?: { created_at: string; id: string },
) {
  const query = new URLSearchParams({ business, filter });
  if (cursor) {
    query.set("before", cursor.created_at);
    query.set("beforeId", cursor.id);
  }
  return `/admin/ocr-attempts?${query}`;
}
export function parseDebugFilter(value?: string): DebugFilter {
  return (
    debugFilters.find((filter) => filter === value) ?? "Needs Investigation"
  );
}
export function diagnosticsAvailable(attempt: ScanRecord, now = Date.now()) {
  return (
    attempt.diagnostic_bytes > 0 &&
    (attempt.pinned ||
      Boolean(
        attempt.diagnostics_expires_at &&
        Date.parse(attempt.diagnostics_expires_at) > now,
      ))
  );
}

// Redact credentials on inspection without modifying the saved immutable evidence.
// OCR word/token geometry is intentionally retained.
export function safeDiagnosticView(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value ?? null, (key, entry) => {
      if (
        /^(authorization|password|access_?token|refresh_?token|api_?key|service_?role_?key|client_?secret|secret_?key)$/i.test(
          key,
        )
      )
        return "[REDACTED]";
      if (typeof entry === "string")
        return entry
          .replace(
            /Bearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/gi,
            "Bearer [REDACTED]",
          )
          .replace(
            /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
            "[REDACTED JWT]",
          );
      return entry;
    }),
  );
}
