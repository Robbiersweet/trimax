"use client";

import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type UpdateInvoiceStatusButtonProps = {
  invoiceId: string;
  newStatus: string;
  label: string;
};

export default function UpdateInvoiceStatusButton({
  invoiceId,
  newStatus,
  label,
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

    router.refresh();
  }

  return <Button onClick={handleUpdateStatus}>{label}</Button>;
}