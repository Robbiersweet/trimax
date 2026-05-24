import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import DeleteInvoiceButton from "../../components/DeleteInvoiceButton";
import UpdateInvoiceStatusButton from "../../components/UpdateInvoiceStatusButton";
import { supabase } from "../../lib/supabase";

type Invoice = {
  id: string;
  estimate_id: string | null;
  business_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | null;
  status: string | null;
  display_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  reference: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  amount_paid: number | string | null;
  terms: string | null;
  notes: string | null;
};

type InvoiceLineItem = {
  id: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
  project_title: string | null;
};

type Business = {
  id: string;
  slug: string;
};

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function toNumber(value: number | string | null) {
  return Number(value) || 0;
}

export default async function InvoiceDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <AppShell>
        <p className="text-red-400">
          Invoice not found.
        </p>
      </AppShell>
    );
  }

  const invoice = data as Invoice;
  const invoiceStatus = invoice.status || "Draft";

  let businessSlug = "rnl-creations";

  if (invoice.business_id) {
    const { data: businessData } =
      await supabase
        .from("businesses")
        .select("id, slug")
        .eq("id", invoice.business_id)
        .single();

    const business =
      businessData as Business | null;

    if (business?.slug) {
      businessSlug = business.slug;
    }
  }

  const { data: lineItemData } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("sort_order", {
      ascending: true,
    });

  const lineItems =
    (lineItemData ?? []) as InvoiceLineItem[];

  const subtotal = lineItems.reduce(
    (total, item) =>
      total + toNumber(item.line_total),
    0
  );

  const fallbackSubtotal =
    subtotal > 0
      ? subtotal
      : toNumber(
          invoice.invoice_amount?.replace(
            /[^0-9.]/g,
            ""
          ) ?? null
        );

  const taxRate = toNumber(invoice.tax_rate);
  const taxAmount =
    fallbackSubtotal * (taxRate / 100);
  const invoiceTotal =
    fallbackSubtotal + taxAmount;
  const amountPaid = toNumber(invoice.amount_paid);
  const amountDue =
    invoiceTotal - amountPaid;

  let linkedEstimate: LinkedEstimate | null =
    null;

  if (invoice.estimate_id) {
    const { data: estimateData } =
      await supabase
        .from("estimates")
        .select(
          "id, display_id, project_title"
        )
        .eq("id", invoice.estimate_id)
        .single();

    linkedEstimate =
      estimateData as LinkedEstimate | null;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href={`/invoices?business=${businessSlug}`}
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          Back to Invoices
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Invoice Details
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {invoice.project_title ||
                "Untitled Invoice"}
            </h1>

            <p className="mt-2 text-zinc-400">
              {invoice.display_id ||
                "Invoice"}
            </p>
          </div>

          <StatusBadge
            status={invoiceStatus}
          />
        </div>

        {linkedEstimate && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Estimate
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">
                  {linkedEstimate.display_id ??
                    "Estimate"}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {linkedEstimate.project_title ??
                    "No project title"}
                </p>
              </div>

              <Link
                href={`/estimates/${linkedEstimate.id}?business=${businessSlug}`}
              >
                <Button variant="secondary">
                  Open Estimate
                </Button>
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info
              label="Customer"
              value={invoice.customer_name}
            />

            <Info
              label="Amount Due"
              value={formatCurrency(amountDue)}
            />

            <Info
              label="Issue Date"
              value={invoice.issue_date}
            />

            <Info
              label="Due Date"
              value={invoice.due_date}
            />

            <Info
              label="Invoice Number"
              value={invoice.display_id}
            />

            <Info
              label="Reference"
              value={invoice.reference}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">
              Line Items
            </h2>

            <p className="text-2xl font-bold text-orange-400">
              {formatCurrency(amountDue)}
            </p>
          </div>

          {lineItems.length === 0 ? (
            <p className="mt-4 text-zinc-400">
              No line items added.
            </p>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
              <div className="grid grid-cols-[1fr_90px_120px_120px] gap-4 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-400">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Total</span>
              </div>

              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_90px_120px_120px] gap-4 border-b border-zinc-800 px-4 py-4 last:border-b-0"
                >
                  <span>
                    {item.description || "Line item"}
                  </span>

                  <span className="text-right text-zinc-300">
                    {toNumber(item.quantity)}
                  </span>

                  <span className="text-right text-zinc-300">
                    {formatCurrency(
                      toNumber(item.unit_price)
                    )}
                  </span>

                  <span className="text-right font-semibold text-orange-400">
                    {formatCurrency(
                      toNumber(item.line_total)
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="ml-auto mt-6 grid max-w-sm gap-3 text-sm">
            <SummaryRow
              label="Subtotal"
              value={formatCurrency(fallbackSubtotal)}
            />

            <SummaryRow
              label={`${invoice.tax_label || "Tax"} (${taxRate}%)`}
              value={formatCurrency(taxAmount)}
            />

            <SummaryRow
              label="Total"
              value={formatCurrency(invoiceTotal)}
            />

            <SummaryRow
              label="Amount Paid"
              value={formatCurrency(amountPaid)}
            />

            <div className="border-t border-zinc-700 pt-3">
              <SummaryRow
                label="Amount Due"
                value={formatCurrency(amountDue)}
                strong
              />
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Notes
          </p>

          <p className="mt-2 leading-7 text-zinc-300">
            {invoice.notes ||
              "No notes added."}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Terms
          </p>

          <p className="mt-2 leading-7 text-zinc-300">
            {invoice.terms ||
              "No terms added."}
          </p>
        </Card>

        <div className="flex flex-wrap gap-4">
          {invoiceStatus === "Draft" && (
            <UpdateInvoiceStatusButton
              invoiceId={invoice.id}
              newStatus="Sent"
              label="Mark Sent"
            />
          )}

          {invoiceStatus === "Sent" && (
            <UpdateInvoiceStatusButton
              invoiceId={invoice.id}
              newStatus="Paid"
              label="Mark Paid"
            />
          )}

          {invoiceStatus !== "Paid" && (
            <Button variant="secondary">
              Send Reminder
            </Button>
          )}

          <Link
            href={`/invoices/${invoice.id}/print?business=${businessSlug}`}
          >
            <Button variant="secondary">
              Print Invoice
            </Button>
          </Link>

          <Link
            href={`/invoices/${invoice.id}/edit?business=${businessSlug}`}
          >
            <Button variant="secondary">
              Edit Invoice
            </Button>
          </Link>

          <DeleteInvoiceButton
            invoiceId={invoice.id}
          />
        </div>
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-medium">
        {value || "-"}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "text-lg font-bold text-orange-400" : ""
      }`}
    >
      <span className="text-zinc-400">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>
    </div>
  );
}