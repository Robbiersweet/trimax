"use client";

import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type ConvertEstimateToInvoiceButtonProps = {
  estimateId: string;
  businessId: string;
  businessSlug: string;
  clientId: string | null;
  customerName: string;
  projectTitle: string;
  invoiceAmount: string;
  notes: string;
};

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export default function ConvertEstimateToInvoiceButton({
  estimateId,
  businessId,
  businessSlug,
  clientId,
  customerName,
  projectTitle,
  invoiceAmount,
  notes,
}: ConvertEstimateToInvoiceButtonProps) {
  const router = useRouter();

  async function handleConvert() {
    const numericAmount = parseCurrency(invoiceAmount);

    if (!businessId || !customerName || !projectTitle || numericAmount <= 0) {
      alert(
        "This estimate needs a customer, project title, business, and amount before it can be converted."
      );

      return;
    }

    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });

    const nextInvoiceNumber = (count ?? 0) + 1;
    const displayId = `INV-${String(nextInvoiceNumber).padStart(4, "0")}`;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        business_id: businessId,
        estimate_id: estimateId,
        client_id: clientId,
        created_by_user_id: user?.id ?? null,
        display_id: displayId,
        customer_name: customerName,
        project_title: projectTitle,
        invoice_amount: formatCurrency(numericAmount),
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

    const { error: lineItemError } = await supabase
      .from("invoice_line_items")
      .insert({
        invoice_id: data.id,
        business_id: businessId,
        description: projectTitle,
        quantity: 1,
        unit_price: numericAmount,
        line_total: numericAmount,
        sort_order: 0,
      });

    if (lineItemError) {
      console.error(lineItemError);

      alert(
        "Invoice was created, but its starter line item could not be saved."
      );

      router.push(`/invoices/${data.id}?business=${businessSlug}`);

      return;
    }

    router.push(`/invoices/${data.id}?business=${businessSlug}`);
  }

  return (
    <Button onClick={handleConvert}>
      Convert to Invoice
    </Button>
  );
}