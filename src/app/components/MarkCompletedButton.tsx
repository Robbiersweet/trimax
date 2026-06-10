"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { appendUnitHistoryForQueueItem } from "../lib/unitHistory";
import Button from "./Button";

type MarkCompletedButtonProps = {
  queueItemId: string;
  businessId?: string | null;
  businessSlug?: string | null;
  label?: string | null;
};

export default function MarkCompletedButton({
  queueItemId,
  businessId,
  businessSlug,
  label,
}: MarkCompletedButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleMarkCompleted = async () => {
    setErrorMessage("");
    setIsSaving(true);

    const today = new Date().toISOString().slice(0, 10);

    let error: unknown = null;

    try {
      await assertCanWriteDuringMaintenance(businessSlug);

      const result = await supabase
        .from("queue_items")
        .update({
          status: "Completed",
          completed_date: today,
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
          : "Unable to mark this queue item completed. Refresh the page, then try again."
      );
      setIsSaving(false);

      return;
    }

    await logActivity({
      businessId,
      action: "queue_item.completed",
      entityType: "queue_item",
      entityId: queueItemId,
      entityLabel: label,
      details: {
        completedDate: today,
      },
    });

    await appendUnitHistoryForQueueItem({
      queueItemId,
      businessId,
      eventType: "general_turn",
      eventDate: today,
    });

    setIsSaving(false);
    router.refresh();
  };

  return (
    <div className="grid gap-2">
      <Button
        onClick={handleMarkCompleted}
        disabled={isSaving}
      >
        {isSaving ? "Saving..." : "Mark Completed"}
      </Button>

      {errorMessage ? (
        <p className="text-sm font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
