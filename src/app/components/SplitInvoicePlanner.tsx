"use client";

import { useMemo, useState } from "react";
import Button from "./Button";
import Card from "./Card";
import {
  buildSplitInvoicePlan,
  createSplitInvoices,
  type SplitInvoiceSource,
} from "../lib/splitInvoices";
import { supabase } from "../lib/supabase";
import { getEffectiveTaxRate } from "../utils/tax";

type SplitInvoicePlannerProps = {
  subtotalAmount: number;
  targetAmount: number;
  taxLabel?: string;
  taxRate?: number;
  taxMode?: string | null;
  taxNumber?: string | null;
  sourceInvoice?: SplitInvoiceSource;
};

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export default function SplitInvoicePlanner({
  subtotalAmount,
  targetAmount,
  taxLabel = "Tax",
  taxRate = 0,
  taxMode = "taxable",
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

  const effectiveTaxRate = getEffectiveTaxRate({
    taxMode,
    taxRate,
  });
  const splitPlan = useMemo(
    () =>
      buildSplitInvoicePlan({
        subtotalAmount,
        targetAmount,
        taxRate: effectiveTaxRate,
      }),
    [effectiveTaxRate, subtotalAmount, targetAmount]
  );
  const plannedTotal = splitPlan.reduce(
    (total, item) => total + item.subtotalAmount,
    0
  );
  const plannedTaxTotal = splitPlan.reduce(
    (total, item) => total + item.taxAmount,
    0
  );
  const plannedGrandTotal = splitPlan.reduce(
    (total, item) => total + item.totalAmount,
    0
  );

  if (splitPlan.length === 0) {
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
        text: `Review the split plan, then click create again to make ${splitPlan.length} draft split invoices.`,
      });
      return;
    }

    setCreating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      const insertedInvoices = await createSplitInvoices({
        sourceInvoice,
        subtotalAmount,
        targetAmount,
        taxLabel,
        taxRate: effectiveTaxRate,
        taxMode,
        taxNumber,
        createdByUserId: user?.id ?? null,
      });

      setCreatedInvoices(insertedInvoices);
      setIsConfirmingCreate(false);
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "Unable to create split invoices. Refresh the page, then try again.",
      });
      setCreating(false);
      return;
    }

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
            Trimax can split this into {splitPlan.length} invoices.
          </p>

          <p className="mt-3 text-sm leading-6 text-orange-100/80">
            The first split is filled to the threshold when possible. No split
            invoice will exceed the target after tax.
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
            <div className="grid grid-cols-[1fr_120px_120px_130px] gap-4 bg-black/30 px-5 py-3 text-sm font-bold text-orange-100/80">
              <span>Planned Invoice</span>
              <span className="text-right">Subtotal</span>
              <span className="text-right">Tax</span>
              <span className="text-right">Total</span>
            </div>

            {splitPlan.map((item) => (
              <div
                key={item.sequence}
                className="grid grid-cols-[1fr_120px_120px_130px] gap-4 border-t border-orange-400/20 px-5 py-4 text-orange-50"
              >
                <span>Split Invoice {item.sequence}</span>
                <span className="text-right font-bold">
                  {formatCurrency(item.subtotalAmount)}
                </span>
                <span className="text-right font-bold">
                  {formatCurrency(item.taxAmount)}
                </span>
                <span className="text-right font-bold">
                  {formatCurrency(item.totalAmount)}
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
                Planned {taxMode === "tax_exempt"
                  ? "Tax exempt"
                  : taxMode === "no_tax"
                    ? "No tax"
                    : `${taxLabel || "Tax"} (${effectiveTaxRate}%)`}
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
