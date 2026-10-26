"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";

type UpdateInvoiceStatusButtonProps = {
  invoiceId: string;
  newStatus: string;
  label: string;
  businessId?: string | null;
  invoiceLabel?: string | null;
  disabledReason?: string | null;
};

export default function UpdateInvoiceStatusButton({
  invoiceId,
  newStatus,
  label,
  businessId,
  invoiceLabel,
  disabledReason,
}: UpdateInvoiceStatusButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleUpdateStatus() {
    setErrorMessage("");

    if (disabledReason) {
      setErrorMessage(disabledReason);
      return;
    }

    if (newStatus.toLowerCase() === "sent" && !window.confirm(
      "Confirm that the FINAL invoice has actually been issued outside Trimax, with the saved issue date and agreed due date. This makes its remaining balance collectible. A deposit request alone does not qualify."
    )) return;

    setIsSaving(true);

    const { error } = await supabase
      .from("invoices")
      .update({
        status: newStatus,
      })
      .eq("id", invoiceId);

    if (error) {
      console.error(error);
      setErrorMessage(
        "Unable to update this invoice status. Refresh the page, then try again."
      );
      setIsSaving(false);
      return;
    }

    await logActivity({
      businessId,
      action: "invoice.status_updated",
      entityType: "invoice",
      entityId: invoiceId,
      entityLabel: invoiceLabel,
      details: {
        status: newStatus,
        ...(newStatus.toLowerCase() === "sent" ? { billingPurpose: "final", issuedVia: "manual-confirmation" } : {}),
      },
    });

    setIsSaving(false);
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <Button
        onClick={handleUpdateStatus}
        disabled={isSaving || Boolean(disabledReason)}
      >
        {isSaving ? "Saving..." : label}
      </Button>

      {disabledReason ? (
        <p className="text-sm font-semibold text-amber-200">
          {disabledReason}
        </p>
      ) : errorMessage ? (
        <p className="text-sm font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
