"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InvoiceForBulkPayment = {
  id: string;
  displayId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: number;
  amountPaid: number;
  status: string;
  dueDate?: string | null;
};

type InvoiceBulkPaymentActionsProps = {
  businessSlug: string;
  invoices: InvoiceForBulkPayment[];
};

type CustomerPaymentGroup = {
  customerName: string;
  count: number;
  total: number;
  invoiceIds: string[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "No due date";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function daysPastDue(value?: string | null) {
  if (!value) {
    return null;
  }

  const dueDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
}

export default function InvoiceBulkPaymentActions({
  businessSlug,
  invoices,
}: InvoiceBulkPaymentActionsProps) {
  const payableInvoices = useMemo(
    () =>
      invoices
        .map((invoice) => ({
          ...invoice,
          amountDue: Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
          daysLate: daysPastDue(invoice.dueDate),
        }))
        .filter(
          (invoice) =>
            invoice.amountDue > 0 &&
            invoice.status.toLowerCase() !== "paid"
        ),
    [invoices]
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedInvoices = payableInvoices.filter((invoice) =>
    selectedIds.includes(invoice.id)
  );
  const selectedTotal = selectedInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const overdueInvoices = payableInvoices.filter(
    (invoice) => (invoice.daysLate ?? -1) >= 0
  );
  const customerGroups = Array.from(
    payableInvoices
      .reduce((groups, invoice) => {
        const current = groups.get(invoice.customerName) ?? {
          customerName: invoice.customerName,
          count: 0,
          total: 0,
          invoiceIds: [] as string[],
        };

        current.count += 1;
        current.total += invoice.amountDue;
        current.invoiceIds.push(invoice.id);
        groups.set(invoice.customerName, current);

        return groups;
      }, new Map<string, CustomerPaymentGroup>())
      .values()
  )
    .filter((group) => group.count > 1)
    .sort((first, second) => second.total - first.total)
    .slice(0, 4);
  const allSelected =
    payableInvoices.length > 0 &&
    payableInvoices.every((invoice) => selectedIds.includes(invoice.id));
  const paymentHref =
    selectedIds.length > 0
      ? `/payments?${new URLSearchParams({
          business: businessSlug,
          invoiceIds: selectedIds.join(","),
        }).toString()}`
      : `/payments?${new URLSearchParams({
          business: businessSlug,
        }).toString()}`;

  function toggleInvoice(invoiceId: string) {
    setSelectedIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId]
    );
  }

  function selectInvoices(invoiceIds: string[]) {
    setSelectedIds(Array.from(new Set(invoiceIds)));
  }

  if (payableInvoices.length === 0) {
    return null;
  }

  return (
    <section className="payment-hero-card rounded-[2rem] border border-green-500/25 bg-gradient-to-br from-green-500/10 via-zinc-900 to-zinc-950 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.25)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="payment-hero-label text-sm font-semibold uppercase tracking-[0.35em] text-green-300">
            Batch Payment Prep
          </p>

          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
            Select invoices paid by one check
          </h2>

          <p className="payment-hero-copy mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Pick the invoices first, then Trimax opens the payment workspace
            with that exact batch ready to review.
          </p>
        </div>

        <div className="payment-hero-stats grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <div className="payment-hero-stat rounded-2xl border border-zinc-800 bg-black/50 px-4 py-3">
            <p className="text-sm text-zinc-400">Open Invoices</p>
            <p className="mt-1 text-2xl font-black text-white">
              {payableInvoices.length}
            </p>
          </div>

          <div className="payment-hero-stat rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3">
            <p className="text-sm text-green-100/80">Selected</p>
            <p className="mt-1 text-2xl font-black text-green-100">
              {selectedInvoices.length}
            </p>
          </div>

          <div className="payment-hero-stat rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3">
            <p className="text-sm text-green-100/80">Selected Total</p>
            <p className="mt-1 text-2xl font-black text-green-100">
              {formatMoney(selectedTotal)}
            </p>
          </div>
        </div>
      </div>

      <div className="payment-quick-actions mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            selectInvoices(payableInvoices.map((invoice) => invoice.id))
          }
          className="payment-chip rounded-full bg-green-500 px-4 py-2 text-sm font-black text-black transition hover:bg-green-400"
        >
          Select All Open
        </button>

        <button
          type="button"
          onClick={() =>
            selectInvoices(overdueInvoices.map((invoice) => invoice.id))
          }
          disabled={overdueInvoices.length === 0}
          className="payment-chip rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Select Overdue
        </button>

        {customerGroups.map((group) => (
          <button
            key={group.customerName}
            type="button"
            onClick={() => selectInvoices(group.invoiceIds)}
            className="payment-chip rounded-full border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-100 transition hover:bg-green-500/20"
          >
            {group.customerName} ({group.count})
          </button>
        ))}

        <button
          type="button"
          onClick={() => setSelectedIds([])}
          disabled={selectedIds.length === 0}
          className="payment-chip rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Clear
        </button>
      </div>

      <div className="payment-prep-table mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[48px_1fr_130px_140px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 max-md:grid-cols-[42px_1fr_auto]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              allSelected
                ? setSelectedIds([])
                : selectInvoices(payableInvoices.map((invoice) => invoice.id))
            }
            aria-label="Select all open invoices"
            className="h-5 w-5 accent-green-500"
          />
          <span>Invoice</span>
          <span className="max-md:hidden">Due</span>
          <span className="text-right">Balance</span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {payableInvoices.slice(0, 12).map((invoice) => {
            const isSelected = selectedIds.includes(invoice.id);
            const isLate = (invoice.daysLate ?? -1) >= 0;

            return (
              <label
                key={invoice.id}
                className={`payment-prep-row grid cursor-pointer grid-cols-[48px_1fr_130px_140px] items-center gap-3 border-b border-slate-200 px-4 py-4 transition last:border-b-0 max-md:grid-cols-[34px_minmax(0,1fr)_auto] max-md:gap-2 max-md:px-3 ${
                  isSelected
                    ? "payment-prep-row-selected bg-green-50"
                    : "bg-white hover:bg-sky-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleInvoice(invoice.id)}
                  className="h-5 w-5 accent-green-500"
                />

                <span className="min-w-0">
                  <span className="block break-words font-semibold leading-snug text-slate-950">
                    {invoice.displayId} - {invoice.projectTitle}
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    {invoice.customerName} / {invoice.status}
                  </span>
                  <span className="mt-2 hidden text-xs text-slate-500 max-md:block">
                    Due {formatDate(invoice.dueDate)}
                  </span>
                </span>

                <span className="max-md:hidden">
                  <span className="block text-sm text-slate-700">
                    {formatDate(invoice.dueDate)}
                  </span>
                  {isLate ? (
                    <span className="mt-1 block text-xs font-semibold text-rose-700">
                      {invoice.daysLate} day
                      {invoice.daysLate === 1 ? "" : "s"} late
                    </span>
                  ) : null}
                </span>

                <span className="shrink-0 text-right font-black text-emerald-700">
                  {formatMoney(invoice.amountDue)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-400">
          Showing up to 12 open invoices here. Use the payment workspace for the
          full check-day list. Selected invoices carry over automatically.
        </p>

        <Link
          href={paymentHref}
          className={`rounded-full px-5 py-3 text-center text-sm font-black transition sm:shrink-0 ${
            selectedIds.length > 0
              ? "bg-green-500 text-black hover:bg-green-400"
              : "border border-slate-300 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
          }`}
        >
          {selectedIds.length > 0
            ? "Record Selected Payment"
            : "Open Payment Workspace"}
        </Link>
      </div>
    </section>
  );
}
