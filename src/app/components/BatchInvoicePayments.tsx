"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "./Card";
import Toast from "./Toast";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";

type BatchInvoice = {
  id: string;
  displayId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: number;
  amountPaid: number;
  status: string;
};

type BatchInvoicePaymentsProps = {
  invoices: BatchInvoice[];
  businessId?: string | null;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function BatchInvoicePayments({
  invoices,
  businessId,
}: BatchInvoicePaymentsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentDate, setPaymentDate] = useState(todayInputValue());
  const [paymentType, setPaymentType] = useState("Check");
  const [internalNote, setInternalNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const payableInvoices = useMemo(
    () =>
      invoices
        .map((invoice) => ({
          ...invoice,
          amountDue: Math.max(
            invoice.invoiceAmount - invoice.amountPaid,
            0
          ),
        }))
        .filter(
          (invoice) =>
            invoice.status.toLowerCase() !== "paid" &&
            invoice.amountDue > 0
        ),
    [invoices]
  );

  const selectedInvoices = payableInvoices.filter((invoice) =>
    selectedIds.includes(invoice.id)
  );

  const selectedTotal = selectedInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );

  const allVisibleSelected =
    payableInvoices.length > 0 &&
    selectedIds.length === payableInvoices.length;

  function toggleInvoice(invoiceId: string) {
    setSelectedIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId]
    );
  }

  function toggleAllVisible() {
    setSelectedIds(
      allVisibleSelected
        ? []
        : payableInvoices.map((invoice) => invoice.id)
    );
  }

  async function applyBatchPayment() {
    if (!businessId) {
      setToast({
        type: "error",
        message: "Unable to find the selected business.",
      });
      return;
    }

    if (selectedInvoices.length === 0) {
      setToast({
        type: "error",
        message: "Select at least one open invoice first.",
      });
      return;
    }

    setIsSaving(true);
    setToast(null);

    try {
      for (const invoice of selectedInvoices) {
        const { error } = await supabase
          .from("invoices")
          .update({
            amount_paid: invoice.invoiceAmount,
            status: "Paid",
          })
          .eq("id", invoice.id)
          .eq("business_id", businessId);

        if (error) {
          throw error;
        }

        await logActivity({
          businessId,
          action: "invoice.batch_payment_applied",
          entityType: "invoice",
          entityId: invoice.id,
          entityLabel: invoice.displayId,
          details: {
            paymentDate,
            paymentType,
            internalNote,
            amountApplied: invoice.amountDue,
            batchInvoiceCount: selectedInvoices.length,
          },
        });
      }

      setToast({
        type: "success",
        message: `Marked ${selectedInvoices.length} invoice${
          selectedInvoices.length === 1 ? "" : "s"
        } paid.`,
      });
      setSelectedIds([]);
      setInternalNote("");
      router.refresh();
    } catch (error) {
      console.error("Batch payment error:", error);
      setToast({
        type: "error",
        message: "Unable to apply the batch payment.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (payableInvoices.length === 0) {
    return null;
  }

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-green-300">
            Batch Payments
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Apply one check to multiple invoices
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Select the invoices paid by the same check, add the payment date
            and note, then mark them paid together.
          </p>
        </div>

        <div className="rounded-2xl border border-green-500/30 bg-zinc-950 px-5 py-4">
          <p className="text-sm text-zinc-400">Selected Total</p>
          <p className="mt-1 text-3xl font-black text-green-300">
            {formatMoney(selectedTotal)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[160px_180px_1fr_auto]">
        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Payment Date
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Payment Type
          </label>
          <select
            value={paymentType}
            onChange={(event) => setPaymentType(event.target.value)}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
          >
            <option>Check</option>
            <option>Cash</option>
            <option>ACH</option>
            <option>Card</option>
            <option>Other</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Internal Note
          </label>
          <input
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
            placeholder="Example: Check #1042 from North Creek"
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={applyBatchPayment}
            disabled={isSaving || selectedInvoices.length === 0}
            className="w-full rounded-2xl bg-green-500 px-5 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isSaving ? "Applying..." : "Mark Paid"}
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800">
        <div className="grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-300">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            aria-label="Select all open invoices"
            className="h-5 w-5 accent-green-500"
          />
          <span>Open Invoice</span>
          <span>Amount Due</span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {payableInvoices.map((invoice) => (
            <label
              key={invoice.id}
              className={`grid cursor-pointer grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-zinc-800 px-4 py-4 transition last:border-b-0 ${
                selectedIds.includes(invoice.id)
                  ? "bg-green-500/10"
                  : "bg-zinc-950/60 hover:bg-zinc-900"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(invoice.id)}
                onChange={() => toggleInvoice(invoice.id)}
                className="h-5 w-5 accent-green-500"
              />

              <span>
                <span className="block font-semibold text-white">
                  {invoice.displayId} - {invoice.projectTitle}
                </span>
                <span className="mt-1 block text-sm text-zinc-400">
                  {invoice.customerName} / {invoice.status}
                </span>
              </span>

              <span className="font-bold text-green-300">
                {formatMoney(invoice.amountDue)}
              </span>
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}
