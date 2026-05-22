"use client";

import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type DeleteInvoiceButtonProps = {
  invoiceId: string;
};

export default function DeleteInvoiceButton({
  invoiceId,
}: DeleteInvoiceButtonProps) {
  const router = useRouter();

  async function handleDelete() {
    const confirmed = window.confirm(
      "Are you sure you want to delete this invoice?"
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId);

    if (error) {
      console.error(error);
      alert("Unable to delete invoice.");
      return;
    }

    router.push("/invoices");
    router.refresh();
  }

  return (
    <Button onClick={handleDelete} variant="secondary">
      Delete Invoice
    </Button>
  );
}