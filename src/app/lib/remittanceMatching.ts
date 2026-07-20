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
  const normalizedText = text.replace(/[Oo]/g, "0");
  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const labelledMatches = Array.from(
    normalizedText.matchAll(
      /\b(?:CK|CHK|CHECK|CHECK\s*NO\.?|CHECK\s*NUMBER|CHECK\s*#)\s*#?\s*:?\s*(\d{3,5})\b/gi
    )
  ).filter((match) => !isLikelyAccountNumberContext(normalizedText, match));
  const plausibleMatch = labelledMatches.find(
    (match) => (match[1] ?? "").length <= 4
  );

  if (plausibleMatch?.[1]) {
    return plausibleMatch[1];
  }

  const headerLine = lines.find(
    (line) =>
      /\b(?:ck|check|total|payment|date)\b/i.test(line) &&
      !isRemittanceHeaderText(line)
  );
  const headerCandidate = headerLine
    ? extractPlausibleCheckCandidate(headerLine)
    : "";

  return headerCandidate || labelledMatches[0]?.[1] || "";
}

export function normalizeInvoiceNumber(value: string) {
  const rawDigits = value.replace(/\D/g, "");
  const digits =
    rawDigits.length > 4 && rawDigits.startsWith("0")
      ? rawDigits.replace(/^0+/, "")
      : rawDigits;

  if (!digits) {
    return "";
  }

  return `INV-${digits.padStart(4, "0")}`;
}

export function extractInvoiceNumbers(text: string) {
  const matches = new Set<string>();
  const normalizedText = text
    .replace(/\b[Il1|]NV/gi, "INV")
    .replace(
    /\b(INV(?:OICE)?\.?\s*[-#: ]?\s*)([0-9OoSsIl|Vv]{3,8})\b/gi,
    (_match, prefix: string, rawDigits: string) =>
      `${prefix}${rawDigits
        .replace(/[Vv]/g, "")
        .replace(/[Oo]/g, "0")
        .replace(/[Ss]/g, "5")
        .replace(/[Il|]/g, "1")}`
  );
  const invoicePattern =
    /\b(?:inv(?:oice)?\.?\s*[-#: ]?\s*)?0*(\d{3,6})\b/gi;

  for (const match of normalizedText.matchAll(invoicePattern)) {
    const raw = match[0];
    const digits = match[1] ?? "";

    if (!digits) {
      continue;
    }

    const index = match.index ?? 0;
    const before = normalizedText.slice(Math.max(0, index - 16), index);
    const after = normalizedText.slice(index + raw.length, index + raw.length + 16);
    const rawHasInvoicePrefix = /^inv(?:oice)?\.?\s*[-#: ]?\s*/i.test(raw);
    const hasInvoiceContext = /\binv(?:oice)?\.?\s*[-#: ]?\s*$/i.test(before);
    const hasNearbyAmount = /^\s*(?:\.\d{2}|,\d{3}|\d|\$)/.test(after);
    const hasDateContext =
      /[-/]\s*$/.test(before) || /^\s*[-/]\s*\d{1,4}/.test(after);
    const hasCheckContext = /\b(?:ck|check)\s*#?\s*:?\s*$/i.test(before);
    const hasFollowingInvoiceContext = /^\s+inv(?:oice)?\.?\s*[-#: ]?\s*/i.test(after);
    const hasAccountContext = /\baccount\s*$/i.test(before);
    const isBareInvoiceNumber =
      !hasNearbyAmount &&
      !hasDateContext &&
      !hasCheckContext &&
      !hasFollowingInvoiceContext &&
      !hasAccountContext &&
      digits.length >= 3;

    if (rawHasInvoicePrefix || hasInvoiceContext || isBareInvoiceNumber) {
      matches.add(normalizeInvoiceNumber(digits));
    }
  }

  return Array.from(matches);
}

export function extractTotalAmount(text: string) {
  const explicitTotal = text.match(
    /\b(?:TOTAL|CHECK\s*TOTAL|CHECK\s*AMOUNT|PAYMENT\s*AMOUNT|AMOUNT\s*PAID)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i
  );

  if (explicitTotal?.[1]) {
    return parseMoney(explicitTotal[1]);
  }

  const values = extractMoneyValues(text);

  return values.length > 0 ? Math.max(...values) : 0;
}

export function extractLikelyPayor(text: string) {
  const likelyPropertyLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        /north\s+creek\s+apartments/i.test(line) ||
        (/north\s+creek/i.test(line) && /apartment/i.test(line))
    );

  if (likelyPropertyLine) {
    const northCreekMatch = likelyPropertyLine.match(/north\s+creek\s+apartments?/i);

    if (northCreekMatch?.[0]) {
      return northCreekMatch[0].replace(/\s+/g, " ").trim();
    }

    return likelyPropertyLine
      .replace(/\b(?:property|payor|payer|customer|client)\s*:?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const explicitPayor = text.match(
    /\b(?:PAYOR|PAYER|CUSTOMER|ACCOUNT|PROPERTY|CLIENT)\s*:?\s*([^\n\r]+)/i
  );

  if (explicitPayor?.[1] && !isRemittanceHeaderText(explicitPayor[1])) {
    return explicitPayor[1].trim();
  }

  const propertyLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /apartment/i.test(line) && !isRemittanceHeaderText(line));

  return propertyLine ?? "";
}

function isRemittanceHeaderText(text: string) {
  const normalized = text.trim().toLowerCase();
  const headerWords = [
    "property",
    "account",
    "invoice",
    "date",
    "description",
    "amount",
  ];
  const matches = headerWords.filter((word) => normalized.includes(word)).length;

  return matches >= 2 && !/north\s+creek|apartments?\s+[a-z0-9]/i.test(text);
}

function isLikelyAccountNumberContext(text: string, match: RegExpMatchArray) {
  const index = match.index ?? 0;
  const value = match[1] ?? "";
  const before = text.slice(Math.max(0, index - 40), index);
  const after = text.slice(index + match[0].length, index + match[0].length + 40);

  return (
    value.length > 4 ||
    /\baccount\s*$/i.test(before) ||
    /^\s+(?:inv|invoice)\b/i.test(after) ||
    /^\s+\d{1,2}\/\d{1,2}/.test(after)
  );
}

function extractPlausibleCheckCandidate(line: string) {
  const withoutDates = line.replace(
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    " "
  );
  const withoutMoney = withoutDates.replace(
    /\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+\.\d{2}\b/g,
    " "
  );
  const candidates = Array.from(withoutMoney.matchAll(/\b\d{3,5}\b/g))
    .map((match) => match[0])
    .filter((value) => value.length <= 4);

  return candidates[0] ?? "";
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
  const labelledMatch = text.match(
    /\b(?:date|check\s*date|payment\s*date|paid\s*date)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})\b/i
  );
  const match =
    labelledMatch ??
    text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/);

  return match?.[1] ? parseCheckDate(match[1]) : "";
}

function combineSplitRemittanceRows(lines: string[]) {
  const combined: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] ?? "";
    const hasInvoice = extractInvoiceNumbers(line).length > 0;
    const hasAmount = extractMoneyValues(line).length > 0;
    const nextHasInvoice = extractInvoiceNumbers(nextLine).length > 0;
    const nextAmounts = extractMoneyValues(nextLine);

    if (hasInvoice && !hasAmount && !nextHasInvoice && nextAmounts.length > 0) {
      combined.push(`${line} ${nextLine}`);
      index += 1;
      continue;
    }

    combined.push(line);
  }

  return combined;
}

export function parseRemittanceLines(text: string): RemittanceLine[] {
  const sourceLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return combineSplitRemittanceRows(sourceLines)
    .filter((line) => !isRemittanceHeaderText(line))
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
    .filter((line) => !/\b(?:TOTAL|CHECK\s*AMOUNT|PAYMENT\s*AMOUNT|AMOUNT\s*PAID)\b/i.test(line.text));
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
