"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { remittanceDeadline } from "../lib/remittanceDeadline";

type Props = { onCapture: (file: File) => void; onCancel: () => void; onManual: () => void };

/** The guide and video share their intrinsic aspect ratio. Capture keeps every source pixel. */
export default function RemittanceCamera({ onCapture, onCancel, onManual }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef(true);
  const capturing = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  const [landscape, setLandscape] = useState(false);
  const [ratio, setRatio] = useState(4 / 3);
  const [viewport, setViewport] = useState({ width: 0, height: 0, left: 0, top: 0 });

  function stop() {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    let expired = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("trimax-remittance-capture-active");
    window.dispatchEvent(new Event("trimax-remittance-capture-mode"));
    const update = () => {
      const vv = window.visualViewport;
      const width = vv?.width ?? window.innerWidth, height = vv?.height ?? window.innerHeight;
      setViewport({ width, height, left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0 });
      setLandscape(width > height);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    const hidden = () => { if (document.hidden) { stop(); setReady(false); setError("Camera paused. Tap Retry Camera to continue."); } };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", hidden);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Error("Live camera is unavailable. Choose an existing photo or enter manually.");
        const pending = navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 2160 } } });
        // getUserMedia cannot be aborted: release late permission results as well.
        void pending.then(result => { if (cancelled || expired) result.getTracks().forEach(track => track.stop()); }, () => {});
        const result = await remittanceDeadline(pending, 15_000, "Camera did not open. Allow camera access and tap Retry Camera.");
        if (cancelled || document.hidden) { result.getTracks().forEach(track => track.stop()); return; }
        stream.current = result;
        const element = video.current;
        if (!element) throw Error("Camera preview is unavailable. Retry Camera.");
        element.srcObject = result;
        await remittanceDeadline(element.play(), 10_000, "Camera preview did not start. Tap Retry Camera.");
        if (!cancelled) { setRatio(element.videoWidth / element.videoHeight || 4 / 3); setReady(true); }
        result.getVideoTracks()[0]?.addEventListener("ended", () => { if (!cancelled) { setReady(false); setError("Camera stopped. Tap Retry Camera."); } });
      } catch (reason) {
        expired = true;
        if (!cancelled) { stop(); setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "Camera access was denied. Allow camera access in iPhone Settings, then tap Retry Camera, or choose an existing photo." : reason instanceof Error ? reason.message : "Camera could not open. Retry or choose an existing photo."); }
      }
    })();
    return () => {
      cancelled = true; active.current = false; stop();
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("trimax-remittance-capture-active");
      window.dispatchEvent(new Event("trimax-remittance-capture-mode"));
      window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("keydown", escape); document.removeEventListener("visibilitychange", hidden);
    };
  }, [generation, onCancel]);

  async function capture() {
    if (capturing.current || !ready || !landscape) return;
    capturing.current = true; setBusy(true); setError("");
    try {
      const element = video.current;
      if (!element?.videoWidth || !element.videoHeight) throw Error("Camera is not ready. Retry Camera.");
      const canvas = document.createElement("canvas");
      canvas.width = element.videoWidth; canvas.height = element.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Photo could not be prepared. Retry Camera.");
      context.drawImage(element, 0, 0);
      const blob = await remittanceDeadline(new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error("Photo could not be saved. Retry Camera.")), "image/jpeg", 0.95)), 8_000, "Photo could not be saved. Retry Camera.");
      if (!active.current) return;
      stop(); onCapture(new File([blob], `remittance-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Capture failed. Retry Camera."); }
    finally { capturing.current = false; if (active.current) setBusy(false); }
  }

  // Reserve a control column in landscape; the video itself is contained without clipping.
  const width = Math.max(1, Math.min(viewport.width - (landscape ? 220 : 32), (viewport.height - (landscape ? 32 : 260)) * ratio));
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Remittance camera" className="fixed z-[2147483000] flex overflow-hidden bg-black text-white" style={{ left: viewport.left, top: viewport.top, width: viewport.width || "100vw", height: viewport.height || "100dvh", flexDirection: landscape ? "row" : "column", padding: "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))" }}>
    <button autoFocus type="button" onClick={onCancel} className="absolute left-[max(12px,env(safe-area-inset-left))] top-[max(12px,env(safe-area-inset-top))] z-10 min-h-11 rounded-xl border border-white/40 bg-black/70 px-4">Cancel</button>
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <div className="relative max-h-full max-w-full overflow-hidden" style={{ width, aspectRatio: ratio }}>
        <video ref={video} muted playsInline autoPlay disablePictureInPicture className="block h-full w-full object-contain" onResize={event => { const el = event.currentTarget; if (el.videoHeight) setRatio(el.videoWidth / el.videoHeight); }} />
        {ready && <div aria-label="Document framing guide" className="pointer-events-none absolute left-[7%] right-[7%] top-1/2 -translate-y-1/2 rounded-xl border-[3px] border-white shadow-[0_0_0_100vmax_#0006]" style={{ aspectRatio: "2.6 / 1", maxHeight: "80%" }} />}
      </div>
    </div>
    <div className="flex shrink-0 flex-col justify-center gap-2 overflow-y-auto p-2 text-center" style={{ width: landscape ? 196 : "100%" }}>
      <p aria-live="polite" className="font-bold">{!landscape ? "Rotate phone to landscape" : "Place the full remittance stub inside the frame."}</p>
      <p className="text-xs text-zinc-200">Keep all four paper edges visible.</p>
      {error ? <p role="alert" className="text-sm text-amber-200">{error}</p> : <p role="status" className="text-sm">{busy ? "Saving photo…" : ready ? "Ready to capture" : "Opening camera…"}</p>}
      <button type="button" disabled={!ready || !landscape || busy} onClick={() => void capture()} className="min-h-12 rounded-full bg-white px-4 py-3 font-bold text-black disabled:opacity-40">{busy ? "Saving…" : "Capture"}</button>
      {error && <button type="button" disabled={busy} onClick={() => { setReady(false); setError(""); setGeneration(value => value + 1); }} className="min-h-11 rounded-xl border border-white/40">Retry Camera</button>}
      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-white/40 px-2 text-sm">Choose Existing Photo<input type="file" accept="image/*,.heic,.heif" className="sr-only" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) { stop(); onCapture(file); } }} /></label>
      <button type="button" onClick={onManual} className="min-h-11 text-sm underline">Enter Manually</button>
    </div>
  </div>, document.body);
}
