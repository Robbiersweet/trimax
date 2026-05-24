"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
import Button from "./Button";

type MarkCompletedButtonProps = {
  queueItemId: string;
  businessId?: string | null;
  label?: string | null;
};

export default function MarkCompletedButton({
  queueItemId,
  businessId,
  label,
}: MarkCompletedButtonProps) {
  const router = useRouter();

  const handleMarkCompleted = async () => {
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("queue_items")
      .update({
        status: "Completed",
        completed_date: today,
      })
      .eq("id", queueItemId);

    if (error) {
      console.error(error);

      alert("Unable to mark queue item as completed.");

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

    router.refresh();
  };

  return (
    <Button onClick={handleMarkCompleted}>
      Mark Completed
    </Button>
  );
}
