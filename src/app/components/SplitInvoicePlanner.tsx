"use client";

import { useMemo, useState } from "react";
import Button from "./Button";
import Card from "./Card";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";

type SplitInvoicePlannerProps = {
  subtotalAmount: number;
  targetAmount: number;
  taxLabel?: string;
  taxRate?: number;
  taxNumber?: string | null;
  sourceInvoice?: {
    id: string;
    displayId: string | null;
    businessId: string;
    businessSlug: string;
    clientId: string | null;
    customerName: string;
    projectTitle: string;
    issueDate: string | null;
    dueDate: string | null;
    reference: string | null;
    serviceAddress: string | null;
    terms: string | null;
    notes: string | null;
  };
};

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function splitIntoEvenAmounts(totalAmount: number, targetAmount: number) {
  if (totalAmount <= targetAmount || targetAmount <= 0) {
    return [];
  }

  const invoiceCount = Math.ceil(totalAmount / targetAmount);
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / invoiceCount);
  const extraCents = totalCents % invoiceCount;

  return Array.from({ length: invoiceCount }, (_item, index) => {
    const cents = baseCents + (index < extraCents ? 1 : 0);

    return cents / 100;
  });
}

export default function SplitInvoicePlanner({
  subtotalAmount,
  targetAmount,
  taxLabel = "Tax",
  taxRate = 0,
  taxNumber = null,
  sourceInvoice,
}: SplitInvoicePlannerProps) {
  const [showPlan, setShowPlan] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdInvoices, setCreatedInvoices] = useState<
    { id: string; displayId: string }[]
  >([]);
  const [isConfirmingCreate, setIsConfirmingCreate] = useState(false);
  const [message, setMessage] = useState<{
    type: "error" | "notice";
    text: string;
  } | null>(null);

  const splitAmounts = useMemo(
    () => splitIntoEvenAmounts(subtotalAmount, targetAmount),
    [targetAmount, subtotalAmount]
  );
  const plannedTotal = splitAmounts.reduce(
    (total, amount) => total + amount,
    0
  );
  const plannedTaxTotal =
    plannedTotal * ((Number(taxRate) || 0) / 100);
  const plannedGrandTotal = plannedTotal + plannedTaxTotal;

  if (splitAmounts.length === 0) {
    return null;
  }

  async function handleCreateSplitInvoices() {
    setMessage(null);

    if (!sourceInvoice || createdInvoices.length > 0) {
      return;
    }

    if (!isConfirmingCreate) {
      setIsConfirmingCreate(true);
      setMessage({
        type: "notice",
        text: `Review the split plan, then click create again to make ${splitAmounts.length} draft split invoices.`,
      });
      return;
    }

    setCreating(true);

    const { count, error: countError } = await supabase
      .from("invoices")
      .select("*", {
        count: "exact",
        head: true,
      });

    if (countError) {
      console.error(countError);
      setMessage({
        type: "error",
        text: "Unable to prepare invoice numbers. Refresh the page, then try again.",
      });
      setCreating(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const invoiceRows = splitAmounts.map((amount, index) => {
      const displayId = `INV-${String(
        (count ?? 0) + index + 1
      ).padStart(4, "0")}`;
      const taxAmount = amount * ((Number(taxRate) || 0) / 100);
      const invoiceTotal = amount + taxAmount;
      const splitLabel = `Split ${index + 1} of ${splitAmounts.length}`;

      return {
        business_id: sourceInvoice.businessId,
        estimate_id: null,
        client_id: sourceInvoice.clientId,
        created_by_user_id: user?.id ?? null,
        display_id: displayId,
        customer_name: sourceInvoice.customerName,
        project_title: `${sourceInvoice.projectTitle} - ${splitLabel}`,
        service_address: sourceInvoice.serviceAddress ?? "",
        reference: sourceInvoice.reference ?? "",
        invoice_amount: formatCurrency(invoiceTotal),
        issue_date: sourceInvoice.issueDate,
        due_date: sourceInvoice.dueDate,
        tax_label: taxLabel || "Tax",
        tax_rate: Number(taxRate) || 0,
        tax_number: taxNumber?.trim() || null,
        amount_paid: 0,
        split_warning_enabled: false,
        split_target_amount: null,
        split_parent_invoice_id: sourceInvoice.id,
        split_sequence: index + 1,
        split_count: splitAmounts.length,
        terms: sourceInvoice.terms,
        notes: [
          sourceInvoice.notes,
          `Created from ${
            sourceInvoice.displayId || sourceInvoice.projectTitle
          } as ${splitLabel}.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        status: "Draft",
      };
    });

    const { data: insertedInvoices, error: invoiceError } =
      await supabase
        .from("invoices")
        .insert(invoiceRows)
        .select("id, display_id");

    if (invoiceError || !insertedInvoices) {
      console.error(invoiceError);
      setMessage({
        type: "error",
        text: "Unable to create split invoices. Refresh the page, then try again.",
      });
      setCreating(false);
      return;
    }

    const lineRows = insertedInvoices.flatMap((invoice, index) => {
      const amount = splitAmounts[index] ?? 0;

      return [
        {
          invoice_id: invoice.id,
          business_id: sourceInvoice.businessId,
          description: `${sourceInvoice.projectTitle} - Split ${index + 1} of ${
            splitAmounts.length
          }`,
          quantity: 1,
          unit_price: amount,
          line_total: amount,
          sort_order: 0,
        },
      ];
    });

    const { error: lineItemError } = await supabase
      .from("invoice_line_items")
      .insert(lineRows);

    if (lineItemError) {
      console.error(lineItemError);
      setMessage({
        type: "notice",
        text: "Split invoices were created, but their line items need attention. Open the new invoices and review them before sending.",
      });
      setCreating(false);
      return;
    }

    setCreatedInvoices(
      insertedInvoices.map((invoice) => ({
        id: invoice.id,
        displayId: invoice.display_id || "Invoice",
      }))
    );
    setIsConfirmingCreate(false);

    await logActivity({
      businessId: sourceInvoice.businessId,
      action: "invoice.split_created",
      entityType: "invoice",
      entityId: sourceInvoice.id,
      entityLabel:
        sourceInvoice.displayId || sourceInvoice.projectTitle || "Invoice",
      details: {
        splitCount: insertedInvoices.length,
        targetAmount: formatCurrency(targetAmount),
        subtotalAmount: formatCurrency(subtotalAmount),
        createdInvoiceIds: insertedInvoices.map((invoice) => invoice.id),
        createdInvoiceDisplayIds: insertedInvoices.map(
          (invoice) => invoice.display_id
        ),
      },
    });

    setCreating(false);
  }

  return (
    <Card className="border-orange-500/50 bg-orange-500/10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-300">
            Split Invoice Workflow
          </p>

          <p className="mt-3 text-lg font-bold text-orange-100">
            Trimax can split this into {splitAmounts.length} invoices.
          </p>

          <p className="mt-3 text-sm leading-6 text-orange-100/80">
            This step only previews the plan. No invoices are created yet.
          </p>

          <div className="mt-4 grid gap-3 text-sm text-orange-100/80 sm:grid-cols-2">
            <div>
              <p className="text-orange-200/70">Total to split</p>
              <p className="mt-1 text-lg font-bold text-orange-50">
                {formatCurrency(subtotalAmount)}
              </p>
            </div>

            <div>
              <p className="text-orange-200/70">Target per invoice</p>
              <p className="mt-1 text-lg font-bold text-orange-50">
                {formatCurrency(targetAmount)}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-6 text-orange-100/80">
            Split invoices use pre-tax subtotals. {taxLabel || "Tax"} is applied
            to each split invoice after the subtotal is divided.
          </p>
        </div>

        <Button onClick={() => setShowPlan((current) => !current)}>
          {showPlan ? "Hide Split Plan" : "Preview Split Plan"}
        </Button>
      </div>

      {showPlan ? (
        <div className="mt-6 space-y-5">
          <div className="overflow-hidden rounded-2xl border border-orange-400/30">
            <div className="grid grid-cols-[1fr_150px] gap-4 bg-black/30 px-5 py-3 text-sm font-bold text-orange-100/80">
              <span>Planned Invoice</span>
              <span className="text-right">Subtotal</span>
            </div>

            {splitAmounts.map((amount, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_150px] gap-4 border-t border-orange-400/20 px-5 py-4 text-orange-50"
              >
                <span>Split Invoice {index + 1}</span>
                <span className="text-right font-bold">
                  {formatCurrency(amount)}
                </span>
              </div>
            ))}

            <div className="grid grid-cols-[1fr_150px] gap-4 border-t border-orange-400/40 bg-black/20 px-5 py-4 text-orange-50">
              <span className="font-bold">Planned Subtotal</span>
              <span className="text-right font-bold">
                {formatCurrency(plannedTotal)}
              </span>
            </div>

            <div className="grid grid-cols-[1fr_150px] gap-4 border-t border-orange-400/20 bg-black/20 px-5 py-4 text-orange-50">
              <span>
                Planned {taxLabel || "Tax"} ({Number(taxRate) || 0}%)
              </span>
              <span className="text-right font-bold">
                {formatCurrency(plannedTaxTotal)}
              </span>
            </div>

            <div className="grid grid-cols-[1fr_150px] gap-4 border-t border-orange-400/40 bg-black/30 px-5 py-4 text-orange-50">
              <span className="font-bold">Planned Total With Tax</span>
              <span className="text-right font-bold">
                {formatCurrency(plannedGrandTotal)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-orange-100/80">
              Review this breakdown first. Confirming will create draft split
              invoices and leave this original invoice intact.
            </p>

            {sourceInvoice ? (
              <Button
                onClick={handleCreateSplitInvoices}
                disabled={creating || createdInvoices.length > 0}
                className={
                  createdInvoices.length > 0
                    ? "pointer-events-none bg-zinc-700 text-zinc-400"
                    : ""
                }
              >
                {createdInvoices.length > 0
                  ? "Split Invoices Created"
                  : creating
                    ? "Creating..."
                    : isConfirmingCreate
                      ? "Yes, Create Split Invoices"
                      : "Review and Create"}
              </Button>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-2xl bg-zinc-700 px-5 py-3 font-semibold text-zinc-400"
              >
                Create From Invoice Detail
              </button>
            )}
          </div>

          {message ? (
            <div
              className={`app-feedback-message ${
                message.type === "error"
                  ? "app-feedback-message-error"
                  : "app-feedback-message-notice"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {createdInvoices.length > 0 ? (
            <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4">
              <p className="font-semibold text-green-100">
                Created {createdInvoices.length} split invoices.
              </p>

              <div className="mt-3 flex flex-wrap gap-3">
                {createdInvoices.map((invoice) => (
                  <a
                    key={invoice.id}
                    href={`/invoices/${invoice.id}?business=${sourceInvoice?.businessSlug}`}
                    className="rounded-2xl bg-green-500 px-4 py-2 font-semibold text-black"
                  >
                    Open {invoice.displayId}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
