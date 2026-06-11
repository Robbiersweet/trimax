export type InvoiceEmailSettings = {
  replyToEmail: string;
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
    replyToEmail: currentEmail ?? "",
    signature,
    invoiceSubjectTemplate: `${businessName} sent you invoice {invoiceNumber}`,
    invoiceBodyTemplate:
      "{businessName} sent you invoice {invoiceNumber} for {amountDue}{dueDateSentence}.",
    paymentReminderSubjectTemplate:
      "Reminder: Invoice {invoiceNumber} from {businessName} is due",
    paymentReminderBodyTemplate:
      "Your payment of {amountDue} for invoice {invoiceNumber} from {businessName} is {dueDateSentence}.",
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
    replyToEmail:
      typeof candidate.replyToEmail === "string"
        ? candidate.replyToEmail
        : fallback.replyToEmail,
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

export function renderEmailTemplate(
  template: string,
  variables: Record<string, string>
) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}
