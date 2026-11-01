// Read-only presentation of recorded metadata. Never repair or persist evidence here.
type Fields = { timestamp?: unknown; build?: unknown; release?: unknown };
type ShadowFields = { attemptId?: string; legacyAttemptId?: string; shadowAttemptId?: string; ocrEngine?: string; sourceImageHash?: string; result?: string };

function recordedDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function diagnosticDate(summary: Fields, createdAt?: string, utc = false) {
  const captured = recordedDate(summary.timestamp);
  const date = captured ?? recordedDate(createdAt);
  return {
    label: captured ? "Scanned" : date ? "Saved" : "Date",
    value: date ? (utc ? date.toISOString().replace("T", " ").replace("Z", " UTC") : date.toLocaleString()) : "Date unavailable",
  };
}

export function recordedDiagnosticBuild(summary: Fields): string | null {
  if (typeof summary.build === "string" && summary.build.trim()) return summary.build.trim();
  const release = summary.release;
  if (!release || typeof release !== "object" || Array.isArray(release)) return null;
  const { releaseId, sourceCommit } = release as { releaseId?: unknown; sourceCommit?: unknown };
  const id = typeof releaseId === "string" && releaseId.trim() ? releaseId.trim() : null;
  const commit = typeof sourceCommit === "string" && /^[a-f0-9]{40}$/i.test(sourceCommit) ? sourceCommit.slice(0, 7) : null;
  return id || commit ? `Worker ${[id, commit ? `source ${commit}` : null].filter(Boolean).join(" · ")}` : null;
}

export function completedPairedShadow(legacy: ShadowFields, shadow: ShadowFields | null) {
  if (!shadow || legacy.ocrEngine === "v2-shadow" || shadow.ocrEngine !== "v2-shadow" ||
      !legacy.shadowAttemptId || shadow.attemptId !== legacy.shadowAttemptId ||
      shadow.legacyAttemptId !== legacy.attemptId ||
      !/^[a-f0-9]{64}$/i.test(legacy.sourceImageHash ?? "") ||
      shadow.sourceImageHash?.toLowerCase() !== legacy.sourceImageHash?.toLowerCase()) return null;
  return ["review", "success", "failed"].includes(shadow.result ?? "") ? shadow.result! : null;
}

export function shadowFieldFallback(shadow: ShadowFields | null) {
  return shadow && ["review", "success", "failed"].includes(shadow.result ?? "") ? "Unknown" : "Pending";
}
