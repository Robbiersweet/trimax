"use client";

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
};

export default function UpdateInvoiceStatusButton({
  invoiceId,
  newStatus,
  label,
  businessId,
  invoiceLabel,
}: UpdateInvoiceStatusButtonProps) {
  const router = useRouter();

  async function handleUpdateStatus() {
    const { error } = await supabase
      .from("invoices")
      .update({
        status: newStatus,
      })
      .eq("id", invoiceId);

    if (error) {
      console.error(error);
      alert("Unable to update invoice status.");
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
      },
    });

    router.refresh();
  }

  return <Button onClick={handleUpdateStatus}>{label}</Button>;
}
