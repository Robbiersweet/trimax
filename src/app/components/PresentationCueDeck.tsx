"use client";

import { useMemo, useState } from "react";

type PresentationCue = {
  title: string;
  kicker: string;
  detail: string;
  proof: string;
};

type PresentationCueDeckProps = {
  cues: PresentationCue[];
};

export default function PresentationCueDeck({
  cues,
}: PresentationCueDeckProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  const activeCue = cues[activeIndex] ?? cues[0];
  const progress = useMemo(
    () => (cues.length > 0 ? ((activeIndex + 1) / cues.length) * 100 : 0),
    [activeIndex, cues.length]
  );

  function moveCue(direction: -1 | 1) {
    setActiveIndex((current) =>
      Math.min(Math.max(current + direction, 0), cues.length - 1)
    );
  }

  async function copyCue() {
    if (!activeCue) {
      return;
    }

    const text = [
      activeCue.kicker,
      activeCue.title,
      "",
      activeCue.detail,
      "",
      `Proof: ${activeCue.proof}`,
    ].join("\n");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "true");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2800);
    }
  }

  if (cues.length === 0 || !activeCue) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="property-sales-present-button rounded-2xl border border-emerald-300/40 bg-emerald-400/10 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        onClick={() => setIsOpen(true)}
      >
        Start Presentation Mode
      </button>

      {isOpen ? (
        <div
          className="presentation-cue-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section
            aria-label="Trimax presentation mode"
            className="presentation-cue-panel"
            role="dialog"
            aria-modal="true"
          >
            <div className="presentation-cue-topline">
              <div>
                <p>Presentation Mode</p>
                <h2>Win the room</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="presentation-cue-close"
              >
                Close
              </button>
            </div>

            <div className="presentation-cue-progress" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>

            <div className="presentation-cue-card">
              <p className="presentation-cue-kicker">{activeCue.kicker}</p>
              <h3>{activeCue.title}</h3>
              <p>{activeCue.detail}</p>
              <div className="presentation-cue-proof">
                <span>Proof point</span>
                <strong>{activeCue.proof}</strong>
              </div>
            </div>

            <div className="presentation-cue-footer">
              <button
                type="button"
                onClick={() => moveCue(-1)}
                disabled={activeIndex === 0}
              >
                Previous
              </button>
              <span>
                {activeIndex + 1} / {cues.length}
              </span>
              <button
                type="button"
                onClick={() => moveCue(1)}
                disabled={activeIndex === cues.length - 1}
              >
                Next
              </button>
              <button type="button" onClick={copyCue}>
                {copyState === "copied"
                  ? "Cue copied"
                  : copyState === "failed"
                    ? "Copy failed"
                    : "Copy cue"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
