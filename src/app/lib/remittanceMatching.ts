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

export type RemittanceInvoiceMatchTrace = {
  ocrInvoiceIdentifier: string;
  normalizedInvoiceIdentifier: string;
  ocrRow: string;
  ocrRowAmount: number;
  lookupKey: string;
  found: boolean;
  invoiceId: string | null;
  displayId: string | null;
  status: string | null;
  invoiceAmount: number;
  amountPaid: number;
  amountDue: number;
  eligible: boolean;
  invoiceRole: "original" | "split_source" | "split_child" | "unknown";
  accepted: boolean;
  rejectionReason: string;
  matchedAmount: number;
  resolutionReason?: string;
  unitEvidence?: string;
  amountEvidence?: string;
  candidateInvoiceNumbers?: string[];
  documentTotalReconciliationRequired?: boolean;
  unitCandidates?: string[];
  normalizationOperations?: string[];
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
  return extractMoneyCandidates(text)
    .map((candidate) => candidate.value)
    .filter((value) => value > 0);
}

export function extractMoneyCandidates(text: string) {
  const matches = Array.from(
    text.matchAll(
      /\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+\.\d{2}\b/g
    )
  );

  return matches
    .map((match) => {
      const raw = match[0];
      const value = parseMoney(raw);
      const normalized = `$${value.toFixed(2)}`;
      const hasCommaThousands = /\d{1,3}(?:,\d{3})+/.test(raw);
      const hasTwoDecimals = /\.\d{2}\b/.test(raw);
      const hasOneDecimal = /\.\d\b/.test(raw);
      const hasCurrency = raw.includes("$");
      const digitCount = raw.replace(/\D/g, "").length;
      const score =
        (hasCommaThousands ? 80 : 0) +
        (hasTwoDecimals ? 45 : 0) +
        (hasCurrency ? 20 : 0) -
        (hasOneDecimal ? 12 : 0) -
        (digitCount <= 3 ? 35 : 0);

      return {
        raw,
        value,
        normalized,
        index: match.index ?? 0,
        score,
      };
    })
    .filter((candidate) => candidate.value > 0);
}

function selectLineItemAmount(text: string) {
  const candidates = extractMoneyCandidates(text);

  if (!candidates.length) {
    return 0;
  }

  return candidates
    .slice()
    .sort((a, b) => b.score - a.score || b.index - a.index)[0]
    .value;
}

function normalizeSplitMoneyFragments(text: string) {
  return text
    .replace(/\b(\d{1,3}(?:,\d{3})*)\s+\.(\d{2})\b/g, "$1.$2")
    .replace(/\b(\d{1,3}(?:,\d{3})*)\s+([0O]{2})\b/g, "$1.00")
    .replace(
      /\b(\d{1,3}(?:,\d{3})*)\.(\d)\b/g,
      (_match, dollars: string, cents: string) => `${dollars}.${cents}0`
    );
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
    const matchIndex = match.index ?? 0;
    const context = text.slice(Math.max(0, matchIndex - 28), matchIndex + match[0].length + 28);

    if (
      /^(?:19|20)\d{2}$/.test(rawDigits.replace(/\D/g, "")) &&
      (/\binvoice\s*[-:]?\s*date\b/i.test(context) ||
        /\bdate\s*[-:]?\s*$/i.test(text.slice(Math.max(0, matchIndex - 16), matchIndex)) ||
        /^\s*[-/]/.test(text.slice(matchIndex + match[0].length, matchIndex + match[0].length + 8)) ||
        /^\s*invoice\b/i.test(match[0]))
    ) {
      continue;
    }

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
    const hasInvoiceDateHeaderContext =
      /\binv(?:oice)?\s*[-:]?\s*date\b/i.test(
        normalizedText.slice(Math.max(0, index - 28), index + raw.length + 28)
      );
    const hasCheckContext = /\b(?:ck|check)\s*#?\s*:?\s*$/i.test(before);
    const hasFollowingInvoiceContext = /^\s+inv(?:oice)?\.?\s*[-#: ]?\s*/i.test(after);
    const hasAccountContext = /\baccount\s*$/i.test(before);
    const isLikelyDateYear =
      /^(?:19|20)\d{2}$/.test(digits) &&
      (hasDateContext ||
        hasInvoiceDateHeaderContext ||
        /\bdate\s*$/i.test(before) ||
        /^invoice\b/i.test(raw));
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

    if (isLikelyDateYear) {
      continue;
    }

    if (
      rawHasInvoicePrefix &&
      hasInvoiceDateHeaderContext &&
      !/^inv\.?\s*[-#: ]?\s*0*[1-9]\d{2,5}\b/i.test(raw)
    ) {
      continue;
    }

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

  const values = extractMoneyValues(text);

  const remittanceText = remittanceRegionText(text);
  const remittanceLines = parseRemittanceLines(remittanceText);
  const referencedLineTotal = remittanceLines
    .filter((line) => line.invoiceNumbers.length > 0)
    .reduce((total, line) => total + line.amount, 0);
  const largestVisibleAmount = values.length > 0 ? Math.max(...values) : 0;

  if (
    remittanceLines.length > 1 &&
    referencedLineTotal > 0 &&
    largestVisibleAmount > referencedLineTotal
  ) {
    return largestVisibleAmount;
  }

  if (remittanceLines.length > 1 && referencedLineTotal > 0) {
    return Number(referencedLineTotal.toFixed(2));
  }

  return largestVisibleAmount;
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

function remittanceInvoiceRole(invoice: RemittanceInvoiceRecord | null | undefined) {
  if (!invoice) {
    return "unknown" as const;
  }

  if (Number(invoice.splitChildrenCount ?? 0) > 0) {
    return "split_source" as const;
  }

  if (invoice.splitParentInvoiceId) {
    return "split_child" as const;
  }

  return "original" as const;
}

function remittanceInvoiceRejectionReason(
  invoice: (RemittanceInvoiceRecord & { amountDue: number }) | null | undefined
) {
  if (!invoice) {
    return "Invoice record not found in loaded Trimax invoices.";
  }

  if (!isCollectibleRemittanceInvoiceStatus(invoice.status)) {
    return `Invoice status is not collectible: ${invoice.status || "unknown"}.`;
  }

  if (Number(invoice.splitChildrenCount ?? 0) > 0) {
    return "Invoice is a split source; use collectible split child invoices.";
  }

  if (invoice.amountDue <= 0) {
    return "Invoice has no collectible balance due.";
  }

  return "";
}

function rawInvoiceLikeTokens(text: string) {
  const tokens = new Set<string>();

  for (const match of text.matchAll(
    /\b[Il1|]?\s*I?\s*NV(?:OICE|O|0)?\.?\s*[-#: ]?\s*[A-Z0-9|]{3,10}\b/gi
  )) {
    tokens.add(match[0].replace(/\s+/g, ""));
  }

  return Array.from(tokens);
}

function invoiceCandidateDigitsFromRawToken(token: string) {
  const compact = token.toUpperCase().replace(/[^A-Z0-9|]/g, "");
  const afterPrefix = compact.replace(/^[I1L|]*N[VY]?(?:OICE|O|0)?/, "");
  const source = afterPrefix || compact;
  const strictDigits = source
    .replace(/[EOQ]/g, "0")
    .replace(/[S]/g, "5")
    .replace(/[Z]/g, "2")
    .replace(/[IL|]/g, "1")
    .replace(/[^0-9]/g, "");
  const candidates = new Set<string>();

  if (strictDigits) {
    candidates.add(strictDigits);
  }

  if (strictDigits.length > 4) {
    for (let index = 0; index < strictDigits.length; index += 1) {
      candidates.add(strictDigits.slice(0, index) + strictDigits.slice(index + 1));
    }
  }

  return Array.from(candidates)
    .map((digits) => normalizeInvoiceNumber(digits))
    .filter(Boolean);
}

function invoiceTokenBody(token: string) {
  const compact = token.toUpperCase().replace(/[^A-Z0-9|]/g, "");

  return compact.replace(/^[I1L|]*N[VY]?(?:OICE|O|0)?/, "");
}

function invoiceDigitKey(invoiceNumber: string) {
  return invoiceNumber.replace(/\D/g, "").replace(/^0+/, "");
}

function invoiceRawCharMatchesDigit(char: string, digit: string) {
  if (char === digit) {
    return true;
  }

  if (digit === "0") {
    return /[EOQ]/.test(char);
  }

  if (digit === "1") {
    return /[IL|]/.test(char);
  }

  if (digit === "2") {
    return /[Z]/.test(char);
  }

  if (digit === "5") {
    return /[S]/.test(char);
  }

  if (digit === "9") {
    return /[S]/.test(char);
  }

  return false;
}

function invoiceTokenBodyCompatibleWithInvoice(
  invoiceNumber: string,
  rawToken: string
) {
  const body = invoiceTokenBody(rawToken);
  const invoiceDigits = invoiceNumber.replace(/\D/g, "");

  if (!body || !invoiceDigits || body.length !== invoiceDigits.length) {
    return false;
  }

  return body.split("").every((char, index) =>
    invoiceRawCharMatchesDigit(char, invoiceDigits[index] ?? "")
  );
}

function invoiceNumberCompatibleWithRawToken(
  invoiceNumber: string,
  rawToken: string
) {
  const candidateNumbers = invoiceCandidateDigitsFromRawToken(rawToken);
  const invoiceDigits = invoiceDigitKey(invoiceNumber);

  if (candidateNumbers.includes(invoiceNumber)) {
    return true;
  }

  if (invoiceTokenBodyCompatibleWithInvoice(invoiceNumber, rawToken)) {
    return true;
  }

  return candidateNumbers.some((candidate) => {
    const candidateDigits = invoiceDigitKey(candidate);

    if (!candidateDigits || !invoiceDigits) {
      return false;
    }

    if (candidateDigits === invoiceDigits) {
      return true;
    }

    if (Math.abs(candidateDigits.length - invoiceDigits.length) > 1) {
      return false;
    }

    let mismatches = 0;
    let left = 0;
    let right = 0;

    while (left < candidateDigits.length && right < invoiceDigits.length) {
      if (candidateDigits[left] === invoiceDigits[right]) {
        left += 1;
        right += 1;
        continue;
      }

      mismatches += 1;

      if (mismatches > 1) {
        return false;
      }

      if (candidateDigits.length > invoiceDigits.length) {
        left += 1;
      } else if (candidateDigits.length < invoiceDigits.length) {
        right += 1;
      } else {
        return false;
      }
    }

    return mismatches + (candidateDigits.length - left) + (invoiceDigits.length - right) <= 1;
  });
}

function extractUnitCodeCandidates(text: string) {
  const candidates = new Set(extractUnitCodes(text));

  for (const match of text.matchAll(/\b[A-Z][A-Z0-9.]{2,4}\b/gi)) {
    const normalized = normalizeUnitLikeToken(match[0]);

    if (/^[A-Z]\d{2}[A-Z]?$/.test(normalized)) {
      candidates.add(normalized);
    }
  }

  return Array.from(candidates);
}

function rawUnitLikeTokens(text: string) {
  return Array.from(
    new Set(
      Array.from(text.matchAll(/\b[A-Z][A-Z0-9.]{2,4}\b/gi))
        .map((match) => match[0].toUpperCase().replace(/\./g, ""))
        .filter((token) => {
          const normalized = normalizeUnitLikeToken(token);

          return (
            /^[A-Z]\d{2}[A-Z]?$/.test(normalized) &&
            (/\d/.test(token) || token.length <= 3)
          );
        })
    )
  );
}

function normalizeUnitLikeToken(token: string) {
  return token
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/[O]/g, "0")
    .replace(/[ILJYT]/g, "1")
    .replace(/[S]/g, "5");
}

function invoiceUnitReferences(invoice: RemittanceInvoiceRecord) {
  return extractUnitCodeCandidates(`${invoice.displayId} ${invoice.projectTitle}`);
}

function unitTokenCorroboratesReference(rawToken: string, reference: string) {
  const normalized = normalizeUnitLikeToken(rawToken);

  if (normalized === reference) {
    return true;
  }

  const compactRaw = rawToken.toUpperCase().replace(/\./g, "");
  const compactReference = reference.toUpperCase();

  if (compactRaw.length !== compactReference.length) {
    return false;
  }

  return compactRaw.split("").every((char, index) => {
    const expected = compactReference[index] ?? "";

    if (char === expected) {
      return true;
    }

    if (expected === "0") {
      return /[OQD]/.test(char);
    }

    if (expected === "1") {
      return /[ILJYT]/.test(char);
    }

    if (expected === "5") {
      return /[S]/.test(char);
    }

    return false;
  });
}

function invoiceUnitEvidence(invoice: RemittanceInvoiceRecord, unitCodes: string[]) {
  const invoiceText = `${invoice.displayId} ${invoice.projectTitle}`.toUpperCase();
  const invoiceUnits = invoiceUnitReferences(invoice);

  return (
    unitCodes.find((unitCode) => invoiceText.includes(unitCode)) ??
    invoiceUnits.find((unitCode) =>
      unitCodes.some((rawToken) => unitTokenCorroboratesReference(rawToken, unitCode))
    ) ??
    ""
  );
}

type EligibleRemittanceInvoiceRecord = {
  invoiceNumber: string;
  invoice: RemittanceInvoiceRecord & { amountDue: number };
};

type RemittanceRowResolution = {
  line: RemittanceLine;
  rawInvoiceCandidates: string[];
  normalizedCandidates: string[];
  unitCandidates: string[];
  normalizationOperations: string[];
  eligibleCandidates: EligibleRemittanceInvoiceRecord[];
  invoiceNumber: string;
  invoice: (RemittanceInvoiceRecord & { amountDue: number }) | null;
  unitEvidence: string;
  amountEvidence: string;
  reason: string;
};

function uniqueEligibleInvoiceRecords(records: EligibleRemittanceInvoiceRecord[]) {
  const seenIds = new Set<string>();

  return records.filter(({ invoice }) => {
    if (seenIds.has(invoice.id)) {
      return false;
    }

    seenIds.add(invoice.id);
    return true;
  });
}

function resolveRemittanceRowInvoice(
  line: RemittanceLine,
  eligibleInvoiceNumberRecords: EligibleRemittanceInvoiceRecord[],
  invoicesByNumber: Map<string, RemittanceInvoiceRecord & { amountDue: number }>
): RemittanceRowResolution {
  const rawInvoiceCandidates = Array.from(
    new Set([...rawInvoiceLikeTokens(line.text), ...line.invoiceNumbers])
  );
  const normalizedCandidates = Array.from(
    new Set([
      ...line.invoiceNumbers,
      ...rawInvoiceCandidates.flatMap((token) =>
        invoiceCandidateDigitsFromRawToken(token)
      ),
    ])
  );
  const unitCandidates = extractUnitCodeCandidates(line.text);
  const rawUnits = rawUnitLikeTokens(line.text);
  const unitEvidenceTokens = Array.from(new Set([...unitCandidates, ...rawUnits]));
  const exactCandidates = normalizedCandidates
    .map((invoiceNumber) => {
      const invoice = invoicesByNumber.get(invoiceNumber) ?? null;

      return invoice ? { invoiceNumber, invoice } : null;
    })
    .filter((record): record is EligibleRemittanceInvoiceRecord =>
      Boolean(record)
    );
  const fuzzyCandidates = rawInvoiceCandidates.flatMap((token) =>
    eligibleInvoiceNumberRecords.filter(({ invoiceNumber }) =>
      invoiceNumberCompatibleWithRawToken(invoiceNumber, token)
    )
  );
  const eligibleCandidates = uniqueEligibleInvoiceRecords([
    ...exactCandidates,
    ...fuzzyCandidates,
  ]);
  const amountEvidence =
    line.amount > 0 ? `$${line.amount.toFixed(2)}` : "none";

  if (rawInvoiceCandidates.length === 0 && normalizedCandidates.length === 0) {
    return {
      line,
      rawInvoiceCandidates,
      normalizedCandidates,
      unitCandidates: unitEvidenceTokens,
      normalizationOperations: [
        "invoice glyph confusions O/Q/E->0, S->5, Z->2, I/L/|->1",
        "unit glyph confusions O->0, I/L/J/Y/T->1, S->5",
      ],
      eligibleCandidates,
      invoiceNumber: "",
      invoice: null,
      unitEvidence: unitEvidenceTokens.join(", "),
      amountEvidence,
      reason: unitCandidates.length > 0
        ? "unit evidence without invoice candidate"
        : "no invoice candidate",
    };
  }

  if (eligibleCandidates.length === 1) {
    const [candidate] = eligibleCandidates;
    const unitEvidence = invoiceUnitEvidence(candidate.invoice, unitEvidenceTokens);

    return {
      line,
      rawInvoiceCandidates,
      normalizedCandidates,
      unitCandidates: unitEvidenceTokens,
      normalizationOperations: [
        "invoice glyph confusions O/Q/E->0, S->5, Z->2, I/L/|->1",
        "unit glyph confusions O->0, I/L/J/Y/T->1, S->5",
      ],
      eligibleCandidates,
      invoiceNumber: candidate.invoiceNumber,
      invoice: candidate.invoice,
      unitEvidence,
      amountEvidence,
      reason: unitEvidence
        ? "unique eligible invoice candidate with unit corroboration"
        : "unique eligible invoice candidate",
    };
  }

  const unitCorroboratedCandidates = eligibleCandidates.filter(({ invoice }) =>
    invoiceUnitEvidence(invoice, unitEvidenceTokens)
  );

  if (unitCorroboratedCandidates.length === 1) {
    const [candidate] = unitCorroboratedCandidates;
    const unitEvidence = invoiceUnitEvidence(candidate.invoice, unitEvidenceTokens);

    return {
      line,
      rawInvoiceCandidates,
      normalizedCandidates,
      unitCandidates: unitEvidenceTokens,
      normalizationOperations: [
        "invoice glyph confusions O/Q/E->0, S->5, Z->2, I/L/|->1",
        "unit glyph confusions O->0, I/L/J/Y/T->1, S->5",
      ],
      eligibleCandidates,
      invoiceNumber: candidate.invoiceNumber,
      invoice: candidate.invoice,
      unitEvidence,
      amountEvidence,
      reason: "ambiguous invoice candidates resolved by unit corroboration",
    };
  }

  return {
    line,
    rawInvoiceCandidates,
    normalizedCandidates,
    unitCandidates: unitEvidenceTokens,
    normalizationOperations: [
      "invoice glyph confusions O/Q/E->0, S->5, Z->2, I/L/|->1",
      "unit glyph confusions O->0, I/L/J/Y/T->1, S->5",
    ],
    eligibleCandidates,
    invoiceNumber: "",
    invoice: null,
    unitEvidence: unitEvidenceTokens.join(", "),
    amountEvidence,
    reason:
      eligibleCandidates.length > 1
        ? "ambiguous invoice candidates"
        : "no eligible invoice candidate",
  };
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
      const amount = selectLineItemAmount(lineItemText || line);

      return {
        text: line,
        amount,
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
  const invoiceNumberRecords = invoices.map((invoice) => ({
      invoiceNumber: normalizeInvoiceNumber(invoice.displayId),
      invoice: {
        ...invoice,
        amountDue: amountDueForInvoice(invoice),
      },
    }));
  const allInvoicesByNumber = new Map(
    invoiceNumberRecords
      .filter((record) => record.invoiceNumber)
      .map((record) => [record.invoiceNumber, record.invoice])
  );
  const invoiceRowByNumber = new Map<string, RemittanceLine>();
  lineItems.forEach((line) => {
    line.invoiceNumbers.forEach((invoiceNumber) => {
      if (!invoiceRowByNumber.has(invoiceNumber)) {
        invoiceRowByNumber.set(invoiceNumber, line);
      }
    });
  });
  const eligibleInvoiceNumberRecords = invoiceNumberRecords
    .filter(
      (record) =>
        record.invoiceNumber &&
        record.invoice.amountDue > 0 &&
        isCollectibleRemittanceInvoiceStatus(record.invoice.status) &&
        Number(record.invoice.splitChildrenCount ?? 0) <= 0
    );
  const duplicateTrimaxInvoiceNumbers = Array.from(
    new Set(
      eligibleInvoiceNumberRecords
        .map((record) => record.invoiceNumber)
        .filter(
          (invoiceNumber, index, allNumbers) =>
            allNumbers.indexOf(invoiceNumber) !== index
        )
    )
  );
  const invoicesByNumber = new Map(
    eligibleInvoiceNumberRecords.map((record) => [
      record.invoiceNumber,
      record.invoice,
    ])
  );
  const payor = payorOverride.trim() || extractLikelyPayor(stubText);
  const rowResolutions = lineItems.map((line) =>
    resolveRemittanceRowInvoice(line, eligibleInvoiceNumberRecords, invoicesByNumber)
  );
  const resolvedInvoiceNumbers = rowResolutions
    .filter((resolution) => resolution.invoice)
    .map((resolution) => resolution.invoiceNumber);
  const reconciledInvoiceNumbers = Array.from(
    new Set([...referencedInvoiceNumbers, ...resolvedInvoiceNumbers])
  );
  const missingInvoiceNumbers = referencedInvoiceNumbers.filter(
    (invoiceNumber) => !invoicesByNumber.has(invoiceNumber)
  );
  const acceptedResolutionRows = rowResolutions.filter(
    (
      resolution
    ): resolution is RemittanceRowResolution & {
      invoice: RemittanceInvoiceRecord & { amountDue: number };
    } => Boolean(resolution.invoice)
  );
  const duplicateResolvedInvoiceIds = acceptedResolutionRows
    .map((resolution) => resolution.invoice.id)
    .filter(
      (invoiceId, index, invoiceIds) => invoiceIds.indexOf(invoiceId) !== index
    );
  const matches = acceptedResolutionRows
    .filter(
      (resolution, index, allResolutions) =>
        allResolutions.findIndex(
          (candidate) => candidate.invoice.id === resolution.invoice.id
        ) === index
    )
    .map((resolution) => resolution.invoice);
  const duplicatedInvoiceNumbers = allReferencedInvoiceNumbers.filter(
    (invoiceNumber, index) =>
      allReferencedInvoiceNumbers.indexOf(invoiceNumber) !== index
  );
  const traceKeys = new Set<string>();
  const matchTrace: RemittanceInvoiceMatchTrace[] = [
    ...rowResolutions
      .filter(
        (resolution) =>
          resolution.invoice ||
          resolution.rawInvoiceCandidates.length > 0 ||
          resolution.normalizedCandidates.length > 0
      )
      .map((resolution) => {
        const invoiceNumber =
          resolution.invoiceNumber ||
          resolution.normalizedCandidates[0] ||
          resolution.rawInvoiceCandidates[0] ||
          "";
        const invoice =
          resolution.invoice ??
          (invoiceNumber ? allInvoicesByNumber.get(invoiceNumber) ?? null : null);
        const eligible = Boolean(resolution.invoice);
        const traceKey = `${resolution.line.text}|${invoiceNumber}`;

        traceKeys.add(traceKey);

        return {
          ocrInvoiceIdentifier:
            resolution.rawInvoiceCandidates[0] || invoiceNumber,
          normalizedInvoiceIdentifier: invoiceNumber,
          ocrRow: resolution.line.text,
          ocrRowAmount: resolution.line.amount,
          lookupKey: invoiceNumber,
          found: Boolean(invoice),
          invoiceId: invoice?.id ?? null,
          displayId: invoice?.displayId ?? null,
          status: invoice?.status ?? null,
          invoiceAmount: invoice?.invoiceAmount ?? 0,
          amountPaid: invoice?.amountPaid ?? 0,
          amountDue: invoice?.amountDue ?? 0,
          eligible,
          invoiceRole: remittanceInvoiceRole(invoice),
          accepted: eligible,
          rejectionReason: eligible
            ? ""
            : remittanceInvoiceRejectionReason(invoice) || resolution.reason,
          matchedAmount: resolution.invoice?.amountDue ?? 0,
          resolutionReason: resolution.reason,
          unitEvidence: resolution.unitEvidence,
          amountEvidence: resolution.amountEvidence,
          candidateInvoiceNumbers: resolution.eligibleCandidates.map(
            (candidate) => candidate.invoiceNumber
          ),
          documentTotalReconciliationRequired: totalAmount > 0,
          unitCandidates: resolution.unitCandidates,
          normalizationOperations: resolution.normalizationOperations,
        };
      }),
    ...referencedInvoiceNumbers
      .filter((invoiceNumber) => {
        const row = invoiceRowByNumber.get(invoiceNumber) ?? null;

        return !traceKeys.has(`${row?.text ?? ""}|${invoiceNumber}`);
      })
      .map((invoiceNumber) => {
        const invoice = allInvoicesByNumber.get(invoiceNumber) ?? null;
        const eligibleInvoice = invoicesByNumber.get(invoiceNumber) ?? null;
        const row = invoiceRowByNumber.get(invoiceNumber) ?? null;
        const eligible = Boolean(eligibleInvoice);

        return {
          ocrInvoiceIdentifier: invoiceNumber,
          normalizedInvoiceIdentifier: invoiceNumber,
          ocrRow: row?.text ?? "",
          ocrRowAmount: row?.amount ?? 0,
          lookupKey: invoiceNumber,
          found: Boolean(invoice),
          invoiceId: invoice?.id ?? null,
          displayId: invoice?.displayId ?? null,
          status: invoice?.status ?? null,
          invoiceAmount: invoice?.invoiceAmount ?? 0,
          amountPaid: invoice?.amountPaid ?? 0,
          amountDue: invoice?.amountDue ?? 0,
          eligible,
          invoiceRole: remittanceInvoiceRole(invoice),
          accepted: eligible,
          rejectionReason: eligible
            ? ""
            : remittanceInvoiceRejectionReason(invoice),
          matchedAmount: eligibleInvoice?.amountDue ?? 0,
          resolutionReason: eligible
            ? "exact eligible invoice candidate"
            : "exact invoice candidate is not collectible",
          unitEvidence: row ? extractUnitCodeCandidates(row.text).join(", ") : "",
          amountEvidence: row?.amount ? `$${row.amount.toFixed(2)}` : "none",
          candidateInvoiceNumbers: eligible ? [invoiceNumber] : [],
          documentTotalReconciliationRequired: totalAmount > 0,
          unitCandidates: row ? extractUnitCodeCandidates(row.text) : [],
          normalizationOperations: [
            "invoice glyph confusions O/Q/E->0, S->5, Z->2, I/L/|->1",
            "unit glyph confusions O->0, I/L/J/Y/T->1, S->5",
          ],
        };
      }),
  ];
  const matchedTotal = matches.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );
  const lineTotal = lineItems.reduce((total, line) => total + line.amount, 0);
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
    duplicateResolvedInvoiceIds.length > 0
      ? `Duplicate invoice row resolves to the same Trimax invoice: ${Array.from(new Set(duplicateResolvedInvoiceIds)).join(", ")}.`
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
    reconciledInvoiceNumbers.length > 0 && matches.length === 0
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
    Math.abs(matchedTotal - totalAmount) >= 0.01
      ? "Referenced invoice balances do not reconcile to the check total."
      : "",
    totalAmount <= 0 ? "Check total could not be confidently read from the stub." : "",
  ].filter(Boolean);

  return {
    matches: issues.length === 0 ? matches : [],
    totalAmount,
    lineItems,
    referencedInvoiceNumbers: reconciledInvoiceNumbers,
    missingInvoiceNumbers,
    matchTrace,
    matchedTotal,
    lineTotal,
    issues,
    confidence:
      issues.length === 0 ? ("verified" as const) : ("review" as const),
  };
}
