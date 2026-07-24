import Link from "next/link";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import Card from "../../components/Card";
import InvoiceBulkPaymentActions from "../../components/InvoiceBulkPaymentActions";
import InvoiceWorkspaceNav from "../../components/InvoiceWorkspaceNav";
import {
  invoiceCollectionAmountDue,
  isPaymentEligibleInvoice,
  type InvoiceEligibilityLineItem,
} from "../../lib/invoiceEligibility";
import { moneyNumber } from "../../lib/invoiceLifecycle";
import { supabase } from "../../lib/supabase";

type Business = {
  id: string;
  name: string | null;
  slug: string;
};

type Invoice = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount?: string | number | null;
  deposit_status?: string | null;
  status: string | null;
  due_date: string | null;
  split_parent_invoice_id: string | null;
};

type InvoiceLineItem = InvoiceEligibilityLineItem & {
  invoice_id: string;
};

export default async function InvoiceBatchPaymentPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const businessSlug = resolvedSearchParams.business ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;
  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();
  const business = businessData as Business | null;
  const loadIssues: string[] = [];
  let invoices: Invoice[] = [];
  let lineItems: InvoiceLineItem[] = [];

  if (businessError) {
    loadIssues.push("Workspace details could not be loaded.");
  }

  if (business?.id) {
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, display_id, customer_name, project_title, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, due_date, split_parent_invoice_id"
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (invoiceError) {
      loadIssues.push("Invoices could not be loaded.");
    } else {
      invoices = (invoiceData ?? []) as Invoice[];
    }

    const invoiceIds = invoices.map((invoice) => invoice.id);
    if (invoiceIds.length > 0) {
      const { data: lineItemData, error: lineItemError } = await supabase
        .from("invoice_line_items")
        .select("invoice_id, description, quantity, unit_price, line_total")
        .in("invoice_id", invoiceIds);

      if (lineItemError) {
        loadIssues.push("Invoice line-item readiness could not be loaded.");
      } else {
        lineItems = (lineItemData ?? []) as InvoiceLineItem[];
      }
    }
  }

  const splitChildrenByParentId = new Map<string, number>();
  invoices.forEach((invoice) => {
    if (!invoice.split_parent_invoice_id) return;
    splitChildrenByParentId.set(
      invoice.split_parent_invoice_id,
      (splitChildrenByParentId.get(invoice.split_parent_invoice_id) ?? 0) + 1
    );
  });
  const lineItemsByInvoiceId = lineItems.reduce((itemsById, item) => {
    const current = itemsById.get(item.invoice_id) ?? [];
    current.push(item);
    itemsById.set(item.invoice_id, current);
    return itemsById;
  }, new Map<string, InvoiceEligibilityLineItem[]>());
  const payableInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      split_children_count: splitChildrenByParentId.get(invoice.id) ?? 0,
    }))
    .filter((invoice) =>
      isPaymentEligibleInvoice({
        invoice,
        lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
      })
    );

  return (
    <AppShell>
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-300">
              Invoices
            </p>
            <h1 className="mt-2 text-4xl font-bold leading-tight">
              Batch Payment
            </h1>
          </div>
          <Link href={`/payments${businessQuery}`}>
            <Button variant="secondary" className="w-full sm:w-auto">
              Open Payments
            </Button>
          </Link>
        </div>

        <InvoiceWorkspaceNav businessSlug={businessSlug} active="batch-payment" />

        {loadIssues.length > 0 ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Batch payment notice
            </p>
            <div className="mt-2 space-y-1 text-sm leading-6 text-amber-100/90">
              {loadIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          </Card>
        ) : null}

        {payableInvoices.length === 0 ? (
          <Card className="border-sky-500/25 bg-sky-500/5">
            <p className="text-lg font-black text-white">
              No collectible invoices are ready for batch payment.
            </p>
          </Card>
        ) : (
          <InvoiceBulkPaymentActions
            businessSlug={businessSlug}
            invoices={payableInvoices.map((invoice) => ({
              id: invoice.id,
              displayId: invoice.display_id ?? "Invoice",
              customerName: invoice.customer_name ?? "Unknown Customer",
              projectTitle: invoice.project_title ?? "Untitled Invoice",
              invoiceAmount: moneyNumber(invoice.invoice_amount),
              amountPaid: moneyNumber(invoice.amount_paid),
              collectionAmountDue: invoiceCollectionAmountDue(invoice),
              status: invoice.status ?? "Draft",
              dueDate: invoice.due_date,
            }))}
          />
        )}
      </div>
    </AppShell>
  );
}

