import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { EmailAttachment } from "./pdfAttachments";
function stable(value: unknown): string {
  if (Array.isArray(value))
    return JSON.stringify(value.map((v) => stable(v)).sort());
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, stable(v)]),
      ),
    );
  return JSON.stringify(value) ?? "null";
}
export function reviewDigest(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function secret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Error("Secure email review is not configured.");
  return createHmac("sha256", key)
    .update("trimax-document-email-review-v1")
    .digest();
}
export function issueEmailReview(
  snapshot: unknown,
  attachments: EmailAttachment[],
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      expires: now + 30 * 60 * 1000,
      digest: reviewDigest({ snapshot, attachments }),
    }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret()).update(payload).digest("base64url")
  );
}
export function verifyEmailReview(
  token: unknown,
  approved: unknown,
  snapshot: unknown,
  attachments: EmailAttachment[],
  now = Date.now(),
) {
  if (approved !== true || typeof token !== "string")
    throw Error(
      "Open Review Email and explicitly confirm Send. No email was sent.",
    );
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length)
    throw Error("Invalid email review approval.");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    throw Error("Invalid email review approval.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (
    data.version !== 1 ||
    data.expires < now ||
    data.digest !== reviewDigest({ snapshot, attachments })
  )
    throw Error(
      "The email, recipients, PDFs or saved document changed, or review expired. Refresh Review Email before approving again.",
    );
}
export function approvedAttachments(value: unknown): EmailAttachment[] {
  if (!Array.isArray(value) || !value.length || value.length > 20)
    throw Error("Review the official PDF attachments first.");
  return value.map((a) => {
    if (
      !a ||
      typeof a.filename !== "string" ||
      typeof a.content !== "string" ||
      !Buffer.from(a.content, "base64")
        .subarray(0, 5)
        .equals(Buffer.from("%PDF-"))
    )
      throw Error("Invalid reviewed PDF.");
    return { filename: a.filename, content: a.content };
  });
}
