"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type DeleteClientButtonProps = {
  clientId: string;
  clientName: string;
  linkedEstimateCount?: number;
  linkedInvoiceCount?: number;
  returnHref?: string;
};

export default function DeleteClientButton({
  clientId,
  clientName,
  linkedEstimateCount = 0,
  linkedInvoiceCount = 0,
  returnHref,
}: DeleteClientButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const hasLinkedHistory = linkedEstimateCount > 0 || linkedInvoiceCount > 0;

  async function handleDelete() {
    setErrorMessage("");

    if (hasLinkedHistory) {
      setIsConfirming(true);
      setErrorMessage(
        "This client has estimates or invoices attached. Delete those records first, then delete the client."
      );
      return;
    }

    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsDeleting(true);

    try {
      const { data, error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId)
        .select("id");

      if (error) {
        setErrorMessage(
          error.message ||
            "Unable to delete this client. Refresh the page, then try again."
        );
        return;
      }

      if (!data || data.length === 0) {
        setErrorMessage(
          "Supabase did not delete this client. Client delete access may need to be enabled in Supabase."
        );
        return;
      }

      setIsConfirming(false);

      if (returnHref) {
        router.push(returnHref);
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete this client. Refresh the page, then try again."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-2">
      {isConfirming ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold leading-6 text-red-200">
          {hasLinkedHistory
            ? `${clientName} has ${linkedEstimateCount} estimate(s) and ${linkedInvoiceCount} invoice(s).`
            : `Click delete again to permanently remove ${clientName}.`}
        </p>
      ) : null}

      <Button
        onClick={handleDelete}
        variant="secondary"
        disabled={isDeleting}
      >
        {isDeleting
          ? "Deleting..."
          : isConfirming && !hasLinkedHistory
            ? "Yes, Delete Client"
            : "Delete Client"}
      </Button>

      {isConfirming && !isDeleting ? (
        <button
          type="button"
          onClick={() => {
            setIsConfirming(false);
            setErrorMessage("");
          }}
          className="text-sm font-semibold text-zinc-400 transition hover:text-orange-300"
        >
          Keep client
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
