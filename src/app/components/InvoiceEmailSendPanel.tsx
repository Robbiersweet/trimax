"use client";

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
  sendSplitGroup?: boolean;
  splitGroupCount?: number;
  splitGroupLabel?: string;
  splitGroupItems?: {
    documentNumber: string;
    amountLabel: string;
    splitLabel?: string | null;
  }[];
  splitGroupCombinedTotal?: string;
};

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

  return `Invoice ${documentNumber} from ${businessName}`;
}

function documentContext({
  customerName,
  projectTitle,
}: {
  customerName?: string | null;
  projectTitle?: string | null;
}) {
  return projectTitle?.trim() || customerName?.trim() || "this work";
}

function documentListLabel(documents: string[]) {
  if (documents.length <= 1) {
    return documents[0] ?? "the attached invoice";
  }

  if (documents.length === 2) {
    return `${documents[0]} and ${documents[1]}`;
  }

  return `${documents.slice(0, -1).join(", ")}, and ${
    documents[documents.length - 1]
  }`;
}

function defaultMessage({
  businessName,
  documentNumber,
  amountDue,
  dueDate,
  requestType,
  customerName,
  projectTitle,
}: {
  businessName: string;
  documentNumber: string;
  amountDue: string;
  dueDate: string;
  requestType: "invoice" | "deposit" | "estimate" | "reminder";
  customerName?: string | null;
  projectTitle?: string | null;
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

  return `Attached is invoice ${documentNumber} for ${documentContext({
    customerName,
    projectTitle,
  })}.`;
}

function defaultSplitGroupSubject(splitGroupLabel: string) {
  return `${splitGroupLabel} - Split invoices`;
}

function defaultSplitGroupMessage({
  projectTitle,
  splitGroupItems,
  splitGroupCombinedTotal,
}: {
  projectTitle?: string | null;
  splitGroupItems?: {
    documentNumber: string;
    amountLabel: string;
    splitLabel?: string | null;
  }[];
  splitGroupCombinedTotal?: string;
}) {
  const projectText = projectTitle?.trim()
    ? ` for ${projectTitle.trim()}`
    : "";
  const documentNumbers =
    splitGroupItems?.map((item) => item.documentNumber).filter(Boolean) ?? [];
  const invoiceLines =
    splitGroupItems && splitGroupItems.length > 0
      ? [
          "",
          "Attached invoices:",
          ...splitGroupItems.map(
            (item) =>
              `- ${item.documentNumber} - ${item.amountLabel}${
                item.splitLabel ? ` (${item.splitLabel})` : ""
              }`
          ),
          splitGroupCombinedTotal
            ? `Combined total: ${splitGroupCombinedTotal}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  return `Attached are invoices ${documentListLabel(documentNumbers)}${projectText}.

This invoice was split because of the billing limit. Both official invoice PDFs are attached to this email.${invoiceLines}`;
}

function normalizeInvoiceBodyCopy(message: string, fallback: string) {
  return /\bsent\s+(you\s+)?invoice\b/i.test(message) ? fallback : message;
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
  sendSplitGroup = false,
  splitGroupCount = 0,
  splitGroupLabel,
  splitGroupItems = [],
  splitGroupCombinedTotal,
}: InvoiceEmailSendPanelProps) {
  const effectiveSplitGroupLabel =
    splitGroupLabel?.trim() ||
    (projectTitle?.trim() ? `Invoice ${projectTitle.trim()}` : documentNumber);
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
    sendSplitGroup && splitGroupCount > 1 && requestType === "invoice"
      ? defaultSplitGroupSubject(effectiveSplitGroupLabel)
      : defaultSubject(businessName, documentNumber, requestType)
  );
  const [message, setMessage] = useState(
    sendSplitGroup && splitGroupCount > 1 && requestType === "invoice"
      ? defaultSplitGroupMessage({
          projectTitle,
          splitGroupItems,
          splitGroupCombinedTotal,
        })
      : defaultMessage({
          businessName,
          documentNumber,
          amountDue,
          dueDate,
          requestType,
          customerName,
          projectTitle,
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
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
    technicalDetails?: string;
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
      projectTitle: documentContext({ customerName, projectTitle }),
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

    if (sendSplitGroup && splitGroupCount > 1 && requestType === "invoice") {
      return [
        {
          label: "Standard",
          text: defaultSplitGroupMessage({
            projectTitle,
            splitGroupItems,
            splitGroupCombinedTotal,
          }),
        },
        {
          label: "Brief",
          text: `Attached are invoices ${documentListLabel(
            splitGroupItems.map((item) => item.documentNumber)
          )}${friendlyProject}. Each invoice PDF is attached to this one email.`,
        },
        {
          label: "Clear",
          text: `Please review the attached split invoice PDFs${friendlyProject}. They are being sent together in one email for easier review.`,
        },
      ];
    }

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
        text: `Attached is invoice ${documentNumber} for ${documentContext({
          customerName,
          projectTitle,
        })}.${dueText ? ` It ${dueText}.` : ""}`,
      },
      {
        label: "Brief",
        text: `Invoice ${documentNumber} for ${amountDue}${
          dueText ? ` ${dueText}` : ""
        }. Thank you.`,
      },
      {
        label: "Warm",
        text: `Hi ${customerName}, attached is invoice ${documentNumber}${friendlyProject}.${dueText ? ` It ${dueText}.` : ""} Thank you for your business.`,
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
    sendSplitGroup,
    splitGroupCombinedTotal,
    splitGroupCount,
    splitGroupItems,
  ]);
  const deliveryBrief = [
    {
      label: "Customer",
      value: customerName || "Customer",
    },
    {
      label: "Document",
      value:
        sendSplitGroup && splitGroupCount > 1
          ? `${splitGroupCount} attached invoices`
          : `${documentLabel} ${documentNumber}`,
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
      label: "PDF attachment",
      detail:
        sendSplitGroup && splitGroupCount > 1
          ? `${splitGroupCount} official PDFs attach automatically`
          : "Official document attaches automatically",
      status: "ready",
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
        sendSplitGroup && splitGroupCount > 1 && requestType === "invoice"
          ? defaultSplitGroupSubject(effectiveSplitGroupLabel)
          : requestType === "deposit"
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
        sendSplitGroup && splitGroupCount > 1 && requestType === "invoice"
          ? defaultSplitGroupMessage({
              projectTitle,
              splitGroupItems,
              splitGroupCombinedTotal,
            })
          : requestType === "deposit"
          ? defaultMessage({
              businessName,
              documentNumber,
              amountDue,
              dueDate,
              requestType,
              customerName,
              projectTitle,
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
                customerName,
                projectTitle,
              })
          : normalizeInvoiceBodyCopy(
              renderEmailTemplate(settings.invoiceBodyTemplate, templateVariables),
              defaultMessage({
                businessName,
                documentNumber,
                amountDue,
                dueDate,
                requestType,
                customerName,
                projectTitle,
              })
            )
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
    customerName,
    documentNumber,
    dueDate,
    projectTitle,
    requestType,
    sendSplitGroup,
    effectiveSplitGroupLabel,
    splitGroupCombinedTotal,
    splitGroupCount,
    splitGroupItems,
    templateVariables,
  ]);

  async function handleSend(sendAsSplitGroup = sendSplitGroup) {
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
          attachOfficialPdf: true,
          sendSplitGroup: sendAsSplitGroup,
          emailPurpose: requestType === "reminder" ? "reminder" : "send",
        }),
        }
      );

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        failedCount?: number;
        failures?: Array<{ documentNumber?: string; error?: string }>;
        statusUpdateError?: string | null;
        pipelineStage?: string;
        pipelineStageLabel?: string;
        traceId?: string;
      };

      if (!response.ok) {
        const traceText = result.traceId ? ` Trace ID: ${result.traceId}.` : "";
        const supportTraceText = result.traceId
          ? ` with Trace ID: ${result.traceId}.`
          : ".";
        const fallbackError =
          result.error ??
          `Trimax could not send this ${documentLabelLower} email yet.`;
        const isPdfFailure = result.pipelineStage === "pdf_generation";
        const friendlyMessage = isPdfFailure
          ? `Invoice PDF could not be created, so no email was sent. Please try again. If the problem continues, provide support${supportTraceText}`
          : `${fallbackError}${traceText}`;
        const technicalDetails = [
          result.pipelineStageLabel ? `Stage: ${result.pipelineStageLabel}` : "",
          result.traceId ? `Trace ID: ${result.traceId}` : "",
          fallbackError ? `Error: ${fallbackError}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        setToast({
          type: "error",
          message: friendlyMessage,
          technicalDetails: technicalDetails || undefined,
        });
        return;
      }

      const hasSendWarning =
        Boolean(result.statusUpdateError) ||
        Boolean(result.failedCount && result.failedCount > 0);

      setToast({
        type: hasSendWarning ? "error" : "success",
        message: hasSendWarning
          ? result.message ??
            `Trimax sent this ${documentLabelLower}, but one follow-up step needs review.`
          : sendSplitGroup && splitGroupCount > 1 && requestType === "invoice"
            ? "Split invoices sent. Next step: mark the work complete if the job is finished."
            : requestType === "invoice"
              ? `Invoice ${documentNumber} sent. Next step: mark the work complete if the job is finished.`
              : result.message ?? `${documentLabel} email sent.`,
      });
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? `Browser request failed before Trimax could reach the send server: ${error.message}`
            : "Browser request failed before Trimax could reach the send server.",
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
            : "send-invoice"
      }
      className="invoice-email-panel scroll-mt-6 overflow-hidden border-sky-200 bg-white p-0"
    >
      {toast ? (
        <Toast
          type={toast.type}
          message={toast.message}
          technicalDetails={toast.technicalDetails}
        />
      ) : null}

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
            : sendSplitGroup && splitGroupCount > 1
              ? "Send Split Group"
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

          <div className="invoice-email-cc-card rounded-2xl border border-slate-200 bg-slate-50 p-4">
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

          <div className="invoice-email-option rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
            {sendSplitGroup && splitGroupCount > 1
              ? `${splitGroupCount} official customer invoice PDFs are generated fresh and attached to one email when you send.`
              : `The official customer ${documentLabelLower} PDF is generated fresh and attached automatically when you send.`}
          </div>

          {sendSplitGroup && splitGroupCount > 1 ? (
            <div className="invoice-split-attachment-list rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="font-black text-slate-950">Included invoices</p>
              <div className="mt-3 space-y-2">
                {splitGroupItems.map((item) => (
                  <div
                    key={item.documentNumber}
                    className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                  >
                    <span>
                      {item.documentNumber}
                      {item.splitLabel ? ` (${item.splitLabel})` : ""}
                    </span>
                    <span className="font-bold text-slate-950">
                      {item.amountLabel}
                    </span>
                  </div>
                ))}
              </div>
              {splitGroupCombinedTotal ? (
                <p className="mt-3 border-t border-slate-200 pt-3 font-black text-slate-950">
                  Combined total: {splitGroupCombinedTotal}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="invoice-pdf-attachment-card rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              PDF Attachment
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {sendSplitGroup && splitGroupCount > 1
                ? `All split invoice PDFs attach to this one customer email.`
                : `The attached PDF uses the official full-page customer ${documentLabelLower} layout.`}
            </p>
            <a
              href={printHref}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-slate-800"
            >
              Preview Official PDF
            </a>
          </div>

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
              Email Preview
            </p>
          </div>

          <div className="px-4 py-5 text-slate-700 sm:px-5 sm:py-6">
            <p className="whitespace-pre-line text-base leading-7 sm:text-lg sm:leading-8">
              {message}
            </p>

            {signature.trim() ? (
              <p className="mt-6 whitespace-pre-line text-sm leading-6 text-slate-600">
                {signature}
              </p>
            ) : null}

            <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              This preview is the email message only. The customer PDF is attached separately.
            </p>
          </div>
        </div>
      </div>

      <div className="invoice-email-footer flex flex-col gap-4 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-slate-700">
            {canSend
              ? sendSplitGroup && splitGroupCount > 1
                ? `Split invoice group is ready to send`
                : `${documentLabel} is ready to send`
              : `Finish the ${documentLabelLower} email setup`}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Direct sending uses a verified email provider so messages do not
            look like random mail.
            {templateLoaded
              ? " The PDF attachment uses the official customer document."
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
            onClick={() => handleSend(sendSplitGroup)}
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
                : sendSplitGroup && splitGroupCount > 1
                  ? "Send Split Group"
                  : "Send Invoice"}
          </button>
          {sendSplitGroup && splitGroupCount > 1 ? (
            <button
              type="button"
              onClick={() => handleSend(false)}
              disabled={!canSend || sending}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
            >
              Send This Invoice Only
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
