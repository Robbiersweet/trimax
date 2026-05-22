"use client";

import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type ConvertEstimateToInvoiceButtonProps = {
  estimateId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: string;
  notes: string;
};

export default function ConvertEstimateToInvoiceButton({
  estimateId,
  customerName,
  projectTitle,
  invoiceAmount,
  notes,
}: ConvertEstimateToInvoiceButtonProps) {
  const router = useRouter();

  async function handleConvert() {
    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });

    const nextInvoiceNumber = (count ?? 0) + 1;
    const displayId = `INV-${String(nextInvoiceNumber).padStart(4, "0")}`;

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        estimate_id: estimateId,
        display_id: displayId,
        customer_name: customerName,
        project_title: projectTitle,
        invoice_amount: invoiceAmount,
        notes,
        status: "Draft",
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);
      alert("Unable to convert estimate to invoice.");
      return;
    }

    router.push(`/invoices/${data.id}`);
  }

  return <Button onClick={handleConvert}>Convert to Invoice</Button>;
}