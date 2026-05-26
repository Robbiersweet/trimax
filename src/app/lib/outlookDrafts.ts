type DocumentKind = "invoice" | "estimate";

type DraftInput = {
  businessSlug: string;
  customerName: string | null;
  documentNumber: string | null;
  projectTitle: string | null;
  amountDue: string;
  dueDate?: string | null;
  serviceAddress?: string | null;
  reference?: string | null;
};

export type OutlookDraftPreview = {
  templateKey: string;
  toLabel: string;
  subject: string;
  body: string;
};

function clean(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

function businessLabel(businessSlug: string) {
  return businessSlug === "just-kleen" ? "Just Kleen" : "R&L Creations";
}

function defaultBody(kind: DocumentKind, input: DraftInput) {
  const documentLabel = kind === "invoice" ? "invoice" : "estimate";
  const numberLabel = clean(input.documentNumber, documentLabel);
  const customer = clean(input.customerName, "there");
  const project = clean(input.projectTitle, "the work requested");
  const dueLine =
    kind === "invoice" && input.dueDate
      ? `\n\nAmount due: ${input.amountDue}\nDue date: ${input.dueDate}`
      : "";

  return `Hi ${customer},

Attached is ${numberLabel} for ${project}.${dueLine}

Please let me know if you have any questions.

Thank you,
${businessLabel(input.businessSlug)}`;
}

export function buildOutlookDraftPreview(
  kind: DocumentKind,
  input: DraftInput
): OutlookDraftPreview {
  const documentLabel = kind === "invoice" ? "Invoice" : "Estimate";
  const documentNumber = clean(input.documentNumber, documentLabel);
  const customer = clean(input.customerName, "Customer");
  const project = clean(input.projectTitle, documentLabel);
  const reference = clean(input.reference);
  const subjectParts = [
    documentLabel,
    documentNumber,
    customer,
    reference ? `Ref ${reference}` : "",
  ].filter(Boolean);

  return {
    templateKey:
      input.businessSlug === "just-kleen"
        ? `just_kleen_${kind}`
        : `rnl_${kind}`,
    toLabel: `${customer} email from client profile`,
    subject: subjectParts.join(" - "),
    body: defaultBody(kind, {
      ...input,
      projectTitle: project,
    }),
  };
}
