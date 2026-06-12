"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { appendUnitHistoryForQueueItem } from "../lib/unitHistory";
import Button from "./Button";
import DateInputField from "./DateInputField";

type MarkScheduledButtonProps = {
  queueItemId: string;
  businessId?: string | null;
  businessSlug?: string | null;
  label?: string | null;
  initialScheduledDate?: string | null;
  readyDate?: string | null;
};

export default function MarkScheduledButton({
  queueItemId,
  businessId,
  businessSlug,
  label,
  initialScheduledDate,
  readyDate,
}: MarkScheduledButtonProps) {
  const router = useRouter();
  const [scheduledDate, setScheduledDate] = useState(
    initialScheduledDate || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);

  const quickDates = [
    {
      label: "Today",
      value: today,
    },
    {
      label: "Tomorrow",
      value: tomorrow,
    },
    ...(readyDate
      ? [
          {
            label: "Paint Due Date",
            value: readyDate,
          },
        ]
      : []),
  ];

  const handleMarkScheduled = async () => {
    setErrorMessage("");

    if (!scheduledDate) {
      setErrorMessage(
        "Choose the work date first, then click Schedule."
      );
      return;
    }

    setIsSaving(true);

    let error: unknown = null;

    try {
      await assertCanWriteDuringMaintenance(businessSlug);

      const result = await supabase
        .from("queue_items")
        .update({
          status: "Scheduled",
          scheduled_date: scheduledDate,
        })
        .eq("id", queueItemId);
      error = result.error;
    } catch (caughtError) {
      error = caughtError;
    }

    if (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save this scheduled date. Refresh the page, then try again."
      );
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

    await appendUnitHistoryForQueueItem({
      queueItemId,
      businessId,
      eventType: "scheduled",
      eventDate: scheduledDate,
    });

    setIsSaving(false);
    router.refresh();
  };

  return (
    <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <DateInputField
          label="Work Date"
          value={scheduledDate}
          onChange={setScheduledDate}
          labelClassName="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500"
        />

        <Button
          onClick={handleMarkScheduled}
          variant="secondary"
          disabled={isSaving}
        >
          {isSaving
            ? "Scheduling..."
            : initialScheduledDate
              ? "Update Schedule"
              : "Schedule"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickDates.map((quickDate) => (
          <button
            key={`${quickDate.label}-${quickDate.value}`}
            type="button"
            onClick={() => setScheduledDate(quickDate.value)}
            className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
              scheduledDate === quickDate.value
                ? "app-chip-active border-orange-500 bg-orange-500 text-black"
                : "app-chip border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-orange-500/70"
            }`}
          >
            {quickDate.label}
          </button>
        ))}
      </div>

      {errorMessage ? (
        <p className="mt-3 text-sm font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
