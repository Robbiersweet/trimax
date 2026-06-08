type InvoiceDateLineItem = {
  description: string;
};

function localDateFromInput(value?: string | null) {
  if (!value) {
    return new Date();
  }

  const trimmedValue = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)
    ? new Date(`${trimmedValue}T00:00:00`)
    : new Date(trimmedValue);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function compactText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getDueDaysFromText(value: string) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue.includes("due upon receipt") ||
    normalizedValue.includes("upon receipt")
  ) {
    return 0;
  }

  const netMatch = normalizedValue.match(/\bnet\s*(\d{1,3})\b/);
  if (netMatch?.[1]) {
    return Number(netMatch[1]);
  }

  const dueInMatch = normalizedValue.match(
    /\bdue\s+in\s+(\d{1,3})\s+days?\b/
  );
  if (dueInMatch?.[1]) {
    return Number(dueInMatch[1]);
  }

  return null;
}

export function looksLikeApartmentBilling({
  customerName,
  projectTitle,
  serviceAddress,
  reference,
  lineItems,
}: {
  customerName: string;
  projectTitle: string;
  serviceAddress: string;
  reference: string;
  lineItems: InvoiceDateLineItem[];
}) {
  const compactCustomer = compactText(customerName);
  const combinedText = normalizeText(
    [
      customerName,
      projectTitle,
      serviceAddress,
      reference,
      ...lineItems.map((item) => item.description),
    ]
      .filter(Boolean)
      .join(" ")
  );

  return (
    compactCustomer.includes("northcreek") ||
    compactCustomer.includes("evergreen") ||
    compactCustomer.includes("apartment") ||
    combinedText.includes("apartments") ||
    combinedText.includes("apartment") ||
    combinedText.includes(" apt ")
  );
}

export function getSmartInvoiceDates({
  customerName,
  projectTitle,
  serviceAddress,
  reference,
  notes,
  terms,
  lineItems,
  issueDate,
}: {
  customerName: string;
  projectTitle: string;
  serviceAddress: string;
  reference: string;
  notes: string;
  terms: string;
  lineItems: InvoiceDateLineItem[];
  issueDate?: string | null;
}) {
  const issue = localDateFromInput(issueDate);
  const noteDueDays = getDueDaysFromText(`${terms}\n${notes}`);
  const apartmentBilling = looksLikeApartmentBilling({
    customerName,
    projectTitle,
    serviceAddress,
    reference,
    lineItems,
  });
  const dueDays =
    noteDueDays ?? (apartmentBilling ? 30 : 0);

  return {
    issueDate: toDateInputValue(issue),
    dueDate: toDateInputValue(addDays(issue, dueDays)),
    dueDays,
    reason:
      noteDueDays !== null
        ? "terms"
        : apartmentBilling
          ? "apartment"
          : "upon_receipt",
  };
}
