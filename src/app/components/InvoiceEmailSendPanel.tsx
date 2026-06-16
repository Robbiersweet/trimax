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
  clientCcEmail?: string | null;
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
  clientCcEmail,
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
  const visibleClientCc = clientCcEmail?.trim() ?? "";
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
    dueDate && dueDate !== "-"
      ? requestType === "reminder"
        ? `was due on ${dueDate}`
        : ` due on ${dueDate}`
      : requestType === "reminder"
        ? "is past due"
        : "";
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
  const quickMessages = useMemo(() => {
    const dueText =
      dueDate && dueDate !== "-"
        ? requestType === "reminder"
          ? `was due on ${dueDate}`
          : `is due on ${dueDate}`
        : requestType === "reminder"
          ? "is past due"
          : "";
    const friendlyProject = projectTitle?.trim()
      ? ` for ${projectTitle.trim()}`
      : "";

    if (requestType === "reminder") {
      return [
        {
          label: "Friendly",
          text: `Hi ${customerName}, this is a friendly reminder that ${documentNumber} for ${amountDue} ${dueText}. Please send payment when available, or reply if you have any questions.`,
        },
        {
          label: "Short",
          text: `Reminder: ${documentNumber} for ${amountDue} ${dueText}. Please send payment when available. Thank you.`,
        },
        {
          label: "Firm",
          text: `${documentNumber} for ${amountDue} ${dueText}. Please arrange payment or reply with a status update today. Thank you.`,
        },
      ];
    }

    if (requestType === "deposit") {
      return [
        {
          label: "Standard",
          text: `${businessName} sent you a deposit request for ${amountDue} on ${documentNumber}${friendlyProject}${
            dueText ? `. The invoice ${dueText}` : ""
          }.`,
        },
        {
          label: "Simple",
          text: `Please use ${documentNumber} to submit the requested ${amountDue} deposit${friendlyProject}.`,
        },
        {
          label: "Detailed",
          text: `${businessName} is requesting a ${amountDue} deposit on ${documentNumber}${friendlyProject}${
            dueText ? `. The invoice ${dueText}` : ""
          }. Reply with any questions before sending payment.`,
        },
      ];
    }

    if (requestType === "estimate") {
      return [
        {
          label: "Standard",
          text: `${businessName} sent you estimate ${documentNumber} for ${amountDue}${friendlyProject}.`,
        },
        {
          label: "Review",
          text: `Please review estimate ${documentNumber} for ${amountDue}${friendlyProject}. Reply with approval or any questions.`,
        },
        {
          label: "Brief",
          text: `Estimate ${documentNumber} for ${amountDue} is ready for your review.`,
        },
      ];
    }

    return [
      {
        label: "Standard",
        text: `${businessName} sent you invoice ${documentNumber} for ${amountDue}${
          dueText ? `, which ${dueText}` : ""
        }.`,
      },
      {
        label: "Brief",
        text: `Invoice ${documentNumber} for ${amountDue}${
          dueText ? ` ${dueText}` : ""
        }. Thank you.`,
      },
      {
        label: "Warm",
        text: `Hi ${customerName}, ${businessName} sent invoice ${documentNumber} for ${amountDue}${friendlyProject}${
          dueText ? `. It ${dueText}` : ""
        }. Thank you for your business.`,
      },
    ];
  }, [
    amountDue,
    businessName,
    customerName,
    documentNumber,
    dueDate,
    projectTitle,
    requestType,
  ]);
  const deliveryBrief = [
    {
      label: "Customer",
      value: customerName || "Customer",
    },
    {
      label: "Document",
      value: `${documentLabel} ${documentNumber}`,
    },
    {
      label: requestType === "reminder" ? "Past-due amount" : "Amount",
      value: amountDue,
    },
    {
      label: requestType === "reminder" ? "Due status" : "Due date",
      value:
        dueDate && dueDate !== "-"
          ? requestType === "reminder"
            ? `Due ${dueDate}`
            : dueDate
          : "Not set",
    },
  ];
  const sendReadiness = [
    {
      label: "Recipient",
      detail: recipient.trim().includes("@")
        ? recipient.trim()
        : "Add a customer email",
      status: recipient.trim().includes("@") ? "ready" : "attention",
    },
    {
      label: "CC",
      detail: visibleClientCc || "No client CC saved",
      status: visibleClientCc.includes("@") ? "ready" : "waiting",
    },
    {
      label: "Template",
      detail: templateLoaded ? "Saved settings loaded" : "Loading settings",
      status: templateLoaded ? "ready" : "waiting",
    },
    {
      label: "Preview",
      detail: message.trim() ? "Customer message ready" : "Message is empty",
      status: message.trim() ? "ready" : "attention",
    },
    {
      label: "PDF note",
      detail: includePdfNote ? "Mentioned in email" : "Not mentioned",
      status: includePdfNote ? "ready" : "waiting",
    },
  ];

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
    <Card
      id={
        requestType === "estimate"
          ? "send-estimate"
          : requestType === "reminder"
            ? "late-payment-reminder"
            : "send-document"
      }
      className="invoice-email-panel scroll-mt-6 overflow-hidden border-sky-200 bg-white p-0"
    >
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
        <div className="invoice-delivery-brief mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {deliveryBrief.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                {item.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="invoice-email-readiness grid gap-2 sm:grid-cols-2">
            {sendReadiness.map((item) => (
              <div
                key={item.label}
                data-status={item.status}
                className="invoice-email-ready-card rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </p>

                  <span className="invoice-email-ready-dot h-2.5 w-2.5 rounded-full" />
                </div>

                <p className="mt-2 truncate text-sm font-semibold text-slate-950">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>

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

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  CC
                </p>
                <p className="mt-1 overflow-wrap-anywhere text-base font-semibold text-slate-950">
                  {visibleClientCc || "No assistant manager CC saved"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  visibleClientCc.includes("@")
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {visibleClientCc.includes("@") ? "Will copy" : "Optional"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Set this on the client profile. Customers can see CC recipients.
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="text-sm font-semibold text-slate-600">
                Message
              </label>
              <div className="invoice-email-tone-row flex flex-wrap gap-2">
                {quickMessages.map((quickMessage) => (
                  <button
                    key={quickMessage.label}
                    type="button"
                    onClick={() => setMessage(quickMessage.text)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                  >
                    {quickMessage.label}
                  </button>
                ))}
              </div>
            </div>
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

          {!recipient.trim().includes("@") ? (
            <div className="invoice-email-warning rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Add the customer email here or save one on the client profile so
              future invoices come prefilled.
            </div>
          ) : null}
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
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-slate-700">
            {canSend
              ? `${documentLabel} is ready to send`
              : `Finish the ${documentLabelLower} email setup`}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Direct sending uses a verified email provider so messages do not
            look like random mail.
            {templateLoaded
              ? " This preview is using your saved email settings."
              : " Loading saved email settings..."}
          </p>
        </div>

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
