"use client";
import { useState } from "react";
import { scanOptical } from "../lib/ocrHistoryClient";
import type { OpticalEvidence } from "../lib/ocrOptical";
export default function OpticalEvidenceView({
  attemptId,
}: {
  attemptId: string;
}) {
  const [open, setOpen] = useState(false),
    [evidence, setEvidence] = useState<OpticalEvidence | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      setEvidence(await scanOptical(attemptId));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Optical evidence unavailable");
    }
  }
  return (
    <details
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (e.currentTarget.open && !loaded) void load();
      }}
    >
      <summary className="cursor-pointer font-semibold">
        Optical Evidence
      </summary>
      {open && (
        <div className="mt-3 space-y-4">
          {error && <p>{error}</p>}
          {!loaded && !error && <p>Loading optical evidence…</p>}
          {loaded && !evidence && (
            <p>
              No retained optical images are available for this attempt. Older
              attempts cannot be reconstructed.
            </p>
          )}
          {evidence?.images.map((image, i) => (
            <figure key={i} className="rounded-lg border border-white/20 p-3">
              <figcaption>
                <strong>{image.label}</strong>
                <p>
                  {image.width} × {image.height} · {image.mime} · EXIF{" "}
                  {image.exifOrientation ?? "not present/unknown"} · applied
                  document rotation {image.rotation}° · {image.source}
                </p>
                <p className="text-xs">{image.transformation}</p>
              </figcaption>
              {image.base64 ? (
                <a
                  href={`data:${image.mime};base64,${image.base64}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Inspect ${image.label}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={image.label}
                    src={`data:${image.mime};base64,${image.base64}`}
                    className="mt-2 max-h-96 w-full object-contain"
                  />
                </a>
              ) : (
                <p>Image bytes were not retained.</p>
              )}
            </figure>
          ))}
          {evidence?.notes.map((n, i) => (
            <p className="break-words text-xs" key={i}>
              {n}
            </p>
          ))}
          {evidence?.probe !== undefined && (
            <details>
              <summary>Orientation probe evidence</summary>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify({probes:evidence.probe,timings:evidence.timings}, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </details>
  );
}
