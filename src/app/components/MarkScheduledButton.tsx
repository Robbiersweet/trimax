"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
import Button from "./Button";

type MarkScheduledButtonProps = {
  queueItemId: string;
  businessId?: string | null;
  label?: string | null;
  initialScheduledDate?: string | null;
};

export default function MarkScheduledButton({
  queueItemId,
  businessId,
  label,
  initialScheduledDate,
}: MarkScheduledButtonProps) {
  const router = useRouter();
  const [scheduledDate, setScheduledDate] = useState(
    initialScheduledDate || ""
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleMarkScheduled = async () => {
    if (!scheduledDate) {
      alert("Please choose the work scheduled date first.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("queue_items")
      .update({
        status: "Scheduled",
        scheduled_date: scheduledDate,
      })
      .eq("id", queueItemId);

    if (error) {
      console.error(error);

      alert("Unable to mark queue item as scheduled.");
      setIsSaving(false);

      return;
    }

    await logActivity({
      businessId,
      action: "queue_item.scheduled",
      entityType: "queue_item",
      entityId: queueItemId,
      entityLabel: label,
      details: {
        scheduledDate,
      },
    });

    setIsSaving(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 sm:flex-row sm:items-end">
      <div>
        <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">
          Work Date
        </label>

        <input
          type="date"
          value={scheduledDate}
          onChange={(event) => setScheduledDate(event.target.value)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500 sm:w-44"
        />
      </div>

      <Button
        onClick={handleMarkScheduled}
        variant="secondary"
      >
        {isSaving
          ? "Scheduling..."
          : initialScheduledDate
            ? "Update Schedule"
            : "Schedule"}
      </Button>
    </div>
  );
}
