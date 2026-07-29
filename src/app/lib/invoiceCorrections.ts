export type CorrectionInvoiceSummary = {
  id?: string | null;
  displayId?: string | null;
  amount?: string | number | null;
  status?: string | null;
  sentAt?: string | null;
};

export type CorrectionAuditInput = {
  original: CorrectionInvoiceSummary;
  replacement?: CorrectionInvoiceSummary | null;
  replacementGroup?: CorrectionInvoiceSummary[];
  replacementEstimateId?: string | null;
  replacementEstimateDisplayId?: string | null;
  reason: string;
  correctedByUserId?: string | null;
  correctedByEmail?: string | null;
  correctedAt?: string;
  intermediateSplitSourceId?: string | null;
  intermediateSplitSourceDisplayId?: string | null;
};

function compactLines(lines: (string | null | undefined)[]) {
  return lines
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
}

function moneyNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

export function displayDocumentList(displayIds: (string | null | undefined)[]) {
  const documents = displayIds.filter((id): id is string => Boolean(id?.trim()));

  if (documents.length <= 1) {
    return documents[0] ?? "replacement invoice";
  }

  if (documents.length === 2) {
    return `${documents[0]} and ${documents[1]}`;
  }

  return `${documents.slice(0, -1).join(", ")}, and ${
    documents[documents.length - 1]
  }`;
}

export function extractCorrectionOriginalDisplayId(
  notes: string | null | undefined
) {
  return (
    notes?.match(/\bcorrection\s+of\s+(INV-\d+)\b/i)?.[1]?.toUpperCase() ??
    notes?.match(/\breplaces?\s+(?:previously\s+issued\s+)?(?:invoice\s+)?(INV-\d+)\b/i)?.[1]?.toUpperCase() ??
    null
  );
}

export function extractReplacementDisplayIds(
  notes: string | null | undefined
) {
  const replacementLine = notes
    ?.split(/\r?\n/)
    .find((line) => /\b(replaced by|superseded by|replacement invoices?)\b/i.test(line));

  return Array.from(
    new Set(
      (replacementLine ?? "")
        .match(/\bINV-\d+\b/gi)
        ?.map((id) => id.toUpperCase()) ?? []
    )
  );
}

export function cleanGeneratedCorrectionNotes(
  notes: string | null | undefined
) {
  return compactLines(
    String(notes ?? "")
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();

        return (
          trimmed &&
          !/^Correction:/i.test(trimmed) &&
          !/^Correction of INV-\d+/i.test(trimmed) &&
          !/^Reason:/i.test(trimmed) &&
          !/^Review scope and pricing/i.test(trimmed) &&
          !/^Review and enter final/i.test(trimmed) &&
          !/^Original sent invoice remains preserved/i.test(trimmed) &&
          !/^Original invoice remains preserved/i.test(trimmed) &&
          !/^Created from INV-\d+ as Split/i.test(trimmed)
        );
      })
  ).join("\n");
}

export function buildOriginalCorrectionNote({
  existingNotes,
  replacementDisplayIds,
  reason,
}: {
  existingNotes?: string | null;
  replacementDisplayIds: string[];
  reason: string;
}) {
  const preserved = cleanGeneratedCorrectionNotes(existingNotes);

  return compactLines([
    preserved,
    `Correction: superseded by ${displayDocumentList(
      replacementDisplayIds
    )}. Reason: ${reason.trim()}`,
  ]).join("\n");
}

export function buildReplacementCorrectionNote({
  existingNotes,
  originalDisplayId,
  replacementDisplayIds,
}: {
  existingNotes?: string | null;
  originalDisplayId: string;
  replacementDisplayIds?: string[];
}) {
  const preserved = cleanGeneratedCorrectionNotes(existingNotes);
  const groupText =
    replacementDisplayIds && replacementDisplayIds.length > 1
      ? ` Part of replacement split group ${displayDocumentList(
          replacementDisplayIds
        )}.`
      : "";

  return compactLines([
    `Correction of ${originalDisplayId}.${groupText}`,
    preserved,
  ]).join("\n");
}

export function buildCorrectionEmailSubject({
  projectTitle,
  fallbackLabel,
}: {
  projectTitle?: string | null;
  fallbackLabel: string;
}) {
  const context = projectTitle?.trim() || fallbackLabel;

  return `Corrected invoices for ${context}`;
}

export function buildCorrectionEmailMessage({
  documentNumbers,
  projectTitle,
  originalDisplayId,
  combinedTotal,
}: {
  documentNumbers: string[];
  projectTitle?: string | null;
  originalDisplayId: string;
  combinedTotal?: string | null;
}) {
  return compactLines([
    `Attached are corrected invoices ${displayDocumentList(
      documentNumbers
    )}${projectTitle?.trim() ? ` for ${projectTitle.trim()}` : ""}.`,
    `These replace the previously issued invoice ${originalDisplayId}.`,
    "Both official invoice PDFs are attached.",
    combinedTotal ? `Combined total: ${combinedTotal}.` : null,
  ]).join(" ");
}

export function buildCorrectionAuditDetails({
  original,
  replacement,
  replacementGroup = [],
  replacementEstimateId,
  replacementEstimateDisplayId,
  reason,
  correctedByUserId,
  correctedByEmail,
  correctedAt = new Date().toISOString(),
  intermediateSplitSourceId,
  intermediateSplitSourceDisplayId,
}: CorrectionAuditInput) {
  const replacementInvoices =
    replacementGroup.length > 0
      ? replacementGroup
      : replacement
        ? [replacement]
        : [];
  const replacementDisplayIds = replacementInvoices
    .map((invoice) => invoice.displayId)
    .filter((id): id is string => Boolean(id));
  const replacementInvoiceIds = replacementInvoices
    .map((invoice) => invoice.id)
    .filter((id): id is string => Boolean(id));
  const replacementCombinedTotal = replacementInvoices.reduce(
    (sum, invoice) => sum + moneyNumber(invoice.amount),
    0
  );

  return {
    originalInvoiceId: original.id ?? null,
    originalDisplayId: original.displayId ?? null,
    originalAmount: moneyNumber(original.amount),
    originalStatus: original.status ?? null,
    originalSentAt: original.sentAt ?? null,
    replacementInvoiceId: replacement?.id ?? replacementInvoiceIds[0] ?? null,
    replacementDisplayId:
      replacement?.displayId ?? displayDocumentList(replacementDisplayIds),
    replacementInvoiceIds,
    replacementDisplayIds,
    replacementCombinedTotal,
    replacementEstimateId: replacementEstimateId ?? null,
    replacementEstimateDisplayId: replacementEstimateDisplayId ?? null,
    correctionReason: reason.trim(),
    correctedByUserId: correctedByUserId ?? null,
    correctedByEmail: correctedByEmail ?? null,
    correctedAt,
    nonCollectible: true,
    intermediateSplitSourceId: intermediateSplitSourceId ?? null,
    intermediateSplitSourceDisplayId: intermediateSplitSourceDisplayId ?? null,
  };
}
