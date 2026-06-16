"use client";

import { useEffect, useState } from "react";
import {
  getSessionSecuritySnapshot,
  SESSION_IDLE_TIMEOUT_MS,
} from "../lib/sessionSecurity";

function formatMinutes(valueMs: number) {
  const minutes = Math.max(Math.ceil(valueMs / 60000), 0);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  return `${minutes}m`;
}

type SecureSessionBadgeProps = {
  className?: string;
};

export default function SecureSessionBadge({
  className = "",
}: SecureSessionBadgeProps) {
  const [label, setLabel] = useState("Secure session");
  const [detail, setDetail] = useState("Auto-lock enabled");

  useEffect(() => {
    function refresh() {
      const snapshot = getSessionSecuritySnapshot();

      if (!snapshot.hasSecureSession) {
        setLabel("Secure session");
        setDetail("Locks on reopen");
        return;
      }

      const idleLabel = formatMinutes(snapshot.idleRemainingMs);
      const maxLabel = formatMinutes(snapshot.sessionRemainingMs);

      setLabel(`${idleLabel} idle lock`);
      setDetail(`Max ${maxLabel}`);
    }

    refresh();

    const intervalId = window.setInterval(refresh, 30000);
    const activityEvents = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
    ];

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, refresh, {
        passive: true,
      });
    }

    return () => {
      window.clearInterval(intervalId);

      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, refresh);
      }
    };
  }, []);

  return (
    <div
      className={`secure-session-badge rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.55)]"
        />

        <p className="font-black text-emerald-100">
          {label}
        </p>
      </div>

      <p className="mt-1 text-xs font-semibold text-emerald-100/75">
        {detail || `Auto-lock ${formatMinutes(SESSION_IDLE_TIMEOUT_MS)}`}
      </p>
    </div>
  );
}
