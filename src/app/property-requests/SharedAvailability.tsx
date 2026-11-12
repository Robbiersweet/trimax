"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Slot = {
  property: string;
  state: "confirmed" | "pending" | "date_only" | "pending_date";
  starts_at: string | null;
  ends_at: string | null;
  conflicts: boolean;
};

export default function SharedAvailability({ assignmentId, date, windowId }: { assignmentId: string; date: string; windowId: string }) {
  const [result, setResult] = useState<{ date: string; windowId: string; slots: Slot[] | null }>();
  useEffect(() => {
    if (!date || !assignmentId) return;
    let current = true;
    const refresh = async () => {
      const { data, error } = await supabase.rpc("trimax_manager_availability", {
        p_assignment_id: assignmentId,
        p_day: date,
        p_window: windowId || null,
      });
      if (current) setResult({ date, windowId, slots: error ? null : data as Slot[] });
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [assignmentId, date, windowId]);

  if (!date) return null;
  const slots = result?.date === date && result.windowId === windowId ? result.slots : undefined;
  const label = {
    confirmed: "Confirmed",
    pending: "Pending owner approval",
    date_only: "Scheduled date · time unspecified",
    pending_date: "Requested date · time unspecified",
  };
  const time = (value: string) => new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return <section aria-label="Shared workspace availability" className="rounded-lg border p-3">
    <h3 className="font-semibold">Shared availability</h3>
    {slots === undefined ? <p role="status">Checking availability…</p>
      : slots === null ? <p role="status">Availability is unavailable.</p>
      : slots.length === 0 ? <p>No known commitments on this date.</p>
      : <>
        {slots.some(slot => slot.conflicts) && <p role="status" className="font-semibold">Your preferred window overlaps another commitment.</p>}
        <p className="text-sm">Review the commitments below before choosing a time. You can still submit a request for owner review.</p>
        <ul className="mt-2 space-y-2">{slots.map((slot, index) => <li key={index} className="text-sm">
          <strong>{slot.property}</strong> · {label[slot.state]}
          {slot.starts_at && slot.ends_at ? ` · ${time(slot.starts_at)}–${time(slot.ends_at)}` : ""}
        </li>)}</ul>
      </>}
  </section>;
}
