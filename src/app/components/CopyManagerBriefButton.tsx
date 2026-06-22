"use client";

import { useState } from "react";

type CopyManagerBriefButtonProps = {
  brief: string;
  label?: string;
  copiedLabel?: string;
};

export default function CopyManagerBriefButton({
  brief,
  label = "Copy Manager Brief",
  copiedLabel = "Manager brief copied",
}: CopyManagerBriefButtonProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copyBrief() {
    if (!brief.trim()) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(brief);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = brief;
        textArea.setAttribute("readonly", "true");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2600);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 3200);
    }
  }

  const displayLabel =
    copyState === "copied"
      ? copiedLabel
      : copyState === "failed"
        ? "Copy failed"
        : label;

  return (
    <button
      type="button"
      className="property-sales-copy-brief rounded-2xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      onClick={copyBrief}
    >
      {displayLabel}
    </button>
  );
}
