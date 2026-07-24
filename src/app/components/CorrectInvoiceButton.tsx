"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { logActivity } from "../lib/activityLog";
import { getNextDocumentDisplayId } from "../lib/documentNumbers";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { supabase } from "../lib/supabase";

type CorrectInvoiceButtonProps = {
  invoiceId: string;
  businessId: string;
  businessSlug: string;
  invoiceLabel: string;
  amountPaid: number;
  createReplacement?: boolean;
};

type InvoiceRecord = {
  id: string;
  business_id: string;
  estimate_id: string | null;
  client_id: string | null;
  created_by_user_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  service_address: string | null;
  reference: string | null;
  invoice_amount: string | number | null;
  issue_date: string | null;
  due_date: string | null;
  tax_mode: string | null;
  tax_label: string | null;
  tax_rate: string | number | null;
  tax_number: string | null;
  split_warning_enabled: boolean | null;
  split_target_amount: string | number | null;
  terms: string | null;
  notes: string | null;
  display_id: string | null;
};

type EstimateRecord = {
  id: string;
  queue_item_id: string | null;
  business_id: string | null;
  client_id: string | null;
  created_by_user_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  reference: string | null;
  estimate_amount: string | number | null;
  tax_mode: string | null;
  tax_label: string | null;
  tax_rate: string | number | null;
  tax_number: string | null;
  split_warning_enabled: boolean | null;
  split_target_amount: string | number | null;
  terms: string | null;
  notes: string | null;
  display_id: string | null;
};

type EstimateLineItem = {
  description: string | null;
  quantity: string | number | null;
  unit_price: string | number | null;
  line_total: string | number | null;
  sort_order: number | null;
};

type InvoiceLineItem = {
  description: string | null;
  quantity: string | number | null;
  unit_price: string | number | null;
  line_total: string | number | null;
  sort_order: number | null;
};

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

export default function CorrectInvoiceButton({
  invoiceId,
  businessId,
  businessSlug,
  invoiceLabel,
  amountPaid,
  createReplacement = true,
}: CorrectInvoiceButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleCorrectInvoice() {
    setMessage("");

    if (amountPaid > 0) {
      setMessage(
        "This invoice has payment activity. Review the payment before using a correction."
      );
      return;
    }

    if (!reason.trim()) {
      setMessage("Add a short correction reason first.");
      return;
    }

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Trimax is being updated. Try again in a few minutes."
      );
      return;
    }

    setIsSaving(true);

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("business_id", businessId)
      .limit(1)
      .maybeSingle();

    if (invoiceError || !invoiceData) {
      console.error(invoiceError);
      setMessage("Unable to load this invoice before correcting it.");
      setIsSaving(false);
      return;
    }

    const invoice = invoiceData as InvoiceRecord;
    let replacementId: string | null = null;
    let replacementDisplayId: string | null = null;
    let replacementEstimateId = invoice.estimate_id;
    let replacementEstimateDisplayId: string | null = null;

    if (createReplacement) {
      if (invoice.estimate_id) {
        const { data: estimateData, error: estimateError } = await supabase
          .from("estimates")
          .select("*")
          .eq("id", invoice.estimate_id)
          .eq("business_id", businessId)
          .limit(1)
          .maybeSingle();

        if (estimateError || !estimateData) {
          console.error(estimateError);
          setMessage("Unable to load the original estimate before correction.");
          setIsSaving(false);
          return;
        }

        const estimate = estimateData as EstimateRecord;

        try {
          replacementEstimateDisplayId = await getNextDocumentDisplayId({
            table: "estimates",
            prefix: "EST",
            businessId,
          });
        } catch (error) {
          console.error(error);
          setMessage("Unable to reserve a replacement estimate number.");
          setIsSaving(false);
          return;
        }

        const estimateCorrectionNote = [
          `Correction of ${estimate.display_id ?? "original estimate"} for ${invoice.display_id ?? invoiceLabel}.`,
          `Reason: ${reason.trim()}`,
          "Review scope and pricing before sending.",
          estimate.notes ?? "",
        ]
          .filter(Boolean)
          .join("\n");

        const { data: replacementEstimate, error: replacementEstimateError } =
          await supabase
            .from("estimates")
            .insert({
              queue_item_id: estimate.queue_item_id,
              business_id: estimate.business_id ?? businessId,
              client_id: estimate.client_id,
              created_by_user_id: estimate.created_by_user_id,
              display_id: replacementEstimateDisplayId,
              customer_name: estimate.customer_name,
              project_title: estimate.project_title,
              project_address: estimate.project_address,
              service_address: estimate.service_address,
              reference: estimate.reference,
              estimate_amount: estimate.estimate_amount,
              tax_mode: estimate.tax_mode,
              tax_label: estimate.tax_label,
              tax_rate: estimate.tax_rate,
              tax_number: estimate.tax_number,
              split_warning_enabled: estimate.split_warning_enabled,
              split_target_amount: estimate.split_target_amount,
              terms: estimate.terms,
              notes: estimateCorrectionNote,
              status: "Draft",
            })
            .select("id, display_id")
            .single();

        if (replacementEstimateError || !replacementEstimate) {
          console.error(replacementEstimateError);
          setMessage("Unable to create the replacement estimate.");
          setIsSaving(false);
          return;
        }

        replacementEstimateId = replacementEstimate.id;
        replacementEstimateDisplayId =
          replacementEstimate.display_id ?? replacementEstimateDisplayId;

        const { data: estimateLineItems } = await supabase
          .from("estimate_line_items")
          .select("description, quantity, unit_price, line_total, sort_order")
          .eq("estimate_id", estimate.id)
          .order("sort_order", { ascending: true });

        const copiedEstimateLineItems = (
          (estimateLineItems ?? []) as EstimateLineItem[]
        ).map((item, index) => ({
          estimate_id: replacementEstimateId,
          business_id: businessId,
          description: item.description ?? "Correction line item",
          quantity: toNumber(item.quantity) || 1,
          unit_price: toNumber(item.unit_price),
          line_total: toNumber(item.line_total),
          sort_order: item.sort_order ?? index,
        }));

        if (copiedEstimateLineItems.length > 0) {
          const { error: estimateLineItemError } = await supabase
            .from("estimate_line_items")
            .insert(copiedEstimateLineItems);

          if (estimateLineItemError) {
            console.error(estimateLineItemError);
            setMessage(
              "The replacement estimate was created, but its line items need review."
            );
          }
        }

        if (estimate.queue_item_id) {
          await supabase
            .from("queue_items")
            .update({
              linked_estimate_id: replacementEstimateId,
            })
            .eq("id", estimate.queue_item_id)
            .eq("business_id", businessId);
        }

        await logActivity({
          businessId,
          action: "estimate.corrected_replacement_created",
          entityType: "estimate",
          entityId: replacementEstimateId,
          entityLabel: replacementEstimateDisplayId,
          details: {
            originalEstimateId: estimate.id,
            originalDisplayId: estimate.display_id,
            originalInvoiceId: invoice.id,
            originalInvoiceDisplayId: invoice.display_id,
            correctionReason: reason.trim(),
          },
        });
      }

      try {
        replacementDisplayId = await getNextDocumentDisplayId({
          table: "invoices",
          prefix: "INV",
          businessId,
        });
      } catch (error) {
        console.error(error);
        setMessage("Unable to reserve a replacement invoice number.");
        setIsSaving(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const correctionNote = [
        `Correction of ${invoice.display_id ?? invoiceLabel}.`,
        `Reason: ${reason.trim()}`,
        "Review scope and pricing before sending.",
        invoice.notes ?? "",
      ]
        .filter(Boolean)
        .join("\n");

      const { data: replacement, error: replacementError } = await supabase
        .from("invoices")
        .insert({
          business_id: invoice.business_id,
          estimate_id: replacementEstimateId,
          client_id: invoice.client_id,
          created_by_user_id: userData.user?.id ?? null,
          display_id: replacementDisplayId,
          customer_name: invoice.customer_name,
          project_title: invoice.project_title,
          service_address: invoice.service_address,
          reference: invoice.reference,
          invoice_amount: invoice.invoice_amount,
          issue_date: null,
          due_date: null,
          tax_mode: invoice.tax_mode,
          tax_label: invoice.tax_label,
          tax_rate: invoice.tax_rate,
          tax_number: invoice.tax_number,
          amount_paid: 0,
          split_warning_enabled: invoice.split_warning_enabled,
          split_target_amount: invoice.split_target_amount,
          terms: invoice.terms,
          notes: correctionNote,
          status: "Draft",
        })
        .select("id, display_id")
        .single();

      if (replacementError || !replacement) {
        console.error(replacementError);
        setMessage("Unable to create the replacement draft.");
        setIsSaving(false);
        return;
      }

      replacementId = replacement.id;
      replacementDisplayId = replacement.display_id ?? replacementDisplayId;

      const { data: lineItems } = await supabase
        .from("invoice_line_items")
        .select("description, quantity, unit_price, line_total, sort_order")
        .eq("invoice_id", invoice.id)
        .order("sort_order", { ascending: true });

      const copiedLineItems = ((lineItems ?? []) as InvoiceLineItem[]).map(
        (item, index) => ({
          invoice_id: replacementId,
          business_id: businessId,
          description: item.description ?? "Correction line item",
          quantity: toNumber(item.quantity) || 1,
          unit_price: toNumber(item.unit_price),
          line_total: toNumber(item.line_total),
          sort_order: item.sort_order ?? index,
        })
      );

      if (copiedLineItems.length > 0) {
        const { error: lineItemError } = await supabase
          .from("invoice_line_items")
          .insert(copiedLineItems);

        if (lineItemError) {
          console.error(lineItemError);
          setMessage(
            "The replacement draft was created, but its line items need review."
          );
        }
      }

      await logActivity({
        businessId,
        action: "invoice.corrected_replacement_created",
        entityType: "invoice",
        entityId: replacementId,
        entityLabel: replacementDisplayId,
        details: {
          originalInvoiceId: invoice.id,
          originalDisplayId: invoice.display_id,
          replacementEstimateId,
          replacementEstimateDisplayId,
          correctionReason: reason.trim(),
        },
      });
    }

    const originalCorrectionNote = [
      invoice.notes ?? "",
      createReplacement && replacementDisplayId
        ? `Correction: superseded by ${replacementDisplayId}. Reason: ${reason.trim()}`
        : `Correction: voided. Reason: ${reason.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { error: statusError } = await supabase
      .from("invoices")
      .update({
        status: createReplacement ? "superseded" : "void",
        notes: originalCorrectionNote,
      })
      .eq("id", invoice.id)
      .eq("business_id", businessId);

    if (statusError) {
      console.error(statusError);
      setMessage("Unable to mark the original invoice as corrected.");
      setIsSaving(false);
      return;
    }

    await logActivity({
      businessId,
      action: createReplacement ? "invoice.superseded" : "invoice.voided",
      entityType: "invoice",
      entityId: invoice.id,
      entityLabel: invoice.display_id ?? invoiceLabel,
      details: {
        replacementInvoiceId: replacementId,
        replacementDisplayId,
        replacementEstimateId,
        replacementEstimateDisplayId,
        correctionReason: reason.trim(),
        previousStatus: "sent",
        newStatus: createReplacement ? "superseded" : "void",
      },
    });

    setIsSaving(false);
    router.push(
      replacementId
        ? `/invoices/${replacementId}?business=${businessSlug}`
        : `/invoices/${invoice.id}?business=${businessSlug}`
    );
    router.refresh();
  }

  if (!isOpen) {
    return (
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Supersede This Invoice
      </Button>
    );
  }

  return (
    <div className="grid max-w-xl gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-amber-200">
          Supersede This Invoice
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-50/85">
          This will preserve the current invoice, mark it as superseded, and
          create a new draft replacement. The customer will not be notified
          until you review and send the replacement.
        </p>
      </div>
      <label className="grid gap-2 text-sm font-semibold text-amber-50">
        Correction reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          className="rounded-xl border border-amber-200/25 bg-black/40 px-3 py-2 text-white outline-none focus:border-amber-200"
          placeholder="Why this sent invoice is being corrected"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCorrectInvoice} disabled={isSaving}>
          {isSaving ? "Creating..." : "Create Draft Replacement"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setIsOpen(false);
            setMessage("");
          }}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
      {message ? (
        <p className="text-sm font-semibold text-amber-100">{message}</p>
      ) : null}
    </div>
  );
}
