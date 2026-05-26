"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import Button from "./Button";

type DeleteQueueItemButtonProps = {
  queueItemId: string;
  returnHref: string;
};

export default function DeleteQueueItemButton({
  queueItemId,
  returnHref,
}: DeleteQueueItemButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this queue item?"
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("queue_items")
      .delete()
      .eq("id", queueItemId);

    if (error) {
      alert("Unable to delete queue item.");
      console.error(error);
      return;
    }

    router.push(returnHref);
    router.refresh();
  };

  return (
    <Button onClick={handleDelete} variant="secondary">
      Delete Queue Item
    </Button>
  );
}
