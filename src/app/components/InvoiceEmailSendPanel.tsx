"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import DocumentEmailReview from "./DocumentEmailReview";
export type InvoiceEmailSendPanelProps = {
  compact?: boolean;
  onSent?: () => void;
  onSendingChange?: (sending: boolean) => void;
  documentId: string;
  documentKind?: "invoice" | "estimate";
  businessId?: string | null;
  businessSlug: string;
  businessName: string;
  customerName: string;
  recipientEmail: string | null;
  clientCcEmail?: string | null;
  documentNumber: string;
  amountDue: string;
  dueDate: string;
  daysPastDue?: number | null;
  projectTitle?: string | null;
  printHref: string;
  requestType?: "invoice" | "deposit" | "estimate" | "reminder";
  sendSplitGroup?: boolean;
  splitGroupCount?: number;
  splitGroupLabel?: string;
  splitGroupItems?: {
    documentNumber: string;
    amountLabel: string;
    splitLabel?: string | null;
  }[];
  splitGroupCombinedTotal?: string;
  correctionOriginalDisplayId?: string | null;
  sendDisabledReason?: string | null;
  initialSent?: boolean;
  initialSentAt?: string | null;
  initialSentPdfCount?: number;
};

export default function InvoiceEmailSendPanel(
  props: InvoiceEmailSendPanelProps,
) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const sent = props.initialSent || accepted;
  return (
    <section
      id={
        props.requestType === "estimate"
          ? "send-estimate"
          : props.requestType === "reminder"
            ? "late-payment-reminder"
            : "send-invoice"
      }
      className="space-y-3 rounded-2xl border border-sky-200 bg-white p-5 text-slate-950"
    >
      <h2 className="text-xl font-bold">
        {sent ? "Accepted for sending" : "Send by Email"}
      </h2>
      <p>
        {props.documentNumber} � {props.amountDue}
      </p>
      <p>
        To: {props.recipientEmail || "Enter recipient in Review Email"}
        <br />
        CC: {props.clientCcEmail || "Review workspace defaults before sending"}
      </p>
      {props.sendSplitGroup && (
        <p>
          All {props.splitGroupCount || "selected"} split invoice PDFs are
          reviewed and sent together.
        </p>
      )}
      {props.sendDisabledReason && (
        <p role="alert">{props.sendDisabledReason}</p>
      )}
      <a href={props.printHref} className="mr-4 underline">
        Preview {props.documentKind === "estimate" ? "Estimate" : "Invoice"}
      </a>
      {!sent && (
        <button
          type="button"
          disabled={Boolean(props.sendDisabledReason)}
          onClick={() => setOpen(true)}
          className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-40"
        >
          Review Email
        </button>
      )}
      <p className="text-sm">
        Opening review never sends. Edit recipients, subject and message,
        inspect the official PDFs, then explicitly approve the final send.
      </p>
      {open && (
        <DocumentEmailReview
          documentId={props.documentId}
          kind={props.documentKind}
          businessSlug={props.businessSlug}
          recipientEmail={props.recipientEmail || ""}
          sendSplitGroup={props.sendSplitGroup}
          purpose={
            props.requestType === "deposit"
              ? "deposit"
              : props.requestType === "reminder"
                ? "reminder"
                : "send"
          }
          onClose={() => {
            setOpen(false);
            props.onSendingChange?.(false);
          }}
          onSent={() => {
            setAccepted(true);
            props.onSent?.();
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
