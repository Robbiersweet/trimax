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
const invoiceSendRoute = readFileSync(
  resolve(root, "src/app/api/invoices/[id]/send-email/route.ts"),
  "utf8"
);
const emailSettings = readFileSync(
  resolve(root, "src/app/lib/invoiceEmailSettings.ts"),
  "utf8"
);
const floatingControls = readFileSync(
  resolve(root, "src/app/components/WorkspaceFloatingControls.tsx"),
  "utf8"
);

assert(
  invoicePage.includes("Review & Send Reminder") &&
    invoicePage.includes("opensStorageKey: reminderEmailStorageKey") &&
    invoicePage.includes('targetId: "late-payment-reminder"') &&
    invoicePage.includes("reminderEmailStorageKey") &&
    !invoicePage.includes('label: "Send Reminder",\n              title: "A late reminder is due"'),
  "Top late-payment action must open review instead of pretending to send immediately."
);

assert(
  openSendReviewButton.includes("details.open = true") &&
    openSendReviewButton.includes("scrollIntoView") &&
    openSendReviewButton.includes("firstFocusable?.focus"),
  "Reminder review action must visibly open and focus the authoritative email panel."
);

assert(
  invoicePage.includes("latestReminderSentToday") &&
    invoicePage.includes("initialSent={latestReminderSentToday}") &&
    invoicePage.includes("initialSentAt={latestReminderLog?.created_at ?? null}") &&
    invoicePage.includes("daysPastDue={daysLate}") &&
    invoicePage.includes("View Reminder") &&
    invoicePage.includes("Review Reminder"),
  "Reminder panel must receive same-day sent state while preserving future reminder availability."
);

assert(sendPanel.includes("DocumentEmailReview") && sendPanel.includes("setOpen(true)") && !sendPanel.includes("fetch("), "Initial actions must open mandatory review; provider requests are confined to the final review workflow.");

assert(sendPanel.includes("DocumentEmailReview") && sendPanel.includes("setOpen(true)") && !sendPanel.includes("fetch("), "Initial actions must open mandatory review; provider requests are confined to the final review workflow.");

assert(
  emailSettings.includes("This invoice is {reminderAge}."),
  "Default reminder copy must include dynamic reminder age without changing balances or due dates."
);

assert(
  invoiceSendRoute.includes("Payment reminder was already sent. Existing proof is saved.") &&
    invoiceSendRoute.includes('emailPurpose === "reminder"') &&
    invoiceSendRoute.includes("invoiceDeliveryAction(emailPurpose)") &&
    invoiceSendRoute.includes('filter("details->>send_idempotency_key", "eq", sendIdempotencyKey)') &&
    invoiceSendRoute.includes("send_idempotency_key: sendIdempotencyKey || null"),
  "Reminder send API must return existing proof for same-key retries instead of sending duplicate reminders."
);

assert(
  invoiceSendRoute.indexOf("createPrintPagePdfAttachment") <
    invoiceSendRoute.indexOf("sendWithResend") &&
    invoiceSendRoute.includes('emailPurpose === "reminder"') &&
    invoiceSendRoute.includes("invoiceDeliveryAction(emailPurpose)"),
  "Reminder PDF generation and proof logging must remain on the existing invoice send route."
);

assert(
  floatingControls.includes("<WorkspaceBackBar />") &&
    floatingControls.includes("<QuickCommandCenter />") &&
    floatingControls.indexOf("<WorkspaceBackBar />") <
      floatingControls.indexOf("<QuickCommandCenter />"),
  "Floating Back must remain immediately left of Command while repairing reminders."
);

console.log("Late payment reminder send regression checks passed.");
