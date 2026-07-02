"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import Card from "./Card";
import Toast from "./Toast";
import { supabase } from "../lib/supabase";

type BatchSendInvoice = {
  id: string;
  displayId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: number;
  status: string;
  recipientEmail: string | null;
  splitParentInvoiceId: string | null;
  splitChildrenCount: number;
  splitParentDisplayId: string | null;
  splitSequence: number | null;
  splitCount: number | null;
};

type SendAction = {
  key: string;
  invoiceId: string;
  label: string;
  recipientEmail: string | null;
  customerName: string;
  projectTitle: string;
  invoiceNumbers: string[];
  sendSplitGroup: boolean;
};

type SendResult = {
  key: string;
  label: string;
  type: "standalone" | "split";
  ok: boolean;
  message: string;
};

type ApiSendResult = {
  error?: string;
  message?: string;
  pipelineStageLabel?: string;
  traceId?: string;
};

function isValidEmail(value: string | null | undefined) {
  return Boolean(value?.trim().includes("@"));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function invoiceStatusKey(status: string | null | undefined) {
  return (status || "draft").trim().toLowerCase();
}

function documentListLabel(documents: string[]) {
  if (documents.length <= 1) {
    return documents[0] ?? "the selected invoice";
  }

  if (documents.length === 2) {
    return `${documents[0]} and ${documents[1]}`;
  }

  return `${documents.slice(0, -1).join(", ")}, and ${
    documents[documents.length - 1]
  }`;
}

function invoiceContext(invoice: Pick<BatchSendInvoice, "customerName" | "projectTitle">) {
  return invoice.projectTitle?.trim() || invoice.customerName?.trim() || "this work";
}

function groupSelection(
  selectedInvoices: BatchSendInvoice[],
  allInvoices: BatchSendInvoice[]
) {
  const selectedGroups = new Map<string, BatchSendInvoice[]>();

  selectedInvoices.forEach((invoice) => {
    const isSplitGroup =
      Boolean(invoice.splitParentInvoiceId) || invoice.splitChildrenCount > 0;
    const groupKey = isSplitGroup
      ? invoice.splitParentInvoiceId ?? invoice.id
      : invoice.id;
    const current = selectedGroups.get(groupKey) ?? [];
    current.push(invoice);
    selectedGroups.set(groupKey, current);
  });

  return Array.from(selectedGroups.entries()).map(([groupKey, groupInvoices]) => {
    const selectedPrimary = groupInvoices[0];
    const groupMembers = allInvoices
      .filter(
        (invoice) =>
          invoice.id === groupKey || invoice.splitParentInvoiceId === groupKey
      )
      .sort(
        (first, second) =>
          (first.splitSequence ?? 0) - (second.splitSequence ?? 0) ||
          first.displayId.localeCompare(second.displayId)
      );
    const splitChildren = groupMembers.filter(
      (invoice) => invoice.splitParentInvoiceId === groupKey
    );
    const isSplitGroup =
      Boolean(selectedPrimary.splitParentInvoiceId) ||
      selectedPrimary.splitChildrenCount > 0 ||
      splitChildren.length > 0;
    const groupRecipient =
      groupInvoices.find((invoice) => isValidEmail(invoice.recipientEmail))
        ?.recipientEmail ??
      groupMembers.find((invoice) => isValidEmail(invoice.recipientEmail))
        ?.recipientEmail ??
      null;
    const invoiceNumbers = isSplitGroup
      ? (splitChildren.length > 0 ? splitChildren : groupInvoices).map(
          (invoice) => invoice.displayId
        )
      : [selectedPrimary.displayId];
    const groupProject =
      selectedPrimary.projectTitle ||
      groupMembers.find((invoice) => invoice.projectTitle)?.projectTitle ||
      "Selected invoices";

    return {
      key: isSplitGroup ? `split:${groupKey}` : `invoice:${selectedPrimary.id}`,
      invoiceId: selectedPrimary.id,
      label: isSplitGroup
        ? `${groupProject} (${invoiceNumbers.length} split invoices)`
        : selectedPrimary.displayId,
      recipientEmail: groupRecipient,
      customerName: selectedPrimary.customerName,
      projectTitle: groupProject,
      invoiceNumbers,
      sendSplitGroup: isSplitGroup,
    } satisfies SendAction;
  });
}

export default function InvoiceBatchSendActions({
  businessSlug,
  businessName,
  invoices,
}: {
  businessSlug: string;
  businessName: string;
  invoices: BatchSendInvoice[];
}) {
  const router = useRouter();
  const sendableInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        const status = invoiceStatusKey(invoice.status);
        return status !== "sent" && status !== "paid";
      }),
    [invoices]
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [results, setResults] = useState<SendResult[]>([]);

  const selectedInvoices = sendableInvoices.filter((invoice) =>
    selectedIds.includes(invoice.id)
  );
  const sendActions = groupSelection(selectedInvoices, sendableInvoices);
  const allSelected =
    sendableInvoices.length > 0 &&
    sendableInvoices.every((invoice) => selectedIds.includes(invoice.id));
  const standaloneActionCount = sendActions.filter(
    (action) => !action.sendSplitGroup
  ).length;
  const splitActionCount = sendActions.filter(
    (action) => action.sendSplitGroup
  ).length;

  function toggleInvoice(invoiceId: string) {
    setSelectedIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId]
    );
  }

  async function sendBatch() {
    setToast(null);
    setResults([]);

    if (sendActions.length === 0) {
      setToast({
        type: "error",
        message: "Select at least one draft invoice to send.",
      });
      return;
    }

    setIsSending(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const nextResults: SendResult[] = [];

    for (const action of sendActions) {
      if (!isValidEmail(action.recipientEmail)) {
        nextResults.push({
          key: action.key,
          label: action.label,
          type: action.sendSplitGroup ? "split" : "standalone",
          ok: false,
          message: "Missing saved recipient email.",
        });
        continue;
      }

      const subject = action.sendSplitGroup
        ? `${action.projectTitle} - Split invoices`
        : `Invoice ${action.invoiceNumbers[0]} from ${businessName}`;
      const message = action.sendSplitGroup
        ? `Attached are invoices ${documentListLabel(
            action.invoiceNumbers
          )} for ${action.projectTitle}.`
        : `Attached is invoice ${action.invoiceNumbers[0]} for ${invoiceContext(
            action
          )}.`;

      try {
        const response = await fetch(
          `/api/invoices/${action.invoiceId}/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {}),
            },
            body: JSON.stringify({
              businessSlug,
              recipientEmail: action.recipientEmail,
              subject,
              message,
              attachOfficialPdf: true,
              sendSplitGroup: action.sendSplitGroup,
              emailPurpose: "send",
            }),
          }
        );
        const result = (await response.json().catch(() => ({}))) as ApiSendResult;

        if (!response.ok) {
          const traceText = result.traceId ? ` Trace ID: ${result.traceId}.` : "";
          const stageText = result.pipelineStageLabel
            ? `${result.pipelineStageLabel}: `
            : "";
          nextResults.push({
            key: action.key,
            label: action.label,
            type: action.sendSplitGroup ? "split" : "standalone",
            ok: false,
            message:
              `${stageText}${
                result.error ?? "Trimax could not send this invoice."
              }${traceText}`,
          });
          continue;
        }

        nextResults.push({
          key: action.key,
          label: action.label,
          type: action.sendSplitGroup ? "split" : "standalone",
          ok: true,
          message: result.message ?? "Sent.",
        });
      } catch (error) {
        nextResults.push({
          key: action.key,
          label: action.label,
          type: action.sendSplitGroup ? "split" : "standalone",
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Browser request failed before Trimax could reach the send server.",
        });
      }
    }

    setIsSending(false);
    setResults(nextResults);

    const successfulStandalone = nextResults.filter(
      (result) => result.ok && result.type === "standalone"
    ).length;
    const successfulSplitGroups = nextResults.filter(
      (result) => result.ok && result.type === "split"
    ).length;
    const failures = nextResults.filter((result) => !result.ok);

    setToast({
      type: failures.length > 0 ? "error" : "success",
      message:
        failures.length > 0
          ? `Batch send finished with ${failures.length} failure${
              failures.length === 1 ? "" : "s"
            }. ${successfulStandalone} standalone invoice${
              successfulStandalone === 1 ? "" : "s"
            } and ${successfulSplitGroups} split group${
              successfulSplitGroups === 1 ? "" : "s"
            } sent.`
          : `Batch send complete. ${successfulStandalone} standalone invoice${
              successfulStandalone === 1 ? "" : "s"
            } and ${successfulSplitGroups} split group${
              successfulSplitGroups === 1 ? "" : "s"
            } sent.`,
    });
    setSelectedIds([]);
    router.refresh();
  }

  if (sendableInvoices.length === 0) {
    return null;
  }

  return (
    <Card className="border-sky-500/30 bg-sky-500/10">
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-sky-200">
            Batch Send
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Send selected invoice emails
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Select draft invoices here. Normal invoices send individually.
            Split invoices are grouped first and use the existing Send Split
            Group workflow.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[440px]">
          <BatchStat label="Selected" value={selectedInvoices.length} />
          <BatchStat label="Standalone" value={standaloneActionCount} />
          <BatchStat label="Split Groups" value={splitActionCount} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setSelectedIds(
              allSelected ? [] : sendableInvoices.map((invoice) => invoice.id)
            )
          }
          className="rounded-full border border-sky-400/40 bg-sky-500/15 px-4 py-2 text-sm font-black text-sky-100 transition hover:bg-sky-500/25"
        >
          {allSelected ? "Clear All" : "Select All Visible Drafts"}
        </button>
        <button
          type="button"
          onClick={() => setSelectedIds([])}
          disabled={selectedIds.length === 0}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-500"
        >
          Clear
        </button>
      </div>

      <div className="mt-5 grid gap-2">
        {sendableInvoices.slice(0, 20).map((invoice) => {
          const isSelected = selectedIds.includes(invoice.id);
          const isSplit =
            Boolean(invoice.splitParentInvoiceId) ||
            invoice.splitChildrenCount > 0;

          return (
            <label
              key={invoice.id}
              className={`grid cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${
                isSelected
                  ? "border-sky-300 bg-sky-500/20"
                  : "border-white/10 bg-zinc-950/70 hover:border-sky-400/40"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleInvoice(invoice.id)}
                className="h-5 w-5 accent-sky-500"
              />
              <span className="min-w-0">
                <span className="block break-words text-sm font-black text-white">
                  {invoice.displayId} - {invoice.projectTitle}
                </span>
                <span className="mt-1 block text-xs font-semibold text-zinc-400">
                  {invoice.customerName} / {invoice.status}
                  {isSplit
                    ? invoice.splitParentInvoiceId
                      ? ` / Split ${invoice.splitSequence ?? "-"} of ${
                          invoice.splitCount ?? "-"
                        }`
                      : ` / Split group source`
                    : ""}
                </span>
                {!isValidEmail(invoice.recipientEmail) ? (
                  <span className="mt-1 block text-xs font-black text-amber-200">
                    Missing saved recipient email
                  </span>
                ) : null}
              </span>
              <span className="text-sm font-black text-emerald-200 sm:text-right">
                {formatMoney(invoice.invoiceAmount)}
              </span>
            </label>
          );
        })}
      </div>

      {sendableInvoices.length > 20 ? (
        <p className="mt-3 text-sm text-zinc-400">
          Showing the first 20 visible draft invoices. Filter the invoice list
          to narrow the batch.
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-zinc-400">
            Result Summary
          </p>
          <div className="mt-3 grid gap-2">
            {results.map((result) => (
              <div
                key={result.key}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  result.ok
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                    : "border-rose-400/40 bg-rose-500/10 text-rose-100"
                }`}
              >
                <strong>{result.label}</strong>: {result.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-zinc-400">
          Split groups are sent once even if multiple child invoices are
          selected.
        </p>
        <Button
          type="button"
          onClick={sendBatch}
          disabled={isSending || selectedInvoices.length === 0}
          className="w-full sm:w-auto"
        >
          {isSending ? "Sending..." : "Send Selected Invoices"}
        </Button>
      </div>
    </Card>
  );
}

function BatchStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-sky-400/25 bg-black/30 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-100/70">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}
