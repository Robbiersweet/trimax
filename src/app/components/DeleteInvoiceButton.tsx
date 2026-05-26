"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type DeleteInvoiceButtonProps = {
  invoiceId: string;
  returnHref: string;
};

export default function DeleteInvoiceButton({
  invoiceId,
  returnHref,
}: DeleteInvoiceButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleDelete() {
    setErrorMessage("");

    const confirmed = window.confirm(
      "Are you sure you want to delete this invoice?"
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId);

    if (error) {
      console.error(error);
      setErrorMessage(
        "Unable to delete this invoice. Refresh the page, then try again."
      );
      setIsDeleting(false);
      return;
    }

    router.push(returnHref);
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <Button
        onClick={handleDelete}
        variant="secondary"
        disabled={isDeleting}
      >
        {isDeleting ? "Deleting..." : "Delete Invoice"}
      </Button>

      {errorMessage ? (
        <p className="text-sm font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
