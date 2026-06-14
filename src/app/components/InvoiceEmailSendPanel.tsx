"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Button from "./Button";
import Card from "./Card";
import Toast from "./Toast";
import {
  defaultInvoiceEmailSettings,
  emailSettingsKey,
  normalizeInvoiceEmailSettings,
  renderEmailTemplate,
} from "../lib/invoiceEmailSettings";
import { supabase } from "../lib/supabase";

type InvoiceEmailSendPanelProps = {
  documentId: string;
  documentKind?: "invoice" | "estimate";
  businessSlug: string;
  businessName: string;
  customerName: string;
  recipientEmail: string | null;
  documentNumber: string;
  amountDue: string;
  dueDate: string;
  projectTitle?: string | null;
  printHref: string;
  requestType?: "invoice" | "deposit" | "estimate" | "reminder";
};

function businessLogoSrc(businessSlug: string) {
  return businessSlug === "just-kleen"
    ? "/Brand/rnl-multi-colors.png"
    : "/Brand/rnl-multi-colors.png";
}

function defaultSubject(
  businessName: string,
  documentNumber: string,
  requestType: "invoice" | "deposit" | "estimate" | "reminder"
) {
  if (requestType === "reminder") {
    return `Payment reminder for invoice ${documentNumber}`;
  }

  if (requestType === "deposit") {
    return `${businessName} sent you a deposit request for ${documentNumber}`;
  }

  if (requestType === "estimate") {
    return `${businessName} sent you estimate ${documentNumber}`;
  }

  return `${businessName} sent you invoice ${documentNumber}`;
}

function defaultMessage({
  businessName,
  documentNumber,
  amountDue,
  dueDate,
  requestType,
}: {
  businessName: string;
  documentNumber: string;
  amountDue: string;
  dueDate: string;
  requestType: "invoice" | "deposit" | "estimate" | "reminder";
}) {
  if (requestType === "reminder") {
    return `This is a friendly reminder that invoice ${documentNumber} for ${amountDue}${
      dueDate && dueDate !== "-" ? ` was due on ${dueDate}` : " is past due"
    }. Please send payment when available, or reply if you have any questions.`;
  }

  if (requestType === "deposit") {
    return `${businessName} sent you a deposit request for ${amountDue} on invoice ${documentNumber}${
      dueDate && dueDate !== "-" ? `. The invoice due date is ${dueDate}` : ""
    }.`;
  }

  if (requestType === "estimate") {
    return `${businessName} sent you estimate ${documentNumber} for ${amountDue}.`;
  }

  return `${businessName} sent you invoice ${documentNumber} for ${amountDue}${
    dueDate && dueDate !== "-" ? ` that's due on ${dueDate}` : ""
  }.`;
}

export default function InvoiceEmailSendPanel({
  documentId,
  documentKind = "invoice",
  businessSlug,
  businessName,
  customerName,
  recipientEmail,
  documentNumber,
  amountDue,
  dueDate,
  projectTitle,
  printHref,
  requestType = "invoice",
}: InvoiceEmailSendPanelProps) {
  const documentLabel =
    requestType === "deposit"
      ? "Deposit request"
      : requestType === "reminder"
        ? "Payment reminder"
      : requestType === "estimate"
        ? "Estimate"
        : "Invoice";
  const documentLabelLower = documentLabel.toLowerCase();
  const [recipient, setRecipient] = useState(recipientEmail ?? "");
  const [subject, setSubject] = useState(
    defaultSubject(businessName, documentNumber, requestType)
  );
  const [message, setMessage] = useState(
    defaultMessage({
      businessName,
      documentNumber,
      amountDue,
      dueDate,
      requestType,
    })
  );
  const [signature, setSignature] = useState(
    defaultInvoiceEmailSettings({
      businessSlug,
      businessName,
    }).signature
  );
  const [replyToEmail, setReplyToEmail] = useState("");
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [includePdfNote, setIncludePdfNote] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const canSend = recipient.trim().includes("@") && subject.trim();
  const dueDateSentence =
    dueDate && dueDate !== "-" ? ` due on ${dueDate}` : "";
  const templateVariables = useMemo(
    () => ({
      businessName,
      invoiceNumber: documentNumber,
      amountDue,
      dueDate,
      dueDateSentence,
      customerName,
      projectTitle: projectTitle ?? "",
    }),
    [
      amountDue,
      businessName,
      customerName,
      documentNumber,
      dueDate,
      dueDateSentence,
      projectTitle,
    ]
  );

  const emailBody = useMemo(() => {
    return [message.trim(), "", signature.trim()]
      .filter(Boolean)
      .join("\n");
  }, [message, signature]);

  useEffect(() => {
    let isActive = true;

    async function loadEmailSettings() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const fallback = defaultInvoiceEmailSettings({
        businessSlug,
        businessName,
        currentEmail: user?.email ?? null,
      });
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", emailSettingsKey(businessSlug))
        .maybeSingle<{ value: unknown }>();

      if (!isActive) {
        return;
      }

      if (error) {
        console.warn("Invoice email settings are not ready yet.", error);
      }

      const settings = normalizeInvoiceEmailSettings(data?.value, fallback);

      setSubject(
        requestType === "deposit"
          ? defaultSubject(businessName, documentNumber, requestType)
          : requestType === "reminder"
            ? renderEmailTemplate(
                settings.paymentReminderSubjectTemplate,
                templateVariables
              )
          : requestType === "estimate"
            ? defaultSubject(businessName, documentNumber, requestType)
          : renderEmailTemplate(
              settings.invoiceSubjectTemplate,
              templateVariables
            )
      );
      setMessage(
        requestType === "deposit"
          ? defaultMessage({
              businessName,
              documentNumber,
              amountDue,
              dueDate,
              requestType,
            })
          : requestType === "reminder"
            ? renderEmailTemplate(
                settings.paymentReminderBodyTemplate,
                templateVariables
              )
          : requestType === "estimate"
            ? defaultMessage({
                businessName,
                documentNumber,
                amountDue,
                dueDate,
                requestType,
              })
          : renderEmailTemplate(settings.invoiceBodyTemplate, templateVariables)
      );
      setSignature(settings.signature);
      setReplyToEmail(settings.replyToEmail);
      setTemplateLoaded(true);
    }

    void loadEmailSettings();

    return () => {
      isActive = false;
    };
  }, [
    amountDue,
    businessName,
    businessSlug,
    documentNumber,
    dueDate,
    requestType,
    templateVariables,
  ]);

  async function handleSend() {
    setToast(null);

    if (!canSend) {
      setToast({
        type: "error",
        message: "Add a recipient email and subject first.",
      });
      return;
    }

    setSending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(
        `/api/${documentKind === "estimate" ? "estimates" : "invoices"}/${documentId}/send-email`,
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
          recipientEmail: recipient.trim(),
          subject: subject.trim(),
          message: emailBody,
          replyToEmail,
          includePdfNote,
          emailPurpose: requestType === "reminder" ? "reminder" : "send",
        }),
        }
      );

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setToast({
          type: "error",
          message:
            result.error ??
            `Trimax could not send this ${documentLabelLower} email yet.`,
        });
        return;
      }

      setToast({
        type: "success",
        message: result.message ?? `${documentLabel} email sent.`,
      });
    } catch {
      setToast({
        type: "error",
        message:
          "Trimax could not reach the email sender. Please try again.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="invoice-email-panel overflow-hidden border-sky-200 bg-white p-0">
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

      <div className="invoice-email-header border-b border-slate-200 bg-slate-100 px-5 py-4">
        <p className="text-sm font-semibold text-slate-600">
          Send by Email
        </p>
        <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">
          {requestType === "deposit"
            ? `Send Deposit Request`
            : requestType === "reminder"
              ? `Send Payment Reminder`
            : requestType === "estimate"
              ? `Send ${documentNumber}`
            : `Send ${documentNumber}`}
        </h2>
      </div>

      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-600">
              To
            </label>
            <input
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="customer@example.com"
              className="invoice-email-input mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
            <p className="mt-2 text-xs text-slate-500">
              Pulled from the client profile when an email is saved there.
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">
              Subject
            </label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="invoice-email-input mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">
              Message
            </label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              className="invoice-email-input mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            />
          </div>

          <label className="invoice-email-option flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <input
              type="checkbox"
              checked={includePdfNote}
              onChange={(event) => setIncludePdfNote(event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              Mention that a PDF copy is attached. Actual automatic PDF
              attachment needs the next PDF-rendering step.
            </span>
          </label>
        </div>

        <div className="invoice-customer-preview overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <p className="text-sm font-semibold text-slate-500">
              Customer Preview
            </p>
          </div>

          <div className="px-4 py-5 text-slate-700 sm:px-5 sm:py-6">
            <div className="flex justify-center border-b border-slate-200 pb-5">
              <Image
                src={businessLogoSrc(businessSlug)}
                alt={businessName}
                width={80}
                height={80}
                className="h-16 w-16 rounded-xl object-contain sm:h-20 sm:w-20"
              />
            </div>

            <p className="mt-6 whitespace-pre-line text-base leading-7 sm:text-lg sm:leading-8">
              {message}
            </p>

            {signature.trim() ? (
              <p className="mt-6 whitespace-pre-line text-sm leading-6 text-slate-600">
                {signature}
              </p>
            ) : null}

            <div className="mt-7">
              <p className="break-words font-semibold text-slate-950">
                {customerName}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {documentLabel} {documentNumber} - {amountDue}
              </p>
            </div>

            <div className="mt-7 flex justify-center">
              <a
                href={printHref}
                className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-center text-sm font-black text-white sm:w-auto"
              >
                Internal {requestType === "estimate" ? "Estimate" : "Invoice"} Preview
              </a>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-100 px-5 py-4 text-center text-sm font-semibold text-slate-400">
            Powered by Trimax
          </div>
        </div>
      </div>

      <div className="invoice-email-footer flex flex-col gap-4 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="max-w-2xl text-sm leading-6 text-slate-500">
          Direct sending uses a verified email provider so messages do not look
          like random mail.
          {templateLoaded
            ? " This preview is using your saved email settings."
            : " Loading saved email settings..."}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href={printHref} className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full sm:w-auto">
              Preview {requestType === "estimate" ? "Estimate" : "Invoice"}
            </Button>
          </a>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend || sending}
            className="inline-flex w-full items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-600 px-5 py-3 text-center font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none sm:w-auto"
          >
            {sending
              ? "Sending..."
              : requestType === "deposit"
                ? "Send Deposit Request"
                : requestType === "reminder"
                  ? "Send Reminder"
                : requestType === "estimate"
                  ? "Send Estimate"
                : "Send Invoice"}
          </button>
        </div>
      </div>
    </Card>
  );
}
