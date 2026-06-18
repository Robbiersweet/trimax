"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ToastProps = {
  type: "success" | "error";
  message: string;
  durationMs?: number;
};

export default function Toast({ type, message, durationMs }: ToastProps) {
  const toastKey = `${type}:${message}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [pausedKey, setPausedKey] = useState<string | null>(null);
  const timeoutMs = durationMs ?? (type === "success" ? 20_000 : 30_000);
  const isPaused = pausedKey === toastKey;
  const remainingMsRef = useRef(timeoutMs);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    remainingMsRef.current = timeoutMs;
    startedAtRef.current = null;
    clearTimer();
  }, [clearTimer, timeoutMs, toastKey]);

  useEffect(() => {
    if (timeoutMs <= 0 || isPaused || dismissedKey === toastKey) {
      return;
    }

    startedAtRef.current = window.Date.now();
    timerRef.current = window.setTimeout(() => {
      setDismissedKey(toastKey);
    }, remainingMsRef.current);

    return () => {
      clearTimer();
    };
  }, [clearTimer, dismissedKey, isPaused, timeoutMs, toastKey]);

  const pauseToast = () => {
    if (timeoutMs <= 0 || isPaused || dismissedKey === toastKey) {
      return;
    }

    if (startedAtRef.current !== null) {
      remainingMsRef.current = Math.max(
        0,
        remainingMsRef.current - (window.Date.now() - startedAtRef.current),
      );
    }

    clearTimer();
    setPausedKey(toastKey);
  };

  const resumeToast = () => {
    if (timeoutMs <= 0 || dismissedKey === toastKey) {
      return;
    }

    setPausedKey((currentKey) => (currentKey === toastKey ? null : currentKey));
  };

  if (dismissedKey === toastKey) {
    return null;
  }

  const styles = {
    success:
      "app-toast-success border-emerald-400/45 bg-emerald-950 text-emerald-50 shadow-emerald-950/30",
    error:
      "app-toast-error border-red-400/45 bg-red-950 text-red-50 shadow-red-950/30",
  };

  return (
    <div
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`app-toast fixed z-50 flex max-w-[calc(100vw-2rem)] items-start gap-3 overflow-hidden rounded-2xl border px-5 py-4 text-sm font-semibold leading-6 shadow-2xl sm:max-w-md ${styles[type]}`}
      onBlur={resumeToast}
      onFocus={pauseToast}
      onMouseEnter={pauseToast}
      onMouseLeave={resumeToast}
      role={type === "error" ? "alert" : "status"}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-[0.7rem] font-black"
      >
        {type === "success" ? "OK" : "!"}
      </span>
      <span className="min-w-0 flex-1">{message}</span>
      <button
        aria-label="Dismiss notification"
        className="rounded-full px-2 py-0.5 text-xs font-black leading-5 opacity-70 transition hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
        onClick={() => setDismissedKey(toastKey)}
        type="button"
      >
        x
      </button>
      {timeoutMs > 0 ? (
        <span
          aria-hidden="true"
          className="app-toast-progress absolute bottom-0 left-0 h-1 w-full origin-left"
          style={{
            animationDuration: `${timeoutMs}ms`,
            animationPlayState: isPaused ? "paused" : "running",
          }}
        />
      ) : null}
    </div>
  );
}
