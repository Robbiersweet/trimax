"use client";

import { useMemo, useState } from "react";
import Button from "./Button";
import Card from "./Card";

type SplitInvoicePlannerProps = {
  totalAmount: number;
  targetAmount: number;
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
  totalAmount,
  targetAmount,
}: SplitInvoicePlannerProps) {
  const [showPlan, setShowPlan] = useState(false);

  const splitAmounts = useMemo(
    () => splitIntoEvenAmounts(totalAmount, targetAmount),
    [targetAmount, totalAmount]
  );
  const plannedTotal = splitAmounts.reduce(
    (total, amount) => total + amount,
    0
  );

  if (splitAmounts.length === 0) {
    return null;
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
                {formatCurrency(totalAmount)}
              </p>
            </div>

            <div>
              <p className="text-orange-200/70">Target per invoice</p>
              <p className="mt-1 text-lg font-bold text-orange-50">
                {formatCurrency(targetAmount)}
              </p>
            </div>
          </div>
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
              <span className="text-right">Amount</span>
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
              <span className="font-bold">Planned Total</span>
              <span className="text-right font-bold">
                {formatCurrency(plannedTotal)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-orange-100/80">
              Review this breakdown first. The next milestone will create these
              invoices after confirmation.
            </p>

            <button
              type="button"
              disabled
              className="rounded-2xl bg-zinc-700 px-5 py-3 font-semibold text-zinc-400"
            >
              Confirm and Create Coming Next
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
