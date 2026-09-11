export type DuplicateRemittanceRole =
  | "owner"
  | "admin"
  | "property_manager"
  | "technician"
  | "viewer"
  | string;

export type DuplicateRemittanceActivity = {
  id: string;
  action: string;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, unknown> | null;
  createdAt?: string | null;
};

export type DuplicateRemittanceInput = {
  checkNumber?: string | null;
  amount?: number | null;
  checkDate?: string | null;
  receivedDate?: string | null;
  payor?: string | null;
  invoiceIds?: string[];
  invoiceNumbers?: string[];
  fingerprint?: string | null;
};

export type DuplicateRemittancePayment = {
  id: string;
  activityLogIds: string[];
  status: "active" | "reversed";
  checkNumber: string;
  amount: number;
  checkDate: string;
  receivedDate: string;
  appliedDate: string;
  payor: string;
  invoiceIds: string[];
  invoiceNumbers: string[];
  invoiceCount: number;
  reversalDate: string;
  reversalReason: string;
};

export type DuplicateRemittanceResult = {
  status: "none" | "active" | "reversed" | "possible";
  confidence: "none" | "possible" | "exact";
  payment: DuplicateRemittancePayment | null;
  reasons: string[];
  canOverride: boolean;
  ownerOverrideRequired: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeDuplicateCheckNumber(value: unknown) {
  return clean(value).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function moneyNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(clean(value).replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedDate(value: unknown) {
  const text = clean(value);

  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function normalizedPayor(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function compatiblePayor(left: string, right: string) {
  const first = normalizedPayor(left);
  const second = normalizedPayor(right);

  return !first || !second || first.includes(second) || second.includes(first);
}

export function duplicateCheckNumbersCompatible(left: unknown, right: unknown) {
  const first = normalizeDuplicateCheckNumber(left);
  const second = normalizeDuplicateCheckNumber(right);

  if (!first || !second) {
    return false;
  }

  return (
    first === second ||
    (Math.abs(first.length - second.length) <= 1 &&
      (first.endsWith(second) || second.endsWith(first)))
  );
}

function sameMoney(left: unknown, right: unknown) {
  const first = moneyNumber(left);
  const second = moneyNumber(right);

  return first > 0 && second > 0 && Math.abs(first - second) < 0.01;
}

function sameDateOrMissing(left: unknown, right: unknown) {
  const first = normalizedDate(left);
  const second = normalizedDate(right);

  return !first || !second || first === second;
}

function setKey(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).sort();
}

function sameSet(left: string[], right: string[]) {
  const first = setKey(left);
  const second = setKey(right);

  return (
    first.length > 0 &&
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function overlapCount(left: string[], right: string[]) {
  const second = new Set(setKey(right));

  return setKey(left).filter((value) => second.has(value)).length;
}

function isOwnerAdmin(role: DuplicateRemittanceRole | null | undefined) {
  const normalized = clean(role).toLowerCase().replace(/[_-]+/g, " ");

  return normalized === "owner" || normalized === "admin";
}

function isReversed(details: Record<string, unknown>) {
  const outcome = clean(details.paymentOutcome).toLowerCase();

  return (
    outcome === "reversed" ||
    clean(details.reversedAt) !== "" ||
    clean(details.reversalDate) !== "" ||
    details.paymentReversed === true
  );
}

function groupPaymentActivities(
  activities: DuplicateRemittanceActivity[]
): DuplicateRemittancePayment[] {
  const groups = new Map<string, DuplicateRemittancePayment>();

  activities
    .filter((activity) => activity.action === "invoice.batch_payment_applied")
    .forEach((activity) => {
      const details = activity.details ?? {};
      const checkNumber = normalizeDuplicateCheckNumber(details.paymentReference);
      const amount = moneyNumber(details.checkAmount);
      const payor = clean(details.payor);
      const checkDate = normalizedDate(details.checkDate);
      const receivedDate = normalizedDate(details.receivedDate ?? details.paymentDate);
      const paymentAttachmentId = clean(details.paymentAttachmentId);
      const key = paymentAttachmentId
        ? `attachment:${paymentAttachmentId}`
        : [
            "payment",
            checkNumber || "no-check",
            amount.toFixed(2),
            normalizedPayor(payor) || "no-payor",
            checkDate || "no-check-date",
            receivedDate || "no-received-date",
          ].join("|");
      const existing =
        groups.get(key) ??
        {
          id: key,
          activityLogIds: [],
          status: "active",
          checkNumber,
          amount,
          checkDate,
          receivedDate,
          appliedDate: normalizedDate(activity.createdAt) || clean(activity.createdAt),
          payor,
          invoiceIds: [],
          invoiceNumbers: [],
          invoiceCount: 0,
          reversalDate: "",
          reversalReason: "",
        };

      existing.activityLogIds.push(activity.id);
      existing.invoiceIds = setKey([
        ...existing.invoiceIds,
        clean(details.invoiceId || activity.entityId),
      ]);
      existing.invoiceNumbers = setKey([
        ...existing.invoiceNumbers,
        clean(details.invoiceNumber || activity.entityLabel),
      ]);
      existing.invoiceCount = Math.max(
        existing.invoiceIds.length,
        Number(details.batchInvoiceCount ?? 0) || 0
      );

      if (isReversed(details)) {
        existing.status = "reversed";
        existing.reversalDate = normalizedDate(
          details.reversalDate ?? details.reversedAt
        );
        existing.reversalReason = clean(details.reversalReason);
      }

      groups.set(key, existing);
    });

  return Array.from(groups.values());
}

export function findDuplicateRemittance(
  input: DuplicateRemittanceInput,
  activities: DuplicateRemittanceActivity[],
  role: DuplicateRemittanceRole | null | undefined = ""
): DuplicateRemittanceResult {
  const payments = groupPaymentActivities(activities);
  const inputInvoiceIds = setKey(input.invoiceIds ?? []);
  const inputInvoiceNumbers = setKey(input.invoiceNumbers ?? []);
  const amount = moneyNumber(input.amount);
  const checkNumber = normalizeDuplicateCheckNumber(input.checkNumber);
  const exactCandidates: Array<{
    payment: DuplicateRemittancePayment;
    reasons: string[];
  }> = [];
  const possibleCandidates: Array<{
    payment: DuplicateRemittancePayment;
    reasons: string[];
  }> = [];

  for (const payment of payments) {
    const reasons: string[] = [];
    const invoiceIdsExact = sameSet(inputInvoiceIds, payment.invoiceIds);
    const invoiceNumbersExact = sameSet(inputInvoiceNumbers, payment.invoiceNumbers);
    const invoiceSetExact = invoiceIdsExact || invoiceNumbersExact;
    const invoiceOverlap =
      overlapCount(inputInvoiceIds, payment.invoiceIds) ||
      overlapCount(inputInvoiceNumbers, payment.invoiceNumbers);
    const amountExact = sameMoney(amount, payment.amount);
    const checkCompatible = duplicateCheckNumbersCompatible(
      checkNumber,
      payment.checkNumber
    );
    const payorCompatible = compatiblePayor(input.payor ?? "", payment.payor);
    const dateCompatible =
      sameDateOrMissing(input.checkDate, payment.checkDate) &&
      sameDateOrMissing(input.receivedDate, payment.receivedDate);

    if (checkCompatible) reasons.push("compatible check number");
    if (amountExact) reasons.push("same amount");
    if (invoiceSetExact) reasons.push("same invoice set");
    if (invoiceOverlap && !invoiceSetExact) reasons.push("overlapping invoice set");
    if (payorCompatible) reasons.push("compatible payor");
    if (dateCompatible) reasons.push("compatible date");

    const exact =
      amountExact &&
      payorCompatible &&
      dateCompatible &&
      invoiceSetExact;
    const possible =
      !exact &&
      amountExact &&
      payorCompatible &&
      (invoiceOverlap > 0 || invoiceSetExact);

    if (exact) {
      exactCandidates.push({ payment, reasons });
    } else if (possible) {
      possibleCandidates.push({ payment, reasons });
    }
  }

  const exact = exactCandidates[0] ?? null;

  if (exact) {
    return {
      status: exact.payment.status === "reversed" ? "reversed" : "active",
      confidence: "exact",
      payment: exact.payment,
      reasons: exact.reasons,
      canOverride: exact.payment.status === "reversed",
      ownerOverrideRequired: false,
    };
  }

  const possible = possibleCandidates[0] ?? null;

  if (possible) {
    return {
      status: possible.payment.status === "reversed" ? "reversed" : "possible",
      confidence: "possible",
      payment: possible.payment,
      reasons: possible.reasons,
      canOverride: isOwnerAdmin(role),
      ownerOverrideRequired: possible.payment.status !== "reversed",
    };
  }

  return {
    status: "none",
    confidence: "none",
    payment: null,
    reasons: [],
    canOverride: false,
    ownerOverrideRequired: false,
  };
}
