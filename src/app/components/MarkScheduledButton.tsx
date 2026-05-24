"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import Button from "./Button";

type MarkScheduledButtonProps = {
  queueItemId: string;
};

export default function MarkScheduledButton({
  queueItemId,
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
