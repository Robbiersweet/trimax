export type RemittanceInvoiceRecord = {
  id: string;
  displayId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: number;
  amountPaid: number;
  collectionAmountDue?: number;
  status: string;
  splitParentInvoiceId?: string | null;
  splitChildrenCount?: number | null;
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
  payee: string;
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

function isCollectibleRemittanceInvoiceStatus(value: string) {
  const status = (value || "draft")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  return ![
    "paid",
    "draft",
    "void",
    "voided",
    "cancelled",
    "canceled",
    "superseded",
    "corrected",
    "archived",
  ].includes(status);
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

function normalizeSplitMoneyFragments(text: string) {
  return text
    .replace(/\b(\d{1,3}(?:,\d{3})*)\s+\.(\d{2})\b/g, "$1.$2")
    .replace(/\b(\d{1,3}(?:,\d{3})*)\s+([0O]{2})\b/g, "$1.00");
}

function summaryTotalKeywordPattern() {
  return /\b(?:GRAND\s+TOTAL|CHECK\s+TOTAL|PAYMENT\s+TOTAL|PAYMENT\s+AMOUNT|AMOUNT\s+ENCLOSED|AMOUNT\s+PAID|CHECK\s+AMOUNT|TOTAL)\b\s*:?\s*/i;
}

function isSummaryTotalLine(text: string) {
  return summaryTotalKeywordPattern().test(text);
}

function hasExplicitSummaryTotal(text: string) {
  return summaryTotalKeywordPattern().test(text);
}

function lineItemTextWithoutSummaryTotal(text: string) {
  const summaryMatch = text.match(summaryTotalKeywordPattern());

  if (!summaryMatch?.index) {
    return summaryMatch?.index === 0 ? "" : text;
  }

  return text.slice(0, summaryMatch.index).trim();
}

export function extractUnitCodes(text: string) {
  return Array.from(new Set(text.match(/\b[A-Z]\d{2}[A-Z]?\b/gi) ?? [])).map(
    (code) => code.toUpperCase()
  );
}

function isBankingNoiseLine(text: string) {
  const normalized = text.trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const keywordCount = [
    "routing",
    "account",
    "bank",
    "memo",
    "operating",
    "wire",
    "ach",
    "deposit",
    "transit",
  ].filter((word) => normalized.includes(word)).length;
  const micrLike =
    /[⑆⑈⑉]|(?:\b\d{7,12}\b.*\b\d{4,12}\b)|(?:\b\d{2,4}[- ]\d{2,4}[- ]\d{3,6}\b)/.test(
      text
    );

  return (
    keywordCount >= 1 ||
    micrLike ||
    /^oho\d{6,}$/i.test(compact) ||
    /^0h0\d{6,}$/i.test(compact)
  );
}

function remittanceRegionText(text: string) {
  const lines = text.split(/\r?\n/);
  const firstRemittanceIndex = lines.findIndex(
    (line) =>
      isRemittanceHeaderText(line) ||
      extractInvoiceNumbers(line).length > 0 ||
      (extractUnitCodes(line).length > 0 &&
        /(?:paint|interior|serv|apartment|property)/i.test(line) &&
        extractMoneyValues(line).length > 0)
  );

  return firstRemittanceIndex >= 0
    ? lines.slice(firstRemittanceIndex).join("\n")
    : text;
}

function checkRegionText(text: string) {
  const lines = text.split(/\r?\n/);
  const firstRemittanceIndex = lines.findIndex(
    (line) => isRemittanceHeaderText(line) || extractInvoiceNumbers(line).length > 0
  );
  const checkLines = firstRemittanceIndex >= 0 ? lines.slice(0, firstRemittanceIndex) : lines;

  return checkLines.filter((line) => !isBankingNoiseLine(line)).join("\n");
}

const dateValuePattern =
  String.raw`(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})`;

function findLabeledHeaderDate(text: string) {
  const matches = Array.from(
    text.matchAll(
      new RegExp(
        String.raw`\b(?:check\s*date|payment\s*date|paid\s*date|date)\b\s*:?\s*[^\d]{0,48}${dateValuePattern}\b`,
        "gi"
      )
    )
  );

  for (const match of matches) {
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 36), index + match[0].length + 36);

    if (/invoice\s*[-:]?\s*date|invoice\s+date/i.test(context)) {
      continue;
    }

    const parsed = parseCheckDate(match[1] ?? "");

    if (parsed) {
      return parsed;
    }
  }

  return "";
}

function findLabeledHeaderCheckNumber(text: string) {
  const normalizedText = text.replace(/[Oo]/g, "0");
  const matches = Array.from(
    normalizedText.matchAll(
      /\b(?:CK|CHK|CHECK(?:\s*(?:NO\.?|NUMBER|#))?)\b\s*#?\s*:?\s*([^\d]{0,28})(\d{3,5})\b/gi
    )
  );

  for (const match of matches) {
    const separator = match[1] ?? "";
    const value = match[2] ?? "";

    if (
      value.length > 4 ||
      /\b(?:total|amount|payment|invoice|account|date)\b/i.test(separator)
    ) {
      continue;
    }

    return value;
  }

  return "";
}

function findExplicitTotalAmount(text: string) {
  const explicitTotal = text.match(
    /\b(?:GRAND\s+TOTAL|CHECK\s*TOTAL|PAYMENT\s*TOTAL|PAYMENT\s*AMOUNT|AMOUNT\s*ENCLOSED|AMOUNT\s*PAID|CHECK\s*AMOUNT|TOTAL)\b\s*:?\s*[^\d$]{0,48}\$?\s*([\d,]+\.\d{2})/i
  );

  return explicitTotal?.[1] ? parseMoney(explicitTotal[1]) : 0;
}

export function extractCheckNumber(text: string) {
  const checkText = checkRegionText(text);
  const labelledCheckNumber =
    findLabeledHeaderCheckNumber(checkText) || findLabeledHeaderCheckNumber(text);

  if (labelledCheckNumber) {
    return labelledCheckNumber;
  }

  const normalizedText = checkText.replace(/[Oo]/g, "0");
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
  const trimmed = value.trim();
  const prefixedMatch = trimmed.match(
    /^\s*(?:[Il1|]NV(?:OICE)?|INV(?:OICE)?)\.?\s*[-#: ]?\s*([0-9OoSsZzIl|Vv]{3,8})\b/i
  );
  const normalizedValue = prefixedMatch?.[1]
    ? prefixedMatch[1]
        .replace(/[Vv]/g, "")
        .replace(/[Oo]/g, "0")
        .replace(/[Ss]/g, "5")
        .replace(/[Zz]/g, "2")
        .replace(/[Il|]/g, "1")
    : trimmed;
  const rawDigits = normalizedValue.replace(/\D/g, "");
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
  const fuzzyInvoicePattern =
    /[Il1|]?\s*I?\s*NV(?:OICE|O)?\.?\s*[-#: ]?\s*([0-9OoSsZzIl|Vv]{3,8})\b/gi;

  for (const match of text.matchAll(fuzzyInvoicePattern)) {
    const rawDigits = match[1] ?? "";
    const prefixText = match[0].slice(0, match[0].length - rawDigits.length);
    const ocrDigits =
      /[Oo]$/.test(prefixText) && rawDigits.length === 3
        ? `O${rawDigits}`
        : rawDigits;
    const normalized = normalizeInvoiceNumber(
      ocrDigits
        .replace(/[Vv]/g, "")
        .replace(/[Oo]/g, "0")
        .replace(/[Ss]/g, "5")
        .replace(/[Zz]/g, "2")
        .replace(/[Il|]/g, "1")
    );

    if (normalized) {
      matches.add(normalized);
    }
  }

  const normalizedText = text
    .replace(/\b[Il1|]NV/gi, "INV")
    .replace(
    /\b(INV(?:OICE)?\.?\s*[-#: ]?\s*)([0-9OoSsZzIl|Vv]{3,8})\b/gi,
    (_match, prefix: string, rawDigits: string) =>
      `${prefix}${rawDigits
        .replace(/[Vv]/g, "")
        .replace(/[Oo]/g, "0")
        .replace(/[Ss]/g, "5")
        .replace(/[Zz]/g, "2")
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
    const rowContext = normalizedText
      .slice(Math.max(0, index - 80), index + raw.length + 80)
      .toLowerCase();
    const hasBareRemittanceContext =
      /(?:north\s+creek|apartment|paint|interior|serv|unit|\b[A-Z]\d{2}\b)/i.test(
        rowContext
      ) && /\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/.test(rowContext);
    const isBareInvoiceNumber =
      !hasNearbyAmount &&
      !hasDateContext &&
      !hasCheckContext &&
      !hasFollowingInvoiceContext &&
      !hasAccountContext &&
      digits.length >= 3 &&
      hasBareRemittanceContext;

    if (rawHasInvoicePrefix || hasInvoiceContext || isBareInvoiceNumber) {
      matches.add(normalizeInvoiceNumber(digits));
    }
  }

  return Array.from(matches);
}

export function extractTotalAmount(text: string) {
  const explicitTotal = findExplicitTotalAmount(text);

  if (explicitTotal > 0) {
    return explicitTotal;
  }

  const remittanceText = remittanceRegionText(text);
  const remittanceLines = parseRemittanceLines(remittanceText);
  const referencedLineTotal = remittanceLines
    .filter((line) => line.invoiceNumbers.length > 0)
    .reduce((total, line) => total + line.amount, 0);

  if (remittanceLines.length > 1 && referencedLineTotal > 0) {
    return Number(referencedLineTotal.toFixed(2));
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
        !isBankingNoiseLine(line) &&
        /north\s+creek\s+apartments/i.test(line) ||
        (!isBankingNoiseLine(line) &&
          /north\s+creek/i.test(line) &&
          /apartment/i.test(line))
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
    /\b(?:PAYOR|PAYER|CUSTOMER|PROPERTY|CLIENT)\s*:?\s*([^\n\r]+)/i
  );

  if (
    explicitPayor?.[1] &&
    !isRemittanceHeaderText(explicitPayor[1]) &&
    !isBankingNoiseLine(explicitPayor[1])
  ) {
    return explicitPayor[1].trim();
  }

  const propertyLine = remittanceRegionText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        /apartment/i.test(line) &&
        !isRemittanceHeaderText(line) &&
        !isBankingNoiseLine(line)
    );

  return propertyLine ?? "";
}

export function extractLikelyPayee(text: string) {
  const checkText = checkRegionText(text);
  const explicitPayee = checkText.match(
    /\b(?:PAYEE|PAY\s+TO\s+THE\s+ORDER\s+OF|PAY\s+TO)\s*:?\s*([^\n\r]+)/i
  );

  if (explicitPayee?.[1] && !isBankingNoiseLine(explicitPayee[1])) {
    return explicitPayee[1].trim().replace(/\s+/g, " ");
  }

  const rlMatch = checkText.match(/\bR\s*&\s*L\s+Creations\b/i);

  return rlMatch?.[0]?.replace(/\s+/g, " ").trim() ?? "";
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
  const checkText = checkRegionText(text);
  const labelledDate =
    findLabeledHeaderDate(checkText) || findLabeledHeaderDate(text);

  if (labelledDate) {
    return labelledDate;
  }

  const match =
    checkText.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/) ??
    text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/);

  return match?.[1] ? parseCheckDate(match[1]) : "";
}

function combineSplitRemittanceRows(lines: string[]) {
  const combined: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const hasInvoice = extractInvoiceNumbers(line).length > 0;
    const hasAmount = extractMoneyValues(line).length > 0;

    if (hasInvoice && !hasAmount) {
      const fragments = [line];
      let consumed = 0;

      for (let offset = 1; offset <= 2; offset += 1) {
        const nextLine = lines[index + offset] ?? "";

        if (!nextLine || extractInvoiceNumbers(nextLine).length > 0) {
          break;
        }

        fragments.push(nextLine);
        consumed = offset;

        if (extractMoneyValues(nextLine).length > 0) {
          break;
        }
      }

      const candidate = fragments.join(" ");

      if (extractMoneyValues(candidate).length > 0) {
        combined.push(candidate);
        index += consumed;
        continue;
      }
    }

    combined.push(line);
  }

  return combined;
}

function amountDueForInvoice(invoice: RemittanceInvoiceRecord) {
  return typeof invoice.collectionAmountDue === "number"
    ? Math.max(invoice.collectionAmountDue, 0)
    : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0);
}

function inferInvoiceNumberFromLineContext(
  line: RemittanceLine,
  invoiceNumberRecords: Array<{
    invoiceNumber: string;
    invoice: RemittanceInvoiceRecord & { amountDue: number };
  }>,
  payor: string
) {
  if (line.amount <= 0 || line.unitCodes.length === 0) {
    return null;
  }

  const lineText = line.text.toLowerCase();
  const candidates = invoiceNumberRecords.filter(({ invoice }) => {
    if (
      invoice.amountDue <= 0 ||
      !isCollectibleRemittanceInvoiceStatus(invoice.status) ||
      Math.abs(invoice.amountDue - line.amount) >= 0.01 ||
      !customerMatchesPayor(invoice.customerName, payor)
    ) {
      return false;
    }

    const invoiceText = `${invoice.displayId} ${invoice.projectTitle}`.toLowerCase();
    const hasUnit = line.unitCodes.some((unitCode) =>
      invoiceText.includes(unitCode.toLowerCase())
    );
    const hasSpecificPaintContext =
      /full/i.test(line.text) &&
      /interior/i.test(line.text) &&
      /paint/i.test(line.text);
    const hasPaintContext =
      !/paint/i.test(line.text) || /paint/i.test(invoice.projectTitle);
    const hasInteriorContext =
      !/interior/i.test(line.text) || /interior/i.test(invoice.projectTitle);

    return (
      hasUnit &&
      hasSpecificPaintContext &&
      hasPaintContext &&
      hasInteriorContext &&
      (lineText.includes("north creek") ||
        customerMatchesPayor(invoice.customerName, "North Creek Apartments"))
    );
  });

  return candidates.length === 1 ? candidates[0] : null;
}

export function parseRemittanceLines(text: string): RemittanceLine[] {
  const sourceLines = remittanceRegionText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return combineSplitRemittanceRows(sourceLines)
    .filter((line) => !isRemittanceHeaderText(line))
    .filter((line) => {
      const invoiceNumbers = extractInvoiceNumbers(line);

      return invoiceNumbers.length > 0 || !isSummaryTotalLine(line);
    })
    .map((line) => {
      const lineItemText = lineItemTextWithoutSummaryTotal(line);
      const invoiceNumbers = extractInvoiceNumbers(lineItemText || line);
      const amounts = extractMoneyValues(lineItemText || line);

      return {
        text: line,
        amount: amounts.at(-1) ?? 0,
        invoiceNumbers,
        unitCodes: extractUnitCodes(lineItemText || line),
        serviceDescription: (lineItemText || line)
          .replace(/\b(?:inv(?:oice)?\.?\s*[-#: ]?\s*)?0*\d{3,6}\b/gi, "")
          .replace(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+\.\d{2}\b/g, "")
          .replace(/\b[A-Z]\d{2}[A-Z]?\b/gi, "")
          .replace(/\s+/g, " ")
          .trim(),
      };
    })
    .filter((line) => line.invoiceNumbers.length > 0 || line.amount > 0);
}

export function parseCheckStubText(rawText: string): ParsedCheckStub {
  const normalizedText = normalizeSplitMoneyFragments(rawText)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = parseRemittanceLines(normalizedText);
  const totalAmount = extractTotalAmount(normalizedText);
  const checkDate = extractCheckDate(normalizedText);
  const checkNumber = extractCheckNumber(normalizedText);
  const payor = extractLikelyPayor(normalizedText);
  const payee = extractLikelyPayee(normalizedText);
  const header = [
    checkDate ? `DATE: ${checkDate}` : "",
    checkNumber ? `CK#: ${checkNumber}` : "",
    totalAmount > 0 ? `TOTAL: $${totalAmount.toFixed(2)}` : "",
    payor ? `PAYOR: ${payor}` : "",
    payee ? `PAYEE: ${payee}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    rawText: normalizedText,
    payor,
    payee,
    checkNumber,
    checkDate,
    totalAmount,
    lines,
    stubText: [header, normalizedText].filter(Boolean).join("\n"),
  };
}

export function hasExplicitRemittanceTotal(text: string) {
  return hasExplicitSummaryTotal(text);
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
        amountDue: amountDueForInvoice(invoice),
      },
    }))
    .filter(
      (record) =>
        record.invoiceNumber &&
        record.invoice.amountDue > 0 &&
        isCollectibleRemittanceInvoiceStatus(record.invoice.status) &&
        Number(record.invoice.splitChildrenCount ?? 0) <= 0
    );
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
  const payor = payorOverride.trim() || extractLikelyPayor(stubText);
  const inferredInvoiceNumbers = lineItems
    .filter((line) =>
      line.invoiceNumbers.every((invoiceNumber) => !invoicesByNumber.has(invoiceNumber))
    )
    .map((line) =>
      inferInvoiceNumberFromLineContext(line, invoiceNumberRecords, payor)
    )
    .filter(
      (
        record
      ): record is {
        invoiceNumber: string;
        invoice: RemittanceInvoiceRecord & { amountDue: number };
      } => Boolean(record)
    )
    .map((record) => record.invoiceNumber);
  const reconciledInvoiceNumbers = Array.from(
    new Set([...referencedInvoiceNumbers, ...inferredInvoiceNumbers])
  );
  const missingInvoiceNumbers = referencedInvoiceNumbers.filter(
    (invoiceNumber) => !invoicesByNumber.has(invoiceNumber)
  );
  const matches = referencedInvoiceNumbers
    .concat(inferredInvoiceNumbers)
    .filter((invoiceNumber, index, allNumbers) =>
      allNumbers.indexOf(invoiceNumber) === index
    )
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
  const customerNames = Array.from(
    new Set(matches.map((invoice) => invoice.customerName))
  );
  const customerMismatch =
    Boolean(payor.trim()) &&
    matches.some((invoice) => !customerMatchesPayor(invoice.customerName, payor));
  const hasReadableStub = stubText.trim().length > 0;
  const issues = [
    !hasReadableStub ? "Remittance text is missing or unreadable." : "",
    reconciledInvoiceNumbers.length === 0
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
      reconciledInvoiceNumbers.includes(invoiceNumber)
    )
      ? `Invoice number is duplicated in Trimax: ${duplicateTrimaxInvoiceNumbers
          .filter((invoiceNumber) =>
            reconciledInvoiceNumbers.includes(invoiceNumber)
          )
          .join(", ")}.`
      : "",
    referencedInvoiceNumbers.length > 0 && matches.length === 0
      ? "Referenced invoices are not collectible payment targets."
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
    referencedInvoiceNumbers: reconciledInvoiceNumbers,
    missingInvoiceNumbers,
    matchedTotal,
    lineTotal,
    issues,
    confidence:
      issues.length === 0 ? ("verified" as const) : ("review" as const),
  };
}
