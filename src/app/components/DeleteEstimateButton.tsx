"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";

type DeleteEstimateButtonProps = {
  estimateId: string;
  businessId?: string | null;
  estimateLabel?: string | null;
  returnHref?: string;
};

export default function DeleteEstimateButton({
  estimateId,
  businessId,
  estimateLabel,
  returnHref,
}: DeleteEstimateButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleDelete() {
    setErrorMessage("");

    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsDeleting(true);

    try {
      const { data: linkedInvoices, error: linkedInvoiceError } = await supabase
        .from("invoices")
        .select("id")
        .eq("estimate_id", estimateId)
        .limit(1);

      if (linkedInvoiceError) {
        console.error(linkedInvoiceError);
        setErrorMessage(
          linkedInvoiceError.message ||
            "Unable to check this estimate before deleting. Refresh the page, then try again."
        );
        return;
      }

      if ((linkedInvoices ?? []).length > 0) {
        setErrorMessage(
          "This estimate is linked to an invoice. Delete the linked invoice first, then refresh this page."
        );
        return;
      }

      const { error: lineItemError } = await supabase
        .from("estimate_line_items")
        .delete()
        .eq("estimate_id", estimateId);

      if (lineItemError) {
        console.warn("Estimate line item cleanup skipped:", lineItemError.message);
      }

      const { error: queueError } = await supabase
        .from("queue_items")
        .update({
          linked_estimate_id: null,
          status: "Pending Estimate",
        })
        .eq("linked_estimate_id", estimateId);

      if (queueError) {
        console.warn("Estimate queue unlink skipped:", queueError.message);
      }

      const { error } = await supabase
        .from("estimates")
        .delete()
        .eq("id", estimateId);

      if (error) {
        console.error(error);
        setErrorMessage(
          error.message ||
            "Unable to delete this estimate. Refresh the page, then try again."
        );
        return;
      }

      await logActivity({
        businessId,
        action: "estimate.deleted",
        entityType: "estimate",
        entityId: estimateId,
        entityLabel: estimateLabel ?? "Estimate",
        details: {
          estimateLabel,
        },
      });

      setIsConfirming(false);

      if (returnHref) {
        router.push(returnHref);
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete this estimate. Refresh the page, then try again."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-2">
      {isConfirming ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold leading-6 text-red-200">
          Click delete again to permanently remove this estimate.
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
            ? "Yes, Delete Estimate"
            : "Delete Estimate"}
      </Button>

      {isConfirming && !isDeleting ? (
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className="text-sm font-semibold text-zinc-400 transition hover:text-orange-300"
        >
          Keep estimate
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
