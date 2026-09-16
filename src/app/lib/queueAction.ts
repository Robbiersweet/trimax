import {
  detectClientIdentityConflict,
  type ClientIdentityRecord,
} from "./clientIdentity";
import {
  hasMeaningfulInvoiceLineItems,
  invoiceSendIneligibleReason,
  type InvoiceEligibilityLineItem,
  type InvoiceEligibilityRecord,
} from "./invoiceEligibility";
import { invoiceWasSent, moneyNumber } from "./invoiceLifecycle";

export type QueueDocument = InvoiceEligibilityRecord & {
  id: string;
  client_id?: string | null;
  customer_name?: string | null;
  project_title?: string | null;
  reference?: string | null;
  estimate_amount?: string | number | null;
  tax_mode?: string | null;
  tax_label?: string | null;
  tax_rate?: string | number | null;
  split_count?: number | null;
  lineItems?: InvoiceEligibilityLineItem[];
};
export type QueueClient = ClientIdentityRecord;
export type QueueActionInput = {
  queueId: string;
  businessSlug: string;
  estimate: QueueDocument | null;
  invoice: QueueDocument | null;
  packageInvoices: QueueDocument[];
  clients: QueueClient[];
  sentIds: string[];
  activeSession: boolean;
  closed: boolean;
  loadError?: boolean;
  pdfReady?: boolean;
  preflightError?: string | null;
  workspaceCc?: string | null;
};
export function validEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}
export function documentRequirements(
  document: QueueDocument,
  clients: QueueClient[],
) {
  const missing: string[] = [];
  const client = clients.find((c) => c.id === document.client_id);
  if (
    !client ||
    detectClientIdentityConflict({
      clients,
      currentClientId: document.client_id,
      customerName: document.customer_name,
      projectTitle: document.project_title,
    }).hasConflict
  )
    missing.push(
      "Customer and property do not match. Review before continuing.",
    );
  if (!document.project_title?.trim()) missing.push("Add a project title.");
  if (
    !hasMeaningfulInvoiceLineItems(document.lineItems ?? []) ||
    (document.lineItems ?? []).some(
      (line) =>
        !line.description?.trim() ||
        !Number.isFinite(Number(line.quantity)) ||
        Number(line.quantity) <= 0 ||
        !Number.isFinite(Number(line.unit_price)),
    )
  )
    missing.push("Review line items and pricing.");
  if (moneyNumber(document.invoice_amount ?? document.estimate_amount) <= 0)
    missing.push("Add a valid amount.");
  if (
    !["taxable", "no_tax", "tax_exempt"].includes(document.tax_mode ?? "") ||
    (document.tax_mode === "taxable" &&
      (!document.tax_label?.trim() ||
        document.tax_rate === null ||
        document.tax_rate === undefined ||
        String(document.tax_rate).trim() === "" ||
        !Number.isFinite(Number(document.tax_rate)) ||
        Number(document.tax_rate) < 0 ||
        Number(document.tax_rate) > 100))
  )
    missing.push("Resolve tax settings.");
  return missing;
}
export function resolveQueueAction(input: QueueActionInput) {
  const { queueId, businessSlug, estimate, invoice } = input;
  const query = `?business=${encodeURIComponent(businessSlug)}`;
  const jobHref = `/queue/${queueId}${query}`;
  const result = (
    type: string,
    label: string,
    href: string,
    targetDocumentId: string | null = null,
    missingRequirements: string[] = [],
  ) => ({
    type,
    label,
    href,
    targetDocumentId,
    readiness: missingRequirements.length === 0,
    missingRequirements,
    blockedReason: missingRequirements[0] ?? null,
  });
  if (input.activeSession)
    return result("manage_session", "Manage Session", `${jobHref}#job-session`);
  if (!estimate && !invoice)
    return result(
      "create_estimate",
      "Create Estimate",
      `/estimates/new?queueId=${queueId}&business=${encodeURIComponent(businessSlug)}`,
    );
  if (!invoice && estimate) {
    const missing = documentRequirements(estimate, input.clients);
    if (input.loadError)
      missing.push("Document details could not be verified.");
    return missing.length
      ? result(
          "finish_estimate",
          "Finish Estimate",
          `/estimates/${estimate.id}/edit${query}`,
          estimate.id,
          missing,
        )
      : result(
          "create_invoice",
          "Create Invoice",
          `/estimates/${estimate.id}${query}`,
          estimate.id,
        );
  }
  if (!invoice) return result("review", "Open Item", jobHref);
  const members = input.packageInvoices.length
    ? input.packageInvoices
    : [invoice];
  const sent = new Set(input.sentIds);
  if (
    invoiceWasSent(invoice, sent) ||
    members.every((i) => invoiceWasSent(i, sent))
  )
    return result(
      input.closed ? "open_item" : "start_job",
      input.closed ? "Open Item" : "Start Job",
      input.closed ? jobHref : `${jobHref}#job-session`,
    );
  const missing = members.flatMap((i) => {
    const client = input.clients.find((c) => c.id === i.client_id);
    const requirements = documentRequirements(i, input.clients);
    const reason = invoiceSendIneligibleReason({
      invoice: i,
      lineItems: i.lineItems,
      recipientEmail: client?.email,
    });
    if (reason) requirements.push(reason);
    if (!validEmail(client?.email)) requirements.push("Fix recipient email.");
    if (
      (client?.cc_email && !validEmail(client.cc_email)) ||
      (input.workspaceCc && !validEmail(input.workspaceCc))
    )
      requirements.push("Review CC email.");
    if (i.client_id !== invoice.client_id)
      requirements.push(
        "Customer and property do not match. Review before continuing.",
      );
    if (invoiceWasSent(i, sent))
      requirements.push("Review partially sent invoice package.");
    return requirements;
  });
  if (input.loadError) missing.push("Document details could not be verified.");
  const expected = Math.max(
    invoice.split_count ?? 0,
    ...members.map((i) => i.split_count ?? 0),
  );
  if (
    (invoice.split_parent_invoice_id || expected > 1) &&
    (members.length !== expected || expected < 2)
  )
    missing.push("Review the complete split invoice package.");
  if (!input.pdfReady)
    missing.push(
      input.preflightError || "Verify the official PDF before sending.",
    );
  if (missing.length)
    return result(
      "finish_invoice",
      "Finish Invoice",
      `/invoices/${invoice.id}${query}`,
      invoice.id,
      [...new Set(missing)],
    );
  return result(
    "send_invoice",
    "Send Invoice",
    `/invoices/${invoice.id}${query}`,
    invoice.id,
  );
}
