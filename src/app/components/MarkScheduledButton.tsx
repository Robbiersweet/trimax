"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
import Button from "./Button";

type MarkScheduledButtonProps = {
  queueItemId: string;
  businessId?: string | null;
  label?: string | null;
};

export default function MarkScheduledButton({
  queueItemId,
  businessId,
  label,
}: MarkScheduledButtonProps) {
  const router = useRouter();

  const handleMarkScheduled = async () => {
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("queue_items")
      .update({
        status: "Scheduled",
        scheduled_date: today,
      })
      .eq("id", queueItemId);

    if (error) {
      console.error(error);

      alert("Unable to mark queue item as scheduled.");

      return;
    }

    await logActivity({
      businessId,
      action: "queue_item.scheduled",
      entityType: "queue_item",
      entityId: queueItemId,
      entityLabel: label,
      details: {
        scheduledDate: today,
      },
    });

    router.refresh();
  };

  return (
    <Button
      onClick={handleMarkScheduled}
      variant="secondary"
    >
      Mark Scheduled
    </Button>
  );
}
