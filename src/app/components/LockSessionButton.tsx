"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { clearSecureBrowserSession } from "../lib/sessionSecurity";

type LockSessionButtonProps = {
  className?: string;
};

export default function LockSessionButton({
  className = "",
}: LockSessionButtonProps) {
  const router = useRouter();
  const [locking, setLocking] = useState(false);

  async function handleLock() {
    setLocking(true);
    clearSecureBrowserSession();

    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?security=manual-lock");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLock}
      disabled={locking}
      className={`lock-session-button inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {locking ? "Locking..." : "Lock Now"}
    </button>
  );
}
