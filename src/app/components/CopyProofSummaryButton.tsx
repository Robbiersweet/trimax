"use client";

import { useState } from "react";

type CopyProofSummaryButtonProps = {
  disabled?: boolean;
  summary: string;
};

export default function CopyProofSummaryButton({
  disabled = false,
  summary,
}: CopyProofSummaryButtonProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copySummary() {
    if (disabled || !summary.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2600);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 3200);
    }
  }

  const label =
    copyState === "copied"
      ? "Copied summary"
      : copyState === "failed"
        ? "Copy failed"
        : "Copy proof summary";

  return (
    <button
      type="button"
      className="proof-summary-copy-button rounded-2xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm font-black text-sky-100 shadow-lg shadow-sky-950/10 transition hover:border-sky-300 hover:bg-sky-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={copySummary}
    >
      {label}
    </button>
  );
}
