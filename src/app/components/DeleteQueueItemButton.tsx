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
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleDelete = async () => {
    setErrorMessage("");

    if (!isConfirming) {
      setIsConfirming(true);
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
      {isConfirming ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold leading-6 text-red-200">
          Click delete again to permanently remove this queue item.
        </p>
      ) : null}

      <Button
        onClick={handleDelete}
        variant="secondary"
        disabled={isDeleting}
      >
        {isDeleting
          ? "Deleting..."
          : isConfirming
            ? "Yes, Delete Queue Item"
            : "Delete Queue Item"}
      </Button>

      {isConfirming && !isDeleting ? (
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className="text-sm font-semibold text-zinc-400 transition hover:text-orange-300"
        >
          Keep queue item
        </button>
      ) : null}

      {errorMessage ? (
        <p className="text-sm font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
