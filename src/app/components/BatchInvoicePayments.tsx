"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "./Card";
import DateInputField from "./DateInputField";
import Toast from "./Toast";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";

type BatchInvoice = {
  id: string;
  displayId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: number;
  amountPaid: number;
  collectionAmountDue?: number;
  isDepositRequest?: boolean;
  status: string;
  dueDate?: string | null;
};

type BatchInvoicePaymentsProps = {
  invoices: BatchInvoice[];
  businessId?: string | null;
  businessSlug?: string | null;
  initialCustomer?: string | null;
  initialInvoiceIds?: string[];
};

type PayableInvoice = BatchInvoice & {
  amountDue: number;
  daysLate: number | null;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyCents(value: number) {
  return Math.round(value * 100);
}

function customerMatchesPayor(customerName: string, payor: string) {
  const normalizedPayor = payor.trim().toLowerCase();

  if (!normalizedPayor) {
    return true;
  }

  const normalizedCustomer = customerName.toLowerCase();

  return (
    normalizedCustomer.includes(normalizedPayor) ||
    normalizedPayor.includes(normalizedCustomer)
  );
}

function findMatchingInvoices(
  invoices: PayableInvoice[],
  amount: number,
  payor: string
) {
  const target = moneyCents(amount);

  if (target <= 0) {
    return [];
  }

  const payorMatches = invoices.filter((invoice) =>
    customerMatchesPayor(invoice.customerName, payor)
  );
  const candidates = (payorMatches.length > 0 ? payorMatches : invoices)
    .filter((invoice) => invoice.amountDue > 0)
    .sort((first, second) => {
      if (first.customerName !== second.customerName) {
        return first.customerName.localeCompare(second.customerName);
      }

      return (first.dueDate ?? "9999-12-31").localeCompare(
        second.dueDate ?? "9999-12-31"
      );
    })
    .slice(0, 18);

  const sums = new Map<number, PayableInvoice[]>();
  sums.set(0, []);

  for (const invoice of candidates) {
    const invoiceCents = moneyCents(invoice.amountDue);
    const currentSums = Array.from(sums.entries());

    for (const [sum, invoiceList] of currentSums) {
      const nextSum = sum + invoiceCents;

      if (nextSum > target || sums.has(nextSum)) {
        continue;
      }

      const nextInvoiceList = [...invoiceList, invoice];
      sums.set(nextSum, nextInvoiceList);

      if (nextSum === target) {
        return nextInvoiceList;
      }
    }
  }

  const exactSingle = candidates.find(
    (invoice) => Math.abs(invoice.amountDue - amount) < 0.01
  );

  if (exactSingle) {
    return [exactSingle];
  }

  return [...candidates]
    .sort((first, second) => second.amountDue - first.amountDue)
    .reduce<PayableInvoice[]>((matches, invoice) => {
      const currentTotal = matches.reduce(
        (total, item) => total + item.amountDue,
        0
      );

      return currentTotal + invoice.amountDue <= amount + 0.01
        ? [...matches, invoice]
        : matches;
    }, []);
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

  return Math.floor(
    (today.getTime() - dueDate.getTime()) / 86_400_000
  );
}

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function initialCustomerFocus(
  invoices: BatchInvoice[],
  customerName?: string | null
) {
  const focusedCustomer = customerName?.trim();

  if (!focusedCustomer) {
    return null;
  }

  const matchingInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      amountDue:
        typeof invoice.collectionAmountDue === "number"
          ? Math.max(invoice.collectionAmountDue, 0)
          : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
    }))
    .filter(
      (invoice) =>
        invoice.customerName.toLowerCase() ===
          focusedCustomer.toLowerCase() &&
        invoice.status.toLowerCase() !== "paid" &&
        invoice.amountDue > 0
    );

  if (matchingInvoices.length === 0) {
    return null;
  }

  return {
    customerName: matchingInvoices[0].customerName,
    invoiceIds: matchingInvoices.map((invoice) => invoice.id),
    total: matchingInvoices.reduce(
      (total, invoice) => total + invoice.amountDue,
      0
    ),
  };
}

function initialInvoiceFocus(
  invoices: BatchInvoice[],
  invoiceIds?: string[]
) {
  if (!invoiceIds || invoiceIds.length === 0) {
    return null;
  }

  const requestedIds = new Set(invoiceIds);
  const matchingInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      amountDue:
        typeof invoice.collectionAmountDue === "number"
          ? Math.max(invoice.collectionAmountDue, 0)
          : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
    }))
    .filter(
      (invoice) =>
        requestedIds.has(invoice.id) &&
        invoice.status.toLowerCase() !== "paid" &&
        invoice.amountDue > 0
    );

  if (matchingInvoices.length === 0) {
    return null;
  }

  const customerNames = Array.from(
    new Set(matchingInvoices.map((invoice) => invoice.customerName))
  );

  return {
    customerName:
      customerNames.length === 1
        ? customerNames[0]
        : `${customerNames.length} customers`,
    invoiceIds: matchingInvoices.map((invoice) => invoice.id),
    total: matchingInvoices.reduce(
      (total, invoice) => total + invoice.amountDue,
      0
    ),
  };
}

export default function BatchInvoicePayments({
  invoices,
  businessId,
  businessSlug,
  initialCustomer,
  initialInvoiceIds,
}: BatchInvoicePaymentsProps) {
  const router = useRouter();
  const startingFocus =
    initialInvoiceFocus(invoices, initialInvoiceIds) ??
    initialCustomerFocus(invoices, initialCustomer);
  const startedFromInvoiceSelection =
    Boolean(initialInvoiceIds?.length) && Boolean(startingFocus);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    startingFocus?.invoiceIds ?? []
  );
  const [paymentDate, setPaymentDate] = useState(todayInputValue());
  const [paymentType, setPaymentType] = useState("Check");
  const [paymentReference, setPaymentReference] = useState("");
  const [checkAmount, setCheckAmount] = useState(
    startingFocus ? formatMoney(startingFocus.total) : ""
  );
  const [checkImagePreview, setCheckImagePreview] = useState("");
  const [checkImageName, setCheckImageName] = useState("");
  const [checkPayor, setCheckPayor] = useState("");
  const [capturedCheckAmount, setCapturedCheckAmount] = useState(
    startingFocus ? formatMoney(startingFocus.total) : ""
  );
  const [capturedCheckReference, setCapturedCheckReference] = useState("");
  const [internalNote, setInternalNote] = useState(
    startedFromInvoiceSelection
      ? "Selected invoice batch payment"
      : startingFocus
        ? `${startingFocus.customerName} batch payment`
        : ""
  );
  const [customerFilter, setCustomerFilter] = useState(
    startedFromInvoiceSelection ? "all" : startingFocus?.customerName ?? "all"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const payableInvoices = useMemo<PayableInvoice[]>(
    () =>
      invoices
        .map((invoice) => ({
          ...invoice,
          amountDue:
            typeof invoice.collectionAmountDue === "number"
              ? Math.max(invoice.collectionAmountDue, 0)
              : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
          daysLate: daysPastDue(invoice.dueDate),
        }))
        .filter(
          (invoice) =>
            invoice.status.toLowerCase() !== "paid" &&
            invoice.amountDue > 0
        ),
    [invoices]
  );

  const customerGroups = useMemo(() => {
    const groups = new Map<
      string,
      { customerName: string; count: number; total: number }
    >();

    payableInvoices.forEach((invoice) => {
      const customerName = invoice.customerName || "Unknown Customer";
      const current = groups.get(customerName) ?? {
        customerName,
        count: 0,
        total: 0,
      };

      groups.set(customerName, {
        ...current,
        count: current.count + 1,
        total: current.total + invoice.amountDue,
      });
    });

    return Array.from(groups.values()).sort((first, second) =>
      first.customerName.localeCompare(second.customerName)
    );
  }, [payableInvoices]);

  const visibleInvoices =
    customerFilter === "all"
      ? payableInvoices
      : payableInvoices.filter(
          (invoice) => invoice.customerName === customerFilter
        );

  const selectedInvoices = payableInvoices.filter((invoice) =>
    selectedIds.includes(invoice.id)
  );

  const selectedTotal = selectedInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );

  const selectedCustomerGroups = new Map<
    string,
    { customerName: string; count: number; total: number }
  >();

  selectedInvoices.forEach((invoice) => {
    const customerName = invoice.customerName || "Unknown Customer";
    const current = selectedCustomerGroups.get(customerName) ?? {
      customerName,
      count: 0,
      total: 0,
    };

    selectedCustomerGroups.set(customerName, {
      customerName,
      count: current.count + 1,
      total: current.total + invoice.amountDue,
    });
  });

  const selectedCustomerBreakdown = Array.from(
    selectedCustomerGroups.values()
  ).sort((first, second) =>
    first.customerName.localeCompare(second.customerName)
  );

  const visibleTotal = visibleInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );

  const openBalance = payableInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );

  const enteredCheckAmount = checkAmount.trim()
    ? parseMoney(checkAmount)
    : null;
  const checkDifference =
    enteredCheckAmount === null
      ? 0
      : Number((enteredCheckAmount - selectedTotal).toFixed(2));
  const checkAmountMatches =
    enteredCheckAmount === null || Math.abs(checkDifference) < 0.01;

  const allVisibleSelected =
    visibleInvoices.length > 0 &&
    visibleInvoices.every((invoice) => selectedIds.includes(invoice.id));

  const paymentReadyGroups = [...customerGroups]
    .filter((group) => group.count > 1)
    .sort((first, second) => second.total - first.total)
    .slice(0, 4);

  const focusedCustomer = initialCustomer?.trim() ?? "";
  const capturedAmountValue = capturedCheckAmount.trim()
    ? parseMoney(capturedCheckAmount)
    : 0;
  const suggestedCheckMatches = useMemo(
    () =>
      findMatchingInvoices(
        payableInvoices,
        capturedAmountValue,
        checkPayor
      ),
    [capturedAmountValue, checkPayor, payableInvoices]
  );
  const suggestedCheckTotal = suggestedCheckMatches.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const hasExactCheckMatch =
    capturedAmountValue > 0 &&
    suggestedCheckMatches.length > 0 &&
    Math.abs(suggestedCheckTotal - capturedAmountValue) < 0.01;

  useEffect(() => {
    return () => {
      if (checkImagePreview) {
        URL.revokeObjectURL(checkImagePreview);
      }
    };
  }, [checkImagePreview]);

  function toggleInvoice(invoiceId: string) {
    setSelectedIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId]
    );
  }

  function toggleAllVisible() {
    const visibleIds = visibleInvoices.map((invoice) => invoice.id);

    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function selectInvoicesAndAmount(
    invoiceList: PayableInvoice[],
    note: string
  ) {
    const invoiceIds = invoiceList.map((invoice) => invoice.id);
    const invoiceTotal = invoiceList.reduce(
      (total, invoice) => total + invoice.amountDue,
      0
    );

    setSelectedIds(invoiceIds);
    setCheckAmount(invoiceIds.length > 0 ? formatMoney(invoiceTotal) : "");
    setInternalNote(invoiceIds.length > 0 ? note : "");
  }

  function selectVisibleInvoices() {
    selectInvoicesAndAmount(
      visibleInvoices,
      customerFilter === "all"
        ? "Visible invoice batch payment"
        : `${customerFilter} batch payment`
    );
  }

  function selectOverdueInvoices() {
    const overdueInvoices = payableInvoices.filter(
      (invoice) => (invoice.daysLate ?? -1) >= 0
    );

    setCustomerFilter("all");
    selectInvoicesAndAmount(overdueInvoices, "Overdue invoice batch payment");
  }

  function selectOldestInvoices() {
    const oldestInvoices = [...payableInvoices]
      .sort((first, second) => {
        const firstDate = first.dueDate ?? "9999-12-31";
        const secondDate = second.dueDate ?? "9999-12-31";

        return firstDate.localeCompare(secondDate);
      })
      .slice(0, 10);

    setCustomerFilter("all");
    selectInvoicesAndAmount(
      oldestInvoices,
      "Oldest open invoice batch payment"
    );
  }

  function selectCustomerGroup(customerName: string) {
    const customerInvoiceIds = payableInvoices
      .filter((invoice) => invoice.customerName === customerName)
      .map((invoice) => invoice.id);

    setCustomerFilter(customerName);
    setSelectedIds(customerInvoiceIds);
    setCheckAmount(
      formatMoney(
        payableInvoices
          .filter((invoice) => invoice.customerName === customerName)
          .reduce((total, invoice) => total + invoice.amountDue, 0)
      )
    );
  }

  function fillSelectedTotal() {
    setCheckAmount(formatMoney(selectedTotal));
  }

  function clearSelection() {
    setSelectedIds([]);
    setCheckAmount("");
  }

  function captureCheckImage(file: File | undefined) {
    if (!file) {
      return;
    }

    if (checkImagePreview) {
      URL.revokeObjectURL(checkImagePreview);
    }

    setCheckImagePreview(URL.createObjectURL(file));
    setCheckImageName(file.name);
  }

  function applyCheckCaptureMatch() {
    if (capturedAmountValue <= 0) {
      setToast({
        type: "error",
        message: "Enter the check amount before matching invoices.",
      });
      return;
    }

    if (suggestedCheckMatches.length === 0) {
      setToast({
        type: "error",
        message:
          "Trimax could not find invoice matches for that check amount yet.",
      });
      return;
    }

    setPaymentType("Check");
    setPaymentReference(capturedCheckReference.trim());
    setCheckAmount(formatMoney(capturedAmountValue));
    setSelectedIds(suggestedCheckMatches.map((invoice) => invoice.id));
    const matchedCustomers = Array.from(
      new Set(suggestedCheckMatches.map((invoice) => invoice.customerName))
    );
    setCustomerFilter(matchedCustomers.length === 1 ? matchedCustomers[0] : "all");
    setInternalNote(
      `Check capture match${
        checkImageName ? ` from ${checkImageName}` : ""
      }`
    );
    setToast({
      type: "success",
      message: hasExactCheckMatch
        ? "Trimax matched the check to open invoices."
        : "Trimax selected the closest open invoices. Review before applying.",
    });
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

    if (!checkAmountMatches) {
      setToast({
        type: "error",
        message:
          "The check amount does not match the selected invoices yet.",
      });
      return;
    }

    setIsSaving(true);
    setToast(null);

    try {
      await assertCanWriteDuringMaintenance(businessSlug);

      for (const invoice of selectedInvoices) {
        const nextAmountPaid = Math.min(
          invoice.invoiceAmount,
          invoice.amountPaid + invoice.amountDue
        );
        const isFullyPaid =
          invoice.invoiceAmount > 0 &&
          nextAmountPaid >= invoice.invoiceAmount - 0.01;
        const updatePayload: {
          amount_paid: number;
          status: string;
          deposit_status?: string;
        } = {
          amount_paid: nextAmountPaid,
          status: isFullyPaid ? "Paid" : invoice.status,
        };

        if (invoice.isDepositRequest && !isFullyPaid) {
          updatePayload.deposit_status = "paid";
        }

        const { error } = await supabase
          .from("invoices")
          .update(updatePayload)
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
            paymentReference,
            internalNote,
            checkAmount: enteredCheckAmount,
            amountApplied: invoice.amountDue,
            resultingAmountPaid: nextAmountPaid,
            paymentOutcome: isFullyPaid ? "paid" : "partial",
            depositPayment: Boolean(invoice.isDepositRequest),
            batchInvoiceCount: selectedInvoices.length,
          },
        });
      }

      setToast({
        type: "success",
        message: `Applied payment to ${selectedInvoices.length} invoice${
          selectedInvoices.length === 1 ? "" : "s"
        }.`,
      });
      setSelectedIds([]);
      setPaymentReference("");
      setCheckAmount("");
      setInternalNote("");
      router.refresh();
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to apply the batch payment. Refresh, sign in again if needed, then try once more.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (payableInvoices.length === 0) {
    return null;
  }

  return (
    <Card className="batch-payments-card border-green-500/30 bg-green-500/5">
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-green-300">
            Batch Payments
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            One check can pay many invoices
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Select the invoices covered by the same check, add the payment
            details, then apply the whole batch together.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <div className="app-metric-card rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm text-zinc-400">Open Balance</p>
            <p className="mt-1 text-2xl font-black text-slate-950">
              {formatMoney(openBalance)}
            </p>
          </div>

          <div className="app-metric-card rounded-2xl border border-green-200 bg-green-50 px-5 py-4 shadow-sm">
            <p className="text-sm text-zinc-400">Selected</p>
            <p className="mt-1 text-2xl font-black text-green-700">
              {selectedInvoices.length}
            </p>
          </div>

          <div className="app-metric-card rounded-2xl border border-green-200 bg-green-50 px-5 py-4 shadow-sm">
            <p className="text-sm text-zinc-400">Selected Total</p>
            <p className="mt-1 text-2xl font-black text-green-700">
              {formatMoney(selectedTotal)}
            </p>
          </div>
        </div>
      </div>

      {paymentReadyGroups.length > 0 ? (
        <div className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-green-300">
                Payment Ready
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Customers with several open invoices are good batch payment
                candidates.
              </p>
            </div>

            <p className="text-sm text-zinc-500">
              Pick one to load its invoices.
            </p>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {paymentReadyGroups.map((group) => (
              <button
                key={group.customerName}
                type="button"
                onClick={() => selectCustomerGroup(group.customerName)}
                className="app-action-card rounded-2xl border border-green-200 bg-white p-4 text-left shadow-sm transition hover:border-green-400 hover:bg-green-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {group.customerName}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {group.count} open invoices
                    </p>
                  </div>

                  <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-200">
                    Load
                  </span>
                </div>

                <p className="mt-4 text-2xl font-black text-green-300">
                  {formatMoney(group.total)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {focusedCustomer ? (
        <div className="mt-6 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm leading-6 text-green-50">
          Payment workspace opened for{" "}
          <span className="font-semibold">{focusedCustomer}</span>. Trimax
          selected matching open invoices when it found them.
        </div>
      ) : null}

      {startedFromInvoiceSelection ? (
        <div className="mt-6 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm leading-6 text-green-50">
          Trimax loaded{" "}
          <span className="font-semibold">
            {startingFocus?.invoiceIds.length ?? 0} selected invoice
            {(startingFocus?.invoiceIds.length ?? 0) === 1 ? "" : "s"}
          </span>{" "}
          from the invoice list. Review the check amount and payment details
          before applying.
        </div>
      ) : null}

      {customerGroups.length > 1 ? (
        <div className="mt-6">
          <p className="mb-2 text-sm text-zinc-400">
            Filter by customer
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCustomerFilter("all")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                customerFilter === "all"
                  ? "bg-green-500 text-black"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-green-300 hover:bg-green-50"
              }`}
            >
              All open invoices
            </button>

            {customerGroups.map((group) => (
              <button
                key={group.customerName}
                type="button"
                onClick={() => setCustomerFilter(group.customerName)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  customerFilter === group.customerName
                    ? "bg-green-500 text-black"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-green-300 hover:bg-green-50"
                }`}
              >
                {group.customerName} ({group.count})
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="check-capture-panel mt-6 overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/10">
        <div className="grid gap-5 p-4 md:grid-cols-[0.8fr_1.2fr] md:p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
              Check Capture
            </p>
            <h3 className="mt-2 text-2xl font-black">
              Photograph a check, then match it
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Use your phone camera, confirm the check amount and payor, and
              Trimax will suggest the invoices that fit that check.
            </p>

            <label className="mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sky-400/50 bg-black/30 p-4 text-center transition hover:border-sky-300 hover:bg-sky-500/10">
              {checkImagePreview ? (
                <span className="grid gap-3">
                  <span
                    role="img"
                    aria-label="Check preview"
                    className="h-44 w-full rounded-xl bg-contain bg-center bg-no-repeat shadow-lg"
                    style={{
                      backgroundImage: `url(${checkImagePreview})`,
                    }}
                  />
                  <span className="text-xs font-semibold text-sky-200">
                    {checkImageName || "Check image loaded"}
                  </span>
                </span>
              ) : (
                <span>
                  <span className="block text-3xl font-light text-sky-200">
                    +
                  </span>
                  <span className="mt-2 block font-semibold text-white">
                    Add check photo
                  </span>
                  <span className="mt-1 block text-xs text-zinc-400">
                    Camera opens on mobile when available
                  </span>
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) =>
                  captureCheckImage(event.target.files?.[0])
                }
              />
            </label>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <span className="text-sm font-semibold text-zinc-300">
                  Check Amount
                </span>
                <input
                  inputMode="decimal"
                  value={capturedCheckAmount}
                  onChange={(event) =>
                    setCapturedCheckAmount(event.target.value)
                  }
                  placeholder="$0.00"
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-zinc-300">
                  Payor
                </span>
                <input
                  value={checkPayor}
                  onChange={(event) => setCheckPayor(event.target.value)}
                  placeholder="Customer name"
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-zinc-300">
                  Check #
                </span>
                <input
                  value={capturedCheckReference}
                  onChange={(event) =>
                    setCapturedCheckReference(event.target.value)
                  }
                  placeholder="1042"
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    Suggested match
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    {capturedAmountValue > 0
                      ? hasExactCheckMatch
                        ? "Exact match found."
                        : suggestedCheckMatches.length > 0
                          ? "Closest match found. Review before applying."
                          : "No match yet. Adjust amount or payor."
                      : "Enter a check amount to find invoices."}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    hasExactCheckMatch
                      ? "bg-emerald-500 text-black"
                      : suggestedCheckMatches.length > 0
                        ? "bg-amber-300 text-amber-950"
                        : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {hasExactCheckMatch
                    ? "Exact"
                    : suggestedCheckMatches.length > 0
                      ? "Review"
                      : "Waiting"}
                </span>
              </div>

              {suggestedCheckMatches.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {suggestedCheckMatches.slice(0, 4).map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">
                          {invoice.displayId}
                        </span>
                        <span className="mt-0.5 block truncate text-zinc-400">
                          {invoice.customerName}
                        </span>
                      </span>
                      <span className="font-black text-emerald-300">
                        {formatMoney(invoice.amountDue)}
                      </span>
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm">
                    <span className="text-zinc-400">
                      Suggested total
                    </span>
                    <span className="font-black text-white">
                      {formatMoney(suggestedCheckTotal)}
                    </span>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={applyCheckCaptureMatch}
                disabled={
                  capturedAmountValue <= 0 ||
                  suggestedCheckMatches.length === 0
                }
                className="mt-4 w-full rounded-2xl bg-sky-500 px-5 py-3 font-black text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Use Check Match
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="app-soft-panel mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[150px_150px_170px_1fr_auto]">
          <DateInputField
            label="Payment Date"
            value={paymentDate}
            onChange={setPaymentDate}
            inputClassName="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-28 text-slate-950 outline-none transition focus:border-sky-500"
          />

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Payment Type
            </label>
            <select
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            >
              <option>Check</option>
              <option>Cash</option>
              <option>ACH</option>
              <option>Card</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-sm text-zinc-400">
                Check Amount
              </label>

              {selectedInvoices.length > 0 ? (
                <button
                  type="button"
                  onClick={fillSelectedTotal}
                  className="text-xs font-semibold text-green-300 transition hover:text-green-100"
                >
                  Use selected total
                </button>
              ) : null}
            </div>
            <input
              inputMode="decimal"
              value={checkAmount}
              onChange={(event) => setCheckAmount(event.target.value)}
              placeholder={formatMoney(selectedTotal)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Reference / Check #
            </label>
            <input
              value={paymentReference}
              onChange={(event) =>
                setPaymentReference(event.target.value)
              }
              placeholder="Example: Check #1042"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            />
          </div>

          <div className="md:col-span-2 xl:col-span-1">
            <label className="mb-2 block text-sm text-zinc-400">
              Internal Note
            </label>
            <input
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Example: North Creek May unit batch"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={applyBatchPayment}
              disabled={
                isSaving ||
                selectedInvoices.length === 0 ||
                !checkAmountMatches
              }
              className="w-full rounded-2xl bg-green-500 px-5 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {isSaving ? "Applying..." : "Apply Selected Payment"}
            </button>
          </div>
        </div>

        {selectedInvoices.length > 0 ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              checkAmountMatches
                ? "border-green-500/30 bg-green-500/10 text-green-100"
                : "border-yellow-500/40 bg-yellow-500/10 text-yellow-100"
            }`}
          >
            {enteredCheckAmount === null ? (
              <span>
                Selected invoices total {formatMoney(selectedTotal)}. Enter
                the check amount if you want Trimax to verify the batch
                before applying it.
              </span>
            ) : checkAmountMatches ? (
              <span>
                Check amount matches the selected invoice total.
              </span>
            ) : (
              <span>
                Check amount is off by {formatMoney(checkDifference)}.
                Adjust the selection or check amount before applying.
              </span>
            )}
          </div>
        ) : null}

        {selectedCustomerBreakdown.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-950">
                Selected payment batch
              </p>
                <p className="text-sm font-bold text-green-700">
                {formatMoney(selectedTotal)}
              </p>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {selectedCustomerBreakdown.map((group) => (
                <div
                  key={group.customerName}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">
                    {group.customerName} ({group.count})
                  </span>
                  <span className="font-semibold text-slate-950">
                    {formatMoney(group.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-400">
          Showing {visibleInvoices.length} invoice
          {visibleInvoices.length === 1 ? "" : "s"} totaling{" "}
          <span className="font-semibold text-white">
            {formatMoney(visibleTotal)}
          </span>
          .
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectVisibleInvoices}
            disabled={visibleInvoices.length === 0}
            className="rounded-full border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 transition hover:border-green-400 hover:bg-green-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Select Visible + Total
          </button>

          <button
            type="button"
            onClick={selectOverdueInvoices}
            disabled={!payableInvoices.some((invoice) => (invoice.daysLate ?? -1) >= 0)}
            className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Select Overdue
          </button>

          <button
            type="button"
            onClick={selectOldestInvoices}
            disabled={payableInvoices.length === 0}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            Select Oldest 10
          </button>

          <button
            type="button"
            onClick={toggleAllVisible}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-green-300 hover:bg-green-50"
          >
            {allVisibleSelected ? "Unselect Visible" : "Select Visible"}
          </button>

          {selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Clear Selection
            </button>
          ) : null}
        </div>
      </div>

      <div className="app-data-table mt-4 overflow-hidden rounded-2xl border border-zinc-800">
        <div className="app-data-table-head grid grid-cols-[56px_1fr_150px_140px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 max-md:grid-cols-[42px_1fr_auto]">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            aria-label="Select all visible open invoices"
            className="h-5 w-5 accent-green-500"
          />
          <span>Open Invoice</span>
          <span className="max-md:hidden">Due</span>
          <span className="text-right">Collection Due</span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {visibleInvoices.map((invoice) => {
            const isLate = (invoice.daysLate ?? -1) >= 0;

            return (
              <label
                key={invoice.id}
                className={`grid cursor-pointer grid-cols-[56px_1fr_150px_140px] items-center gap-3 border-b border-zinc-800 px-4 py-4 transition last:border-b-0 max-md:grid-cols-[42px_1fr_auto] ${
                  selectedIds.includes(invoice.id)
                    ? "bg-green-500/10"
                    : "app-data-table-row bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(invoice.id)}
                  onChange={() => toggleInvoice(invoice.id)}
                  className="h-5 w-5 accent-green-500"
                />

                <span>
                  <span className="block font-semibold text-slate-950">
                    {invoice.displayId} - {invoice.projectTitle}
                  </span>
                  <span className="mt-1 block text-sm text-zinc-400">
                    {invoice.customerName} / {invoice.status}
                  </span>
                  {invoice.isDepositRequest ? (
                    <span className="mt-2 inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                      Deposit request
                    </span>
                  ) : null}
                  <span className="mt-2 hidden text-xs text-zinc-500 max-md:block">
                    Due {formatDate(invoice.dueDate)}
                  </span>
                </span>

                <span className="max-md:hidden">
                  <span className="block text-sm text-zinc-300">
                    {formatDate(invoice.dueDate)}
                  </span>
                  {isLate ? (
                    <span className="mt-1 block text-xs font-semibold text-pink-200">
                      {invoice.daysLate} day
                      {invoice.daysLate === 1 ? "" : "s"} late
                    </span>
                  ) : null}
                </span>

                <span className="text-right font-bold text-green-300">
                  {formatMoney(invoice.amountDue)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
