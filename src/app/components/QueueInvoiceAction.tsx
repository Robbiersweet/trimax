"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { resolveQueueAction, type QueueActionInput } from "../lib/queueAction";
import { supabase } from "../lib/supabase";
import InvoiceEmailSendPanel, {
  type InvoiceEmailSendPanelProps,
} from "./InvoiceEmailSendPanel";

export default function QueueInvoiceAction({
  context,
  email,
}: {
  context: QueueActionInput;
  email: InvoiceEmailSendPanelProps;
}) {
  const [pdfReady, setPdfReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState("");
  const row = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const candidate =
    resolveQueueAction({ ...context, pdfReady: true }).type === "send_invoice";
  useEffect(() => {
    if (!row.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(row.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!candidate || !visible) return;
    let active = true;
    async function verify() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch(
          `/api/invoices/${email.documentId}/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {}),
            },
            body: JSON.stringify({
              businessSlug: email.businessSlug,
              recipientEmail: email.recipientEmail,
              subject: "Invoice readiness check",
              message: "Invoice readiness check",
              preflightOnly: true,
              attachOfficialPdf: true,
              sendSplitGroup: email.sendSplitGroup,
            }),
          },
        );
        const result = await response.json();
        if (active) {
          setPdfReady(response.ok && result.ready === true);
          setFailure(
            response.ok ? "" : result.error || "Invoice could not be verified.",
          );
        }
      } catch {
        if (active)
          setFailure("Invoice could not be verified. Open it to review.");
      }
    }
    void verify();
    return () => {
      active = false;
    };
  }, [
    candidate,
    visible,
    email.documentId,
    email.businessSlug,
    email.recipientEmail,
    email.sendSplitGroup,
  ]);
  const action = resolveQueueAction({
    ...context,
    pdfReady,
    sentIds: sent
      ? [
          ...context.sentIds,
          ...context.packageInvoices.map((i) => i.id),
          email.documentId,
        ]
      : context.sentIds,
  });
  const buttonClass =
    "rounded-2xl bg-sky-500 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-sky-400 md:justify-self-end";
  return (
    <div ref={row} data-queue-row-control="true">
      {action.type === "send_invoice" ? (
        <button className={buttonClass} onClick={() => setOpen(true)}>
          Send Invoice
        </button>
      ) : (
        <Link
          className={buttonClass}
          href={action.href}
          title={failure || action.blockedReason || undefined}
        >
          {action.label}
        </Link>
      )}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => {
              if (!sending) setOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Confirm invoice send"
              onKeyDown={(event) => {
                if (event.key === "Escape" && !sending) setOpen(false);
                if (event.key === "Tab") {
                  const controls = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>(
                      "button:not(:disabled), a[href], input:not(:disabled)",
                    ),
                  );
                  const first = controls[0];
                  const last = controls[controls.length - 1];
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                  } else if (
                    !event.shiftKey &&
                    document.activeElement === last
                  ) {
                    event.preventDefault();
                    first?.focus();
                  }
                }
              }}
              className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-white"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className="text-xl font-bold">Send {email.documentNumber}</h2>
              <p className="mt-2">{email.customerName}</p>
              <p>{email.projectTitle}</p>
              <p className="my-3 font-semibold">
                {email.splitGroupCombinedTotal || email.amountDue}
              </p>
              {email.sendSplitGroup && (
                <p className="mb-3">
                  {email.splitGroupCount} invoices will be sent together.
                </p>
              )}
              <InvoiceEmailSendPanel
                {...email}
                compact
                onSendingChange={setSending}
                onSent={() => {
                  setSent(true);
                  setOpen(false);
                }}
              />
              <div className="mt-4 flex gap-4">
                <button
                  autoFocus
                  disabled={sending}
                  onClick={() => {
                    if (!sending) setOpen(false);
                  }}
                >
                  Cancel
                </button>
                {!sending && <Link href={action.href}>Open Invoice</Link>}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
