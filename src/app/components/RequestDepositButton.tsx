"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";

type RequestDepositButtonProps = {
  invoiceId: string;
  businessId: string;
  invoiceLabel: string;
  invoiceTotal: number;
  currentDepositAmount?: number;
  currentDepositStatus?: string | null;
  currentDepositNote?: string | null;
};

function money(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeValue);
}

function toAmount(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function RequestDepositButton({
  invoiceId,
  businessId,
  invoiceLabel,
  invoiceTotal,
  currentDepositAmount = 0,
  currentDepositStatus,
  currentDepositNote,
}: RequestDepositButtonProps) {
  const router = useRouter();
  const hasActiveDeposit =
    String(currentDepositStatus ?? "none").toLowerCase() === "requested" &&
    currentDepositAmount > 0;
  const [isOpen, setIsOpen] = useState(false);
  const [depositMode, setDepositMode] = useState<"percent" | "fixed">(
    hasActiveDeposit ? "fixed" : "percent"
  );
  const [percent, setPercent] = useState("50");
  const [fixedAmount, setFixedAmount] = useState(
    currentDepositAmount > 0 ? String(currentDepositAmount) : ""
  );
  const [note, setNote] = useState(currentDepositNote ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const depositAmount = useMemo(() => {
    if (depositMode === "fixed") {
      return Math.min(toAmount(fixedAmount), invoiceTotal);
    }

    const parsedPercent = Number(percent);
    const safePercent = Number.isFinite(parsedPercent)
      ? Math.min(Math.max(parsedPercent, 0), 100)
      : 0;

    return Math.round(invoiceTotal * safePercent) / 100;
  }, [depositMode, fixedAmount, invoiceTotal, percent]);

  async function saveDepositRequest() {
    setMessage("");

    if (depositAmount <= 0) {
      setMessage("Choose a deposit amount greater than zero.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("invoices")
      .update({
        deposit_requested_amount: depositAmount,
        deposit_requested_at: new Date().toISOString(),
        deposit_status: "requested",
        deposit_note: note.trim() || null,
      })
      .eq("id", invoiceId)
      .eq("business_id", businessId);

    if (error) {
      console.error(error);
      setMessage(
        "Unable to save the deposit request. Run the deposit SQL in Supabase, then try again."
      );
      setIsSaving(false);
      return;
    }

    await logActivity({
      businessId,
      action: "invoice.deposit_requested",
      entityType: "invoice",
      entityId: invoiceId,
      entityLabel: invoiceLabel,
      details: {
        depositAmount,
        note: note.trim() || null,
      },
    });

    setIsSaving(false);
    setIsOpen(false);
    router.refresh();
  }

  async function clearDepositRequest() {
    setMessage("");
    setIsSaving(true);

    const { error } = await supabase
      .from("invoices")
      .update({
        deposit_requested_amount: 0,
        deposit_requested_at: null,
        deposit_status: "none",
        deposit_note: null,
      })
      .eq("id", invoiceId)
      .eq("business_id", businessId);

    if (error) {
      console.error(error);
      setMessage(
        "Unable to clear the deposit request. Refresh the page, then try again."
      );
      setIsSaving(false);
      return;
    }

    await logActivity({
      businessId,
      action: "invoice.deposit_cleared",
      entityType: "invoice",
      entityId: invoiceId,
      entityLabel: invoiceLabel,
    });

    setIsSaving(false);
    setIsOpen(false);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <Button
        variant={hasActiveDeposit ? "secondary" : "primary"}
        onClick={() => setIsOpen((value) => !value)}
      >
        {hasActiveDeposit ? "Edit Deposit Request" : "Request Deposit"}
      </Button>

      {isOpen ? (
        <div className="rounded-3xl border border-sky-200 bg-white p-5 text-slate-950 shadow-xl shadow-slate-200/70">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-700">
                Deposit Request
              </p>
              <h3 className="mt-2 text-xl font-black">
                Ask for part of this invoice now
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This does not mark money as paid. It only changes the invoice
                email and print view to show the deposit due.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Invoice Total
              </p>
              <p className="mt-1 text-lg font-black">{money(invoiceTotal)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-sm font-semibold text-slate-700">
                Deposit Type
              </span>
              <select
                value={depositMode}
                onChange={(event) =>
                  setDepositMode(event.target.value as "percent" | "fixed")
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-semibold outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              >
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>

            {depositMode === "percent" ? (
              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-sm font-semibold text-slate-700">
                  Percentage
                </span>
                <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-100">
                  <input
                    value={percent}
                    onChange={(event) => setPercent(event.target.value)}
                    inputMode="decimal"
                    className="w-full bg-transparent py-3 font-semibold outline-none"
                  />
                  <span className="font-black text-slate-500">%</span>
                </div>
              </label>
            ) : (
              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-sm font-semibold text-slate-700">
                  Fixed Amount
                </span>
                <input
                  value={fixedAmount}
                  onChange={(event) => setFixedAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="$0.00"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-semibold outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                />
              </label>
            )}
          </div>

          <label className="mt-4 block rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-sm font-semibold text-slate-700">
              Deposit Note
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Example: Deposit requested before materials are ordered."
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
          </label>

          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Customer will see deposit due
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-800">
              {money(depositAmount)}
            </p>
          </div>

          {message ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {message}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveDepositRequest}
              disabled={isSaving}
              className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSaving ? "Saving..." : "Save Deposit Request"}
            </button>

            {hasActiveDeposit ? (
              <button
                type="button"
                onClick={clearDepositRequest}
                disabled={isSaving}
                className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear Deposit
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
