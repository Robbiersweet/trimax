"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { getNextDocumentDisplayId } from "../lib/documentNumbers";
import { logActivity } from "../lib/activityLog";
import { createSplitInvoices } from "../lib/splitInvoices";
import { supabase } from "../lib/supabase";
import { getSmartInvoiceDates } from "../utils/invoiceDates";
import { getEffectiveTaxRate } from "../utils/tax";
import { maybeCanonicalApartmentUnitLabel } from "../utils/unitLabels";

type ConvertEstimateToInvoiceButtonProps = {
  estimateId: string;
  businessId: string;
  businessSlug: string;
  clientId: string | null;
  customerName: string;
  projectTitle: string;
  invoiceAmount: string;
  notes: string;
  splitTargetAmount?: number;
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
  tax_mode: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  tax_number: string | null;
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
  splitTargetAmount = 0,
}: ConvertEstimateToInvoiceButtonProps) {
  const router = useRouter();
  const [isConverting, setIsConverting] = useState(false);
  const [message, setMessage] = useState<{
    type: "error" | "notice";
    text: string;
  } | null>(null);

  async function handleConvert() {
    setMessage(null);

    if (!businessId || !customerName || !projectTitle) {
      setMessage({
        type: "error",
        text: "This estimate needs a customer, project title, and workspace before it can be converted.",
      });

      return;
    }

    setIsConverting(true);

    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("estimate_id", estimateId)
      .maybeSingle();

    if (existingInvoice?.id) {
      setMessage({
        type: "notice",
        text: "This estimate already has an invoice. Opening it now.",
      });

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

      setMessage({
        type: "error",
        text: "Unable to load this estimate before conversion. Refresh the page, then try again.",
      });
      setIsConverting(false);

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

    const taxRate = getEffectiveTaxRate({
      taxMode: estimate.tax_mode,
      taxRate: estimate.tax_rate,
    });
    const taxAmount =
      fallbackSubtotal * (taxRate / 100);
    const invoiceTotal =
      fallbackSubtotal + taxAmount;
    const smartInvoiceDates = getSmartInvoiceDates({
      customerName: estimate.customer_name ?? customerName,
      projectTitle: estimate.project_title ?? projectTitle,
      serviceAddress:
        estimate.service_address ?? estimate.project_address ?? "",
      reference: maybeCanonicalApartmentUnitLabel(estimate.reference),
      notes: estimate.notes ?? notes,
      terms:
        estimate.terms ??
        "Payment due upon invoice. Thank you for your business.",
      lineItems: estimateLineItems.map((item) => ({
        description: item.description ?? "",
      })),
    });

    if (invoiceTotal <= 0) {
      setMessage({
        type: "error",
        text: "This estimate needs at least one priced line item before it can be converted.",
      });
      setIsConverting(false);

      return;
    }

    const targetBusinessId =
      estimate.business_id ?? businessId;
    let displayId = "";

    try {
      displayId = await getNextDocumentDisplayId({
        table: "invoices",
        prefix: "INV",
        businessId: targetBusinessId,
      });
    } catch (error) {
      console.error(error);

      setMessage({
        type: "error",
        text: "Unable to reserve the next invoice number. Refresh the page, then try again.",
      });
      setIsConverting(false);

      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        business_id: targetBusinessId,
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
        reference: maybeCanonicalApartmentUnitLabel(estimate.reference),
        invoice_amount:
          formatCurrency(invoiceTotal),
        issue_date: smartInvoiceDates.issueDate,
        due_date: smartInvoiceDates.dueDate,
        tax_mode: estimate.tax_mode || "taxable",
        tax_label: estimate.tax_label ?? "Tax",
        tax_rate: taxRate,
        tax_number:
          estimate.tax_mode === "taxable"
            ? estimate.tax_number ?? null
            : null,
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

      setMessage({
        type: "error",
        text: "Unable to convert this estimate to an invoice. Refresh the page, then try again.",
      });
      setIsConverting(false);

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

      setMessage({
        type: "notice",
        text: "The invoice was created, but its line items need attention. Opening the invoice now.",
      });

      window.setTimeout(() => {
        router.push(
          `/invoices/${data.id}?business=${businessSlug}`
        );
      }, 900);

      return;
    }

    const effectiveSplitTargetAmount =
      toNumber(estimate.split_target_amount) || splitTargetAmount;

    if (
      estimate.split_warning_enabled &&
      effectiveSplitTargetAmount > 0
    ) {
      try {
        await createSplitInvoices({
          sourceInvoice: {
            id: data.id,
            displayId,
            businessId: targetBusinessId,
            businessSlug,
            clientId: estimate.client_id ?? clientId,
            customerName:
              estimate.customer_name ?? customerName,
            projectTitle:
              estimate.project_title ?? projectTitle,
            issueDate: smartInvoiceDates.issueDate,
            dueDate: smartInvoiceDates.dueDate,
            reference: maybeCanonicalApartmentUnitLabel(estimate.reference),
            serviceAddress:
              estimate.service_address ??
              estimate.project_address ??
              "",
            terms:
              estimate.terms ??
              "Payment due upon invoice. Thank you for your business.",
            notes: estimate.notes ?? notes,
          },
          subtotalAmount: fallbackSubtotal,
          targetAmount: effectiveSplitTargetAmount,
          taxLabel: estimate.tax_label ?? "Tax",
          taxRate,
          taxMode: estimate.tax_mode,
          taxNumber: estimate.tax_number,
          createdByUserId: user?.id ?? null,
        });
      } catch (splitError) {
        console.error(splitError);

        setMessage({
          type: "error",
          text: "The invoice was created, but the split drafts failed. Open the invoice and use the split workflow.",
        });

        setIsConverting(false);
        return;
      }
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
    <div className="grid gap-2">
      <Button
        onClick={handleConvert}
        disabled={isConverting}
      >
        {isConverting ? "Converting..." : "Convert to Invoice"}
      </Button>

      {message ? (
        <p
          className={`app-feedback-message ${
            message.type === "error"
              ? "app-feedback-message-error"
              : "app-feedback-message-notice"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
