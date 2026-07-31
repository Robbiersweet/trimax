import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const invoicePage = readFileSync(
  resolve(root, "src/app/invoices/[id]/page.tsx"),
  "utf8"
);
const sendPanel = readFileSync(
  resolve(root, "src/app/components/InvoiceEmailSendPanel.tsx"),
  "utf8"
);
const openSendReviewButton = readFileSync(
  resolve(root, "src/app/components/OpenSendReviewButton.tsx"),
  "utf8"
);
const persistentDetails = readFileSync(
  resolve(root, "src/app/components/PersistentDetails.tsx"),
  "utf8"
);
const invoiceSendRoute = readFileSync(
  resolve(root, "src/app/api/invoices/[id]/send-email/route.ts"),
  "utf8"
);
const floatingControls = readFileSync(
  resolve(root, "src/app/components/WorkspaceFloatingControls.tsx"),
  "utf8"
);

assert(
  invoicePage.includes("Review Split Group") &&
    invoicePage.includes("OpenSendReviewButton") &&
    invoicePage.includes("opensStorageKey: invoiceEmailStorageKey") &&
    invoicePage.includes('targetId: "send-invoice"') &&
    !invoicePage.includes('label: "Send Split Group",\n          title: "Send the split group next"'),
  "Top split-group action must open review instead of pretending to immediately send."
);

assert(
  openSendReviewButton.includes("details.open = true") &&
    openSendReviewButton.includes('window.localStorage.setItem(storageKey, "open")') &&
    openSendReviewButton.includes("scrollIntoView") &&
    openSendReviewButton.includes("firstFocusable?.focus"),
  "Top split-group action must visibly open, scroll to, and focus the existing Email & Preview workflow."
);

assert(
  persistentDetails.includes("data-persistent-details-key={storageKey}"),
  "PersistentDetails must expose its storage key so shared review actions can open the intended panel."
);

assert(
  sendPanel.includes("sendIdempotencyKey") &&
    sendPanel.includes("if (sending || hasBeenSent)") &&
    sendPanel.includes("aria-busy={sending}") &&
    sendPanel.includes("animate-spin") &&
    sendPanel.includes("router.refresh()"),
  "Final send control must use one guarded send path, show loading, ignore repeated taps, and refresh after success."
);

assert(
  sendPanel.includes("initialSent?: boolean") &&
    sendPanel.includes("initialSentAt?: string | null") &&
    sendPanel.includes("initialSentPdfCount?: number") &&
    sendPanel.includes("invoice-email-sent-state") &&
    sendPanel.includes("PDF${") &&
    !sendPanel.includes("Send This Invoice Only"),
  "Send panel must render a stable Sent state and must not show a large invalid standalone split-child send button."
);

assert(
  sendPanel.includes("Split invoices must be sent together."),
  "Split groups must replace standalone child send with concise explanatory text."
);

assert(
  sendPanel.includes("Both official invoice PDFs are attached to this email.${invoiceLines ? `\\n${invoiceLines}` : \"\"}") &&
    sendPanel.includes("Attached invoices:") &&
    sendPanel.includes("Combined total:"),
  "Split email preview must keep a line break between the sentence and attached invoice list."
);

assert(
  invoicePage.includes("splitGroupIsSent") &&
    invoicePage.includes("Sent / ${emailPdfCount} PDF") &&
    invoicePage.includes("initialSent={splitGroupIsSent}") &&
    invoicePage.includes("initialSentPdfCount={splitSendInvoiceCount}") &&
    invoicePage.includes("View Proof") &&
    invoicePage.includes("Split group sent"),
  "Invoice detail must pass authoritative split sent state into the panel and stop promoting send after success."
);

assert(
  invoiceSendRoute.includes("sendIdempotencyKey") &&
    invoiceSendRoute.includes('"Idempotency-Key"') &&
    invoiceSendRoute.includes('filter("details->>send_idempotency_key", "eq", sendIdempotencyKey)') &&
    invoiceSendRoute.includes("duplicate_retry") &&
    invoiceSendRoute.includes("Split group was already sent. Existing proof is saved.") &&
    invoiceSendRoute.includes("send_idempotency_key: sendIdempotencyKey || null"),
  "Invoice send API must safely return existing proof for same-key retries instead of creating duplicate customer emails."
);

assert(
  invoiceSendRoute.indexOf("createPrintPagePdfAttachment") <
    invoiceSendRoute.indexOf("sendWithResend") &&
    invoiceSendRoute.indexOf("sendWithResend") <
      invoiceSendRoute.indexOf("status: \"sent\""),
  "PDF generation, email delivery, and status updates must remain in the protected order."
);

assert(
  floatingControls.includes("<WorkspaceBackBar />") &&
    floatingControls.includes("<QuickCommandCenter />") &&
    floatingControls.indexOf("<WorkspaceBackBar />") <
      floatingControls.indexOf("<QuickCommandCenter />"),
  "Floating Back must remain immediately left of Command while repairing invoice send."
);

console.log("Split invoice send regression checks passed.");
