import { estimates } from "../data/estimates";
import { invoices } from "../data/invoices";
import { queueItems } from "../data/queue";

export function createInvoiceFromEstimate(estimateId: string) {
  const estimate = estimates.find(
    (estimate) => estimate.id === estimateId
  );

  if (!estimate) {
    return null;
  }

  return {
    id: `inv-${Date.now()}`,
    displayId: `#${Math.floor(Math.random() * 900 + 100)}`,
    customer: estimate.customer,
    project: estimate.project,
    amount: estimate.amount,
    status: "Draft",
    linkedEstimateId: estimate.id,
    dueDate: "Net 30",
    description: estimate.description,
  };
}

export function markQueueScheduled(queueId: string) {
  const queueItem = queueItems.find(
    (item) => item.id === queueId
  );

  if (!queueItem) {
    return null;
  }

  queueItem.status = "Scheduled";

  return queueItem;
}

export function markInvoicePaid(invoiceId: string) {
  const invoice = invoices.find(
    (invoice) => invoice.id === invoiceId
  );

  if (!invoice) {
    return null;
  }

  invoice.status = "Paid";

  return invoice;
}