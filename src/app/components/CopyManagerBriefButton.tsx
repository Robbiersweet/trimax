"use client";

import { useState } from "react";

type CopyManagerBriefButtonProps = {
  brief: string;
};

export default function CopyManagerBriefButton({
  brief,
}: CopyManagerBriefButtonProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copyBrief() {
    if (!brief.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(brief);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2600);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 3200);
    }
  }

  const label =
    copyState === "copied"
      ? "Manager brief copied"
      : copyState === "failed"
        ? "Copy failed"
        : "Copy Manager Brief";

  return (
    <button
      type="button"
      className="property-sales-copy-brief rounded-2xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      onClick={copyBrief}
    >
      {label}
    </button>
  );
}
