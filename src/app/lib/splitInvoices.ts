import { getNextDocumentDisplayId } from "./documentNumbers";
import { logActivity } from "./activityLog";
import { supabase } from "./supabase";

export type SplitInvoiceSource = {
  id: string;
  displayId: string | null;
  businessId: string;
  businessSlug: string;
  clientId: string | null;
  customerName: string;
  projectTitle: string;
  issueDate: string | null;
  dueDate: string | null;
  reference: string | null;
  serviceAddress: string | null;
  terms: string | null;
  notes: string | null;
};

export type SplitInvoicePlanItem = {
  sequence: number;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
};

type CreateSplitInvoicesInput = {
  sourceInvoice: SplitInvoiceSource;
  subtotalAmount: number;
  targetAmount: number;
  taxLabel: string;
  taxRate: number;
  taxMode?: string | null;
  taxNumber?: string | null;
  createdByUserId?: string | null;
};

function centsToDollars(cents: number) {
  return cents / 100;
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function getTaxCents(subtotalCents: number, taxRate: number) {
  return Math.round(subtotalCents * ((Number(taxRate) || 0) / 100));
}

function getMaxSubtotalCentsForGrandTotal(
  targetGrandTotalCents: number,
  taxRate: number
) {
  let low = 0;
  let high = targetGrandTotalCents;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const grandTotal = midpoint + getTaxCents(midpoint, taxRate);

    if (grandTotal <= targetGrandTotalCents) {
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return Math.max(high, 1);
}

export function buildSplitInvoicePlan({
  subtotalAmount,
  targetAmount,
  taxRate,
}: {
  subtotalAmount: number;
  targetAmount: number;
  taxRate: number;
}) {
  const subtotalCents = Math.round(subtotalAmount * 100);
  const targetCents = Math.round(targetAmount * 100);
  const totalTaxCents = getTaxCents(subtotalCents, taxRate);

  if (
    subtotalCents <= 0 ||
    targetCents <= 0 ||
    subtotalCents + totalTaxCents <= targetCents
  ) {
    return [];
  }

  const maxSubtotalCents = getMaxSubtotalCentsForGrandTotal(
    targetCents,
    taxRate
  );
  const plan: SplitInvoicePlanItem[] = [];
  let remainingSubtotalCents = subtotalCents;

  while (remainingSubtotalCents > 0) {
    const subtotalForThisInvoice = Math.min(
      maxSubtotalCents,
      remainingSubtotalCents
    );
    const taxForThisInvoice = getTaxCents(
      subtotalForThisInvoice,
      taxRate
    );

    plan.push({
      sequence: plan.length + 1,
      subtotalAmount: centsToDollars(subtotalForThisInvoice),
      taxAmount: centsToDollars(taxForThisInvoice),
      totalAmount: centsToDollars(
        subtotalForThisInvoice + taxForThisInvoice
      ),
    });

    remainingSubtotalCents -= subtotalForThisInvoice;
  }

  return plan;
}

export async function createSplitInvoices({
  sourceInvoice,
  subtotalAmount,
  targetAmount,
  taxLabel,
  taxRate,
  taxMode = "taxable",
  taxNumber = null,
  createdByUserId = null,
}: CreateSplitInvoicesInput) {
  const plan = buildSplitInvoicePlan({
    subtotalAmount,
    targetAmount,
    taxRate,
  });

  if (plan.length === 0) {
    return [];
  }

  const insertedInvoices: { id: string; display_id: string | null }[] = [];

  for (const item of plan) {
    const displayId = await getNextDocumentDisplayId({
      table: "invoices",
      prefix: "INV",
      businessId: sourceInvoice.businessId,
    });
    const splitLabel = `Split ${item.sequence} of ${plan.length}`;

    const { data: insertedInvoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
      business_id: sourceInvoice.businessId,
      estimate_id: null,
      client_id: sourceInvoice.clientId,
      created_by_user_id: createdByUserId,
      display_id: displayId,
      customer_name: sourceInvoice.customerName,
      project_title: `${sourceInvoice.projectTitle} - ${splitLabel}`,
      service_address: sourceInvoice.serviceAddress ?? "",
      reference: sourceInvoice.reference ?? "",
      invoice_amount: formatCurrency(item.totalAmount),
      issue_date: sourceInvoice.issueDate,
      due_date: sourceInvoice.dueDate,
      tax_mode: taxMode || "taxable",
      tax_label: taxLabel || "Tax",
      tax_rate: Number(taxRate) || 0,
      tax_number:
        taxMode === "taxable" ? taxNumber?.trim() || null : null,
      amount_paid: 0,
      split_warning_enabled: false,
      split_target_amount: null,
      split_parent_invoice_id: sourceInvoice.id,
      split_sequence: item.sequence,
      split_count: plan.length,
      terms: sourceInvoice.terms,
      notes: [
        sourceInvoice.notes,
        `Created from ${
          sourceInvoice.displayId || sourceInvoice.projectTitle
        } as ${splitLabel}.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      status: "Draft",
      })
      .select("id, display_id")
      .single();

    if (invoiceError || !insertedInvoice) {
      throw invoiceError ?? new Error("Unable to create split invoice.");
    }

    const { error: lineItemError } = await supabase
      .from("invoice_line_items")
      .insert({
        invoice_id: insertedInvoice.id,
        business_id: sourceInvoice.businessId,
        description: `${sourceInvoice.projectTitle} - Split ${
          item.sequence
        } of ${plan.length}`,
        quantity: 1,
        unit_price: item.subtotalAmount,
        line_total: item.subtotalAmount,
        sort_order: 0,
      });

    if (lineItemError) {
      throw lineItemError;
    }

    insertedInvoices.push(insertedInvoice);
  }

  await logActivity({
    businessId: sourceInvoice.businessId,
    action: "invoice.split_created",
    entityType: "invoice",
    entityId: sourceInvoice.id,
    entityLabel:
      sourceInvoice.displayId || sourceInvoice.projectTitle || "Invoice",
    details: {
      splitCount: insertedInvoices.length,
      targetAmount: formatCurrency(targetAmount),
      subtotalAmount: formatCurrency(subtotalAmount),
      createdInvoiceIds: insertedInvoices.map((invoice) => invoice.id),
      createdInvoiceDisplayIds: insertedInvoices.map(
        (invoice) => invoice.display_id
      ),
    },
  });

  return insertedInvoices.map((invoice) => ({
    id: invoice.id,
    displayId: invoice.display_id || "Invoice",
  }));
}
