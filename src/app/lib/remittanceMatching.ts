export type RemittanceInvoiceRecord = {
  id: string;
  displayId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: number;
  amountPaid: number;
  collectionAmountDue?: number;
  status: string;
};

export type RemittanceLine = {
  text: string;
  amount: number;
  invoiceNumbers: string[];
  unitCodes: string[];
  serviceDescription: string;
};

export type ParsedCheckStub = {
  rawText: string;
  payor: string;
  checkNumber: string;
  checkDate: string;
  totalAmount: number;
  lines: RemittanceLine[];
  stubText: string;
};

export function parseMoney(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

export function customerMatchesPayor(customerName: string, payor: string) {
  const normalizedPayor = payor.trim().toLowerCase();

  if (!normalizedPayor) {
    return true;
  }

  const normalizedCustomer = customerName.toLowerCase();

  return (
    normalizedCustomer.includes(normalizedPayor) ||
    normalizedPayor.includes(normalizedCustomer)
  );
}

export function extractMoneyValues(text: string) {
  const matches =
    text.match(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+\.\d{2}\b/g) ??
    [];

  return matches
    .map((match) => parseMoney(match))
    .filter((value) => value > 0);
}

export function extractUnitCodes(text: string) {
  return Array.from(new Set(text.match(/\b[A-Z]\d{2}[A-Z]?\b/gi) ?? [])).map(
    (code) => code.toUpperCase()
  );
}

export function extractCheckNumber(text: string) {
  const match = text.match(
    /\b(?:CK|CHECK|CHECK\s*NO|CHECK\s*NUMBER)\s*#?\s*:?\s*(\d{3,})\b/i
  );

  return match?.[1] ?? "";
}

export function normalizeInvoiceNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return `INV-${digits.padStart(4, "0")}`;
}

export function extractInvoiceNumbers(text: string) {
  const matches = new Set<string>();
  const invoicePattern =
    /\b(?:inv(?:oice)?\.?\s*[-#: ]?\s*)?0*(\d{3,6})\b/gi;

  for (const match of text.matchAll(invoicePattern)) {
    const raw = match[0];
    const digits = match[1] ?? "";

    if (!digits) {
      continue;
    }

    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 16), index);
    const after = text.slice(index + raw.length, index + raw.length + 16);
    const hasInvoiceContext = /\binv(?:oice)?\.?\s*[-#: ]?\s*$/i.test(before);
    const hasNearbyAmount = /^\s*(?:\.\d{2}|,\d{3}|\d|\$)/.test(after);
    const hasDateContext =
      /[-/]\s*$/.test(before) || /^\s*[-/]\s*\d{1,4}/.test(after);
    const hasCheckContext = /\b(?:ck|check)\s*#?\s*:?\s*$/i.test(before);
    const isBareInvoiceNumber =
      !hasNearbyAmount &&
      !hasDateContext &&
      !hasCheckContext &&
      digits.length >= 3;

    if (hasInvoiceContext || isBareInvoiceNumber) {
      matches.add(normalizeInvoiceNumber(digits));
    }
  }

  return Array.from(matches);
}

export function extractTotalAmount(text: string) {
  const explicitTotal = text.match(
    /\b(?:TOTAL|CHECK\s*TOTAL|AMOUNT)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i
  );

  if (explicitTotal?.[1]) {
    return parseMoney(explicitTotal[1]);
  }

  const values = extractMoneyValues(text);

  return values.length > 0 ? Math.max(...values) : 0;
}

export function extractLikelyPayor(text: string) {
  const explicitPayor = text.match(
    /\b(?:PAYOR|PAYER|CUSTOMER|ACCOUNT)\s*:?\s*([^\n\r]+)/i
  );

  if (explicitPayor?.[1]) {
    return explicitPayor[1].trim();
  }

  const propertyLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /north\s+creek|apartment|property/i.test(line));

  return propertyLine ?? "";
}

export function parseCheckDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);

  if (!slashMatch) {
    return "";
  }

  const currentYear = new Date().getFullYear();
  const rawYear = slashMatch[3] ?? String(currentYear);
  const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
  const month = Number(slashMatch[1]);
  const day = Number(slashMatch[2]);

  if (
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function extractCheckDate(text: string) {
  const match = text.match(
    /\b(?:date|check\s*date)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})\b/i
  );

  return match?.[1] ? parseCheckDate(match[1]) : "";
}

export function parseRemittanceLines(text: string): RemittanceLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const amounts = extractMoneyValues(line);

      return {
        text: line,
        amount: amounts.at(-1) ?? 0,
        invoiceNumbers: extractInvoiceNumbers(line),
        unitCodes: extractUnitCodes(line),
        serviceDescription: line
          .replace(/\b(?:inv(?:oice)?\.?\s*[-#: ]?\s*)?0*\d{3,6}\b/gi, "")
          .replace(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+\.\d{2}\b/g, "")
          .replace(/\b[A-Z]\d{2}[A-Z]?\b/gi, "")
          .replace(/\s+/g, " ")
          .trim(),
      };
    })
    .filter((line) => !/\bTOTAL\b/i.test(line.text));
}

export function parseCheckStubText(rawText: string): ParsedCheckStub {
  const normalizedText = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = parseRemittanceLines(normalizedText);
  const totalAmount = extractTotalAmount(normalizedText);
  const checkDate = extractCheckDate(normalizedText);
  const checkNumber = extractCheckNumber(normalizedText);
  const payor = extractLikelyPayor(normalizedText);
  const header = [
    checkDate ? `DATE: ${checkDate}` : "",
    checkNumber ? `CK#: ${checkNumber}` : "",
    totalAmount > 0 ? `TOTAL: $${totalAmount.toFixed(2)}` : "",
    payor ? `PAYOR: ${payor}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    rawText: normalizedText,
    payor,
    checkNumber,
    checkDate,
    totalAmount,
    lines,
    stubText: [header, normalizedText].filter(Boolean).join("\n"),
  };
}

export function findRemittanceMatches(
  invoices: RemittanceInvoiceRecord[],
  stubText: string,
  payorOverride = ""
) {
  const totalAmount = extractTotalAmount(stubText);
  const lineItems = parseRemittanceLines(stubText);
  const allReferencedInvoiceNumbers = lineItems.flatMap(
    (line) => line.invoiceNumbers
  );
  const referencedInvoiceNumbers = Array.from(
    new Set(allReferencedInvoiceNumbers)
  );
  const invoiceNumberRecords = invoices
    .map((invoice) => ({
      invoiceNumber: normalizeInvoiceNumber(invoice.displayId),
      invoice: {
        ...invoice,
        amountDue:
          typeof invoice.collectionAmountDue === "number"
            ? Math.max(invoice.collectionAmountDue, 0)
            : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
      },
    }))
    .filter((record) => record.invoiceNumber);
  const duplicateTrimaxInvoiceNumbers = Array.from(
    new Set(
      invoiceNumberRecords
        .map((record) => record.invoiceNumber)
        .filter(
          (invoiceNumber, index, allNumbers) =>
            allNumbers.indexOf(invoiceNumber) !== index
        )
    )
  );
  const invoicesByNumber = new Map(
    invoiceNumberRecords.map((record) => [
      record.invoiceNumber,
      record.invoice,
    ])
  );
  const missingInvoiceNumbers = referencedInvoiceNumbers.filter(
    (invoiceNumber) => !invoicesByNumber.has(invoiceNumber)
  );
  const matches = referencedInvoiceNumbers
    .map((invoiceNumber) => invoicesByNumber.get(invoiceNumber) ?? null)
    .filter((invoice): invoice is RemittanceInvoiceRecord & { amountDue: number } =>
      Boolean(invoice)
    );
  const duplicatedInvoiceNumbers = allReferencedInvoiceNumbers.filter(
    (invoiceNumber, index) =>
      allReferencedInvoiceNumbers.indexOf(invoiceNumber) !== index
  );
  const matchedTotal = matches.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const lineTotal = lineItems.reduce((total, line) => total + line.amount, 0);
  const referencedLineTotal = lineItems
    .filter((line) => line.invoiceNumbers.length > 0)
    .reduce((total, line) => total + line.amount, 0);
  const payor = payorOverride.trim() || extractLikelyPayor(stubText);
  const customerNames = Array.from(
    new Set(matches.map((invoice) => invoice.customerName))
  );
  const customerMismatch =
    Boolean(payor.trim()) &&
    matches.some((invoice) => !customerMatchesPayor(invoice.customerName, payor));
  const hasReadableStub = stubText.trim().length > 0;
  const issues = [
    !hasReadableStub ? "Remittance text is missing or unreadable." : "",
    referencedInvoiceNumbers.length === 0
      ? "No exact invoice numbers were read from the remittance stub."
      : "",
    lineItems.length === 0 ? "No remittance lines were read from the stub." : "",
    missingInvoiceNumbers.length > 0
      ? `Invoice number not found in Trimax: ${missingInvoiceNumbers.join(", ")}.`
      : "",
    duplicatedInvoiceNumbers.length > 0
      ? `Duplicate invoice number on stub: ${Array.from(new Set(duplicatedInvoiceNumbers)).join(", ")}.`
      : "",
    duplicateTrimaxInvoiceNumbers.some((invoiceNumber) =>
      referencedInvoiceNumbers.includes(invoiceNumber)
    )
      ? `Invoice number is duplicated in Trimax: ${duplicateTrimaxInvoiceNumbers
          .filter((invoiceNumber) =>
            referencedInvoiceNumbers.includes(invoiceNumber)
          )
          .join(", ")}.`
      : "",
    matches.some(
      (invoice) =>
        invoice.amountDue <= 0 || invoice.status.toLowerCase() === "paid"
    )
      ? "One or more referenced invoices has no unpaid balance."
      : "",
    payor.trim().length === 0
      ? "Payor/customer could not be confidently read from the stub."
      : "",
    customerNames.length > 1
      ? "Referenced invoices belong to more than one customer."
      : "",
    customerMismatch
      ? "Referenced invoice customer does not match the payor read from the stub."
      : "",
    totalAmount > 0 &&
    Math.abs(matchedTotal - totalAmount) >= 0.01 &&
    Math.abs(referencedLineTotal - totalAmount) >= 0.01
      ? "Referenced invoice balances and remittance line amounts do not reconcile to the check total."
      : "",
    totalAmount <= 0 ? "Check total could not be confidently read from the stub." : "",
  ].filter(Boolean);

  return {
    matches: issues.length === 0 ? matches : [],
    totalAmount,
    lineItems,
    referencedInvoiceNumbers,
    missingInvoiceNumbers,
    matchedTotal,
    lineTotal,
    issues,
    confidence:
      issues.length === 0 ? ("verified" as const) : ("review" as const),
  };
}
