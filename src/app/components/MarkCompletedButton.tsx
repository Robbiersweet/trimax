"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import Button from "./Button";

type MarkCompletedButtonProps = {
  queueItemId: string;
};

export default function MarkCompletedButton({
  queueItemId,
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

    router.refresh();
  };

  return (
    <Button onClick={handleMarkCompleted}>
      Mark Completed
    </Button>
  );
}
