import Link from "next/link";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import Card from "../../components/Card";
import InvoiceBatchSendActions from "../../components/InvoiceBatchSendActions";
import InvoiceWorkspaceNav from "../../components/InvoiceWorkspaceNav";
import {
  invoiceSendIneligibleReason,
  isIncompleteDraftInvoice,
  isSendEligibleInvoice,
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
  client_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  status: string | null;
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
};

type InvoiceLineItem = InvoiceEligibilityLineItem & {
  invoice_id: string;
};

type ClientEmailContact = {
  id: string;
  email: string | null;
};

export default async function InvoiceBatchSendPage({
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
  let clientContacts: ClientEmailContact[] = [];

  if (businessError) {
    loadIssues.push("Workspace details could not be loaded.");
  }

  if (business?.id) {
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, client_id, display_id, customer_name, project_title, invoice_amount, amount_paid, status, split_parent_invoice_id, split_sequence, split_count"
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

    const clientIds = Array.from(
      new Set(
        invoices
          .map((invoice) => invoice.client_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (clientIds.length > 0) {
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, email")
        .eq("business_id", business.id)
        .in("id", clientIds);

      if (clientError) {
        loadIssues.push("Client email contacts could not be loaded.");
      } else {
        clientContacts = (clientData ?? []) as ClientEmailContact[];
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
  const emailByClientId = new Map(
    clientContacts.map((contact) => [contact.id, contact.email])
  );
  const invoicesWithSendContext = invoices.map((invoice) => ({
    ...invoice,
    split_children_count: splitChildrenByParentId.get(invoice.id) ?? 0,
    recipientEmail: invoice.client_id
      ? emailByClientId.get(invoice.client_id) ?? null
      : null,
  }));
  const sendableInvoices = invoicesWithSendContext.filter((invoice) =>
    isSendEligibleInvoice({
      invoice,
      lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
      recipientEmail: invoice.recipientEmail,
    })
  );
  const needsAttention = invoicesWithSendContext
    .filter((invoice) =>
      isIncompleteDraftInvoice({
        invoice,
        lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
      })
    )
    .slice(0, 20);

  return (
    <AppShell>
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
              Invoices
            </p>
            <h1 className="mt-2 text-4xl font-bold leading-tight">
              Batch Send
            </h1>
          </div>
          <Link href={`/invoices${businessQuery}`}>
            <Button variant="secondary" className="w-full sm:w-auto">
              Review Invoices
            </Button>
          </Link>
        </div>

        <InvoiceWorkspaceNav businessSlug={businessSlug} active="batch-send" />

        {loadIssues.length > 0 ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Batch send notice
            </p>
            <div className="mt-2 space-y-1 text-sm leading-6 text-amber-100/90">
              {loadIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          </Card>
        ) : null}

        {sendableInvoices.length === 0 ? (
          <Card className="border-sky-500/25 bg-sky-500/5">
            <p className="text-lg font-black text-white">
              No valid draft invoices are ready to send.
            </p>
          </Card>
        ) : (
          <InvoiceBatchSendActions
            businessSlug={businessSlug}
            businessName={business?.name ?? "Trimax"}
            invoices={sendableInvoices.map((invoice) => ({
              id: invoice.id,
              displayId: invoice.display_id ?? "Invoice",
              customerName: invoice.customer_name ?? "Unknown Customer",
              projectTitle: invoice.project_title ?? "Untitled Invoice",
              invoiceAmount: moneyNumber(invoice.invoice_amount),
              status: invoice.status ?? "Draft",
              recipientEmail: invoice.recipientEmail,
              splitParentInvoiceId: invoice.split_parent_invoice_id,
              splitChildrenCount: invoice.split_children_count,
              splitParentDisplayId: null,
              splitSequence: invoice.split_sequence,
              splitCount: invoice.split_count,
            }))}
          />
        )}

        {needsAttention.length > 0 ? (
          <Card className="border-amber-500/30 bg-amber-500/10">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-200">
              Needs Attention
            </p>
            <div className="mt-4 grid gap-2">
              {needsAttention.map((invoice) => (
                <div
                  key={invoice.id}
                  className="grid gap-3 rounded-2xl border border-amber-300/25 bg-black/25 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-black text-white">
                      {invoice.display_id ?? "Invoice"} -{" "}
                      {invoice.project_title ?? "Untitled Invoice"}
                    </p>
                    <p className="mt-1 text-sm text-amber-100">
                      {invoiceSendIneligibleReason({
                        invoice,
                        lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
                        recipientEmail: invoice.recipientEmail,
                      })}
                    </p>
                  </div>
                  <Link href={`/invoices/${invoice.id}${businessQuery}`}>
                    <Button variant="secondary" className="w-full sm:w-auto">
                      Open Invoice
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

