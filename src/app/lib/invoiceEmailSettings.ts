export type InvoiceEmailSettings = {
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  bccEmail: string;
  signature: string;
  invoiceSubjectTemplate: string;
  invoiceBodyTemplate: string;
  paymentReminderSubjectTemplate: string;
  paymentReminderBodyTemplate: string;
};

type DefaultSettingsInput = {
  businessSlug: string;
  businessName: string;
  currentEmail?: string | null;
};

export function emailSettingsKey(businessSlug: string) {
  return `email_settings:${businessSlug}`;
}

export function defaultInvoiceEmailSettings({
  businessSlug,
  businessName,
  currentEmail,
}: DefaultSettingsInput): InvoiceEmailSettings {
  const signature =
    businessSlug === "just-kleen"
      ? [
          "Lyubov Sweet",
          "Just Kleen",
          "1011 90th St. SW #B",
          "Everett, WA 98204",
          "425-350-4898",
        ].join("\n")
      : [
          "Robbie Sweet",
          "Owner",
          "R&L Creations",
          "1011 90th St. SW #B",
          "Everett, WA 98204",
          "425-350-4898",
        ].join("\n");

  return {
    senderName: businessName,
    senderEmail: "",
    replyToEmail: currentEmail ?? "",
    bccEmail: "",
    signature,
    invoiceSubjectTemplate: `${businessName} sent you invoice {invoiceNumber}`,
    invoiceBodyTemplate:
      "{businessName} sent you invoice {invoiceNumber} for {amountDue}{dueDateSentence}.",
    paymentReminderSubjectTemplate:
      "Reminder: Invoice {invoiceNumber} from {businessName} is past due",
    paymentReminderBodyTemplate:
      "Your payment of {amountDue} for invoice {invoiceNumber} from {businessName} {dueDateSentence}.",
  };
}

export function normalizeInvoiceEmailSettings(
  value: unknown,
  fallback: InvoiceEmailSettings
): InvoiceEmailSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as Partial<Record<keyof InvoiceEmailSettings, unknown>>;

  return {
    senderName:
      typeof candidate.senderName === "string"
        ? candidate.senderName
        : fallback.senderName,
    senderEmail:
      typeof candidate.senderEmail === "string"
        ? candidate.senderEmail
        : fallback.senderEmail,
    replyToEmail:
      typeof candidate.replyToEmail === "string"
        ? candidate.replyToEmail
        : fallback.replyToEmail,
    bccEmail:
      typeof candidate.bccEmail === "string"
        ? candidate.bccEmail
        : fallback.bccEmail,
    signature:
      typeof candidate.signature === "string"
        ? candidate.signature
        : fallback.signature,
    invoiceSubjectTemplate:
      typeof candidate.invoiceSubjectTemplate === "string"
        ? candidate.invoiceSubjectTemplate
        : fallback.invoiceSubjectTemplate,
    invoiceBodyTemplate:
      typeof candidate.invoiceBodyTemplate === "string"
        ? candidate.invoiceBodyTemplate
        : fallback.invoiceBodyTemplate,
    paymentReminderSubjectTemplate:
      typeof candidate.paymentReminderSubjectTemplate === "string"
        ? candidate.paymentReminderSubjectTemplate
        : fallback.paymentReminderSubjectTemplate,
    paymentReminderBodyTemplate:
      typeof candidate.paymentReminderBodyTemplate === "string"
        ? candidate.paymentReminderBodyTemplate
        : fallback.paymentReminderBodyTemplate,
  };
}

export function formatSenderAddress({
  senderName,
  senderEmail,
}: {
  senderName: string;
  senderEmail: string;
}) {
  const email = senderEmail.trim().toLowerCase();
  const name = senderName.trim();

  if (!name) {
    return email;
  }

  return `${name.replace(/[<>"]/g, "")} <${email}>`;
}

export function renderEmailTemplate(
  template: string,
  variables: Record<string, string>
) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}
