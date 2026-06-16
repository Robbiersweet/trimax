"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  type: "success" | "error";
  message: string;
  durationMs?: number;
};

export default function Toast({ type, message, durationMs }: ToastProps) {
  const toastKey = `${type}:${message}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const timeoutMs = durationMs ?? (type === "success" ? 20_000 : 30_000);

  useEffect(() => {
    if (timeoutMs <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDismissedKey(toastKey);
    }, timeoutMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [timeoutMs, toastKey]);

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
      className={`app-toast fixed bottom-6 right-6 z-50 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-2xl border px-5 py-4 text-sm font-semibold leading-6 shadow-2xl sm:max-w-md ${styles[type]}`}
      role={type === "error" ? "alert" : "status"}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        aria-label="Dismiss notification"
        className="rounded-full px-2 py-0.5 text-xs font-black leading-5 opacity-70 transition hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
        onClick={() => setDismissedKey(toastKey)}
        type="button"
      >
        x
      </button>
    </div>
  );
}
