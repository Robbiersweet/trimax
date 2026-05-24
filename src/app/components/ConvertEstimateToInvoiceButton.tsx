"use client";

import { useRouter } from "next/navigation";
import Button from "./Button";
import { logActivity } from "../lib/activityLog";
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

type Estimate = {
  id: string;
  business_id: string | null;
  client_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  reference: string | null;
  estimate_amount: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  split_warning_enabled: boolean | null;
  split_target_amount: number | string | null;
  terms: string | null;
  notes: string | null;
};

type EstimateLineItem = {
  id: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

function parseCurrency(value: string | null) {
  return Number(value?.replace(/[^0-9.]/g, "") ?? 0) || 0;
}

function toNumber(value: number | string | null) {
  return Number(value) || 0;
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
    if (!businessId || !customerName || !projectTitle) {
      alert(
        "This estimate needs a customer, project title, and business before it can be converted."
      );

      return;
    }

    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("estimate_id", estimateId)
      .maybeSingle();

    if (existingInvoice?.id) {
      router.push(
        `/invoices/${existingInvoice.id}?business=${businessSlug}`
      );

      return;
    }

    const { data: estimateData, error: estimateError } =
      await supabase
        .from("estimates")
        .select("*")
        .eq("id", estimateId)
        .single();

    if (estimateError || !estimateData) {
      console.error(estimateError);

      alert("Unable to load estimate before conversion.");

      return;
    }

    const estimate = estimateData as Estimate;

    const { data: estimateLineItemData } =
      await supabase
        .from("estimate_line_items")
        .select("*")
        .eq("estimate_id", estimateId)
        .order("sort_order", {
          ascending: true,
        });

    const estimateLineItems =
      (estimateLineItemData ?? []) as EstimateLineItem[];

    const subtotal = estimateLineItems.reduce(
      (total, item) =>
        total + toNumber(item.line_total),
      0
    );

    const fallbackSubtotal =
      subtotal > 0
        ? subtotal
        : parseCurrency(
            estimate.estimate_amount ?? invoiceAmount
          );

    const taxRate = toNumber(estimate.tax_rate);
    const taxAmount =
      fallbackSubtotal * (taxRate / 100);
    const invoiceTotal =
      fallbackSubtotal + taxAmount;

    if (invoiceTotal <= 0) {
      alert(
        "This estimate needs at least one priced line item before it can be converted."
      );

      return;
    }

    const { count } = await supabase
      .from("invoices")
      .select("*", {
        count: "exact",
        head: true,
      });

    const nextInvoiceNumber = (count ?? 0) + 1;
    const displayId = `INV-${String(
      nextInvoiceNumber
    ).padStart(4, "0")}`;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        business_id:
          estimate.business_id ?? businessId,
        estimate_id: estimateId,
        client_id: estimate.client_id ?? clientId,
        created_by_user_id: user?.id ?? null,
        display_id: displayId,
        customer_name:
          estimate.customer_name ?? customerName,
        project_title:
          estimate.project_title ?? projectTitle,
        service_address:
          estimate.service_address ??
          estimate.project_address ??
          "",
        reference: estimate.reference ?? "",
        invoice_amount:
          formatCurrency(invoiceTotal),
        tax_label: estimate.tax_label ?? "Tax",
        tax_rate: taxRate,
        amount_paid: 0,
        split_warning_enabled:
          Boolean(estimate.split_warning_enabled),
        split_target_amount:
          estimate.split_target_amount ?? null,
        terms:
          estimate.terms ??
          "Payment due upon invoice. Thank you for your business.",
        notes: estimate.notes ?? notes,
        status: "Draft",
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);

      alert("Unable to convert estimate to invoice.");

      return;
    }

    const invoiceLineItems =
      estimateLineItems.length > 0
        ? estimateLineItems.map((item, index) => ({
            invoice_id: data.id,
            business_id:
              estimate.business_id ?? businessId,
            description:
              item.description ||
              estimate.project_title ||
              "Line item",
            quantity: toNumber(item.quantity) || 1,
            unit_price: toNumber(item.unit_price),
            line_total: toNumber(item.line_total),
            sort_order:
              item.sort_order ?? index,
          }))
        : [
            {
              invoice_id: data.id,
              business_id:
                estimate.business_id ?? businessId,
              description:
                estimate.project_title ??
                projectTitle,
              quantity: 1,
              unit_price: fallbackSubtotal,
              line_total: fallbackSubtotal,
              sort_order: 0,
            },
          ];

    const { error: lineItemError } = await supabase
      .from("invoice_line_items")
      .insert(invoiceLineItems);

    if (lineItemError) {
      console.error(lineItemError);

      alert(
        "Invoice was created, but its line items could not be saved."
      );

      router.push(
        `/invoices/${data.id}?business=${businessSlug}`
      );

      return;
    }

    await logActivity({
      businessId: estimate.business_id ?? businessId,
      action: "estimate.converted_to_invoice",
      entityType: "estimate",
      entityId: estimateId,
      entityLabel: estimate.project_title ?? projectTitle,
      details: {
        invoiceId: data.id,
        invoiceDisplayId: displayId,
        amount: formatCurrency(invoiceTotal),
      },
    });

    router.push(
      `/invoices/${data.id}?business=${businessSlug}`
    );
  }

  return (
    <Button onClick={handleConvert}>
      Convert to Invoice
    </Button>
  );
}
