"use client";
import { useEffect, useState } from "react";
import type { ScanSummary } from "../lib/ocrHistory";
import { recordedDiagnosticBuild } from "../lib/ocrDiagnosticDisplay.ts";
import { diagnosticRecordedRelease } from "../lib/ocrDiagnosticDisplayClient";

export default function OcrDiagnosticBuild({ summary, attemptId, businessId }: { summary: ScanSummary; attemptId: string; businessId: string }) {
  const recorded = recordedDiagnosticBuild(summary);
  const key = `${businessId}:${attemptId}`;
  const [loaded, setLoaded] = useState<{ key: string; value: string }>({ key: "", value: "" });
  useEffect(() => {
    if (recorded) return;
    let active = true;
    void diagnosticRecordedRelease(businessId, attemptId).then(release => {
      if (active) setLoaded({ key: `${businessId}:${attemptId}`, value: recordedDiagnosticBuild({ release }) ?? "Not recorded" });
    }).catch(() => { if (active) setLoaded({ key: `${businessId}:${attemptId}`, value: "Build unavailable" }); });
    return () => { active = false; };
  }, [recorded, businessId, attemptId]);
  return <span>{recorded ?? (loaded.key === key ? loaded.value : "Loading recorded build…")}</span>;
}
