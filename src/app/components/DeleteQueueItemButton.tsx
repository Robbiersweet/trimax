"use client";

import { useState } from "react";
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleDelete = async () => {
    setErrorMessage("");

    const confirmed = window.confirm(
      "Are you sure you want to delete this queue item?"
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    const { error } = await supabase
      .from("queue_items")
      .delete()
      .eq("id", queueItemId);

    if (error) {
      console.error(error);
      setErrorMessage(
        "Unable to delete this queue item. Refresh the page, then try again."
      );
      setIsDeleting(false);
      return;
    }

    router.push(returnHref);
    router.refresh();
  };

  return (
    <div className="grid gap-2">
      <Button
        onClick={handleDelete}
        variant="secondary"
        disabled={isDeleting}
      >
        {isDeleting ? "Deleting..." : "Delete Queue Item"}
      </Button>

      {errorMessage ? (
        <p className="text-sm font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
