import {
  formatMoney as canonicalFormatMoney,
  moneyCents,
  percentMoney,
  sumMoney,
} from "./money";
import { getEffectiveTaxRate } from "../utils/tax";
export function formatDocumentMoney(value: number) {
  const [whole, fraction] = canonicalFormatMoney(value).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction;
}
const formatMoney = formatDocumentMoney;
export type EstimatePolicy =
  | { kind: "percent"; value: number }
  | { kind: "fixed"; value: number }
  | { kind: "none" };
export function readEstimatePolicy(
  terms: string | null,
): EstimatePolicy | null {
  const lines = (terms ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^Deposit:/i.test(s));
  if (lines.length !== 1) return null;
  if (/^Deposit:\s*none\.?$/i.test(lines[0])) return { kind: "none" };
  const pct = /^Deposit:\s*(\d+(?:\.\d+)?)%\.?$/i.exec(lines[0]);
  if (pct && Number(pct[1]) > 0 && Number(pct[1]) <= 100)
    return { kind: "percent", value: Number(pct[1]) };
  const fixed = /^Deposit:\s*\$([\d,]+(?:\.\d{1,2})?)\.?$/i.exec(lines[0]);
  if (fixed && moneyCents(fixed[1]) > 0)
    return { kind: "fixed", value: moneyCents(fixed[1]) / 100 };
  return null;
}
export function estimateMoney(
  estimate: {
    estimate_amount: string | number | null;
    tax_mode?: string | null;
    tax_rate?: string | number | null;
  },
  lines: { line_total: string | number | null }[],
) {
  const lineSubtotal = sumMoney(lines.map((l) => l.line_total));
  const subtotal =
    lineSubtotal > 0 ? lineSubtotal : sumMoney([estimate.estimate_amount]);
  const taxRate = getEffectiveTaxRate({
    taxMode: estimate.tax_mode,
    taxRate: estimate.tax_rate,
  });
  const taxAmount = percentMoney(subtotal, taxRate);
  return {
    subtotal,
    taxRate,
    taxAmount,
    total: sumMoney([subtotal, taxAmount]),
  };
}
export function estimateDepositSentence(total: number, terms: string | null) {
  const policy = readEstimatePolicy(terms);
  if (!policy)
    throw Error(
      "Record explicit deposit terms on this estimate before sending (Deposit: 50%, Deposit: $500.00, or Deposit: none). Older estimates have no assumed deposit.",
    );
  if (policy.kind === "none") return "";
  const amount =
    policy.kind === "fixed" ? policy.value : percentMoney(total, policy.value);
  if (moneyCents(amount) > moneyCents(total))
    throw Error("Deposit exceeds the estimate total. Correct the saved terms.");
  return `A deposit of ${formatMoney(amount)}${policy.kind === "percent" ? ` (${policy.value}% of your ${formatMoney(total)} project estimate)` : ""} is required to reserve your spot on our schedule and order the necessary materials.`;
}
// Financial statements remain verbatim. Edits outside them are a cover note, not new billing terms.
export function validateEmailEdits(
  subject: string,
  message: string,
  facts: string,
  canonicalSubject = "",
) {
  if (message.split(facts).length !== 2)
    throw Error(
      "Keep the canonical document details exactly once. Correct amounts and terms on the saved document, then refresh review.",
    );
  const documentNumbers = [
    ...facts.matchAll(/^(?:Estimate|Invoice): (.+)$/gm),
  ].map((match) => match[1]);
  const subjectCover = documentNumbers.reduce(
    (text, id) => text.split(id).join(""),
    subject,
  );
  const cover =
    (subject === canonicalSubject ? "" : subjectCover) +
    "\n" +
    message.replace(facts, "");
  if (
    /\b\d+(?:[.,]\d+)?\b(?![A-Z-])|\$|\d\s*%|\b(?:deposit|balance|amount|total|due|paid|payment|net\s*\d|complete[ds]?|finished|waiv\w*|free|discount|terms|dollars?|percent|cost|price|owed|owe|pay|paying|settled|settlement|obligation|credit|refund|waived|nothing|complimentary|zero|payable|money|funds|charge[ds]?|billing|fee|downpayment|optional|ignore|disregard|done|concluded|completed|no charge)\b|\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/i.test(
      cover,
    )
  )
    throw Error(
      "Your edits add financial, completion, or payment terms outside the canonical details. Remove that claim or correct the saved document first.",
    );
  if (
    /rnlcreations\.com|425[- .]350[- .]4898|just\s*kleen|<\/?(?:img|table)|signature/i.test(
      cover,
    )
  )
    throw Error(
      "The workspace signature is appended once automatically. Remove pasted signatures from the email text.",
    );
}
