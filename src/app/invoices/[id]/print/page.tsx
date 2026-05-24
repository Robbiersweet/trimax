import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type Invoice = {
  id: string;
  client_id: string | null;
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
  service_address: string | null;
  split_parent_invoice_id: string | null;
  split_sequence: number | null;
  split_count: number | null;
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

type Business = {
  id: string;
  name: string | null;
  slug: string | null;
};

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
};

function toNumber(value: number | string | null) {
  return Number(value) || 0;
}

function parseCurrency(value: string | null) {
  return Number(value?.replace(/[^0-9.]/g, "") ?? 0) || 0;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ business?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const businessSlug =
    resolvedSearchParams.business ?? "rnl-creations";

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Invoice not found.</p>
      </main>
    );
  }

  const invoice = data as Invoice;

  const { data: businessData } = invoice.business_id
    ? await supabase
        .from("businesses")
        .select("id, name, slug")
        .eq("id", invoice.business_id)
        .single()
    : { data: null };

  const business = businessData as Business | null;

  const { data: clientData } = invoice.client_id
    ? await supabase
        .from("clients")
        .select("*")
        .eq("id", invoice.client_id)
        .single()
    : { data: null };

  const client = clientData as Client | null;

  const { data: lineItemData } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("sort_order", {
      ascending: true,
    });

  const lineItems =
    (lineItemData ?? []) as InvoiceLineItem[];

  const subtotalFromLineItems = lineItems.reduce(
    (total, item) =>
      total + toNumber(item.line_total),
    0
  );

  const subtotal =
    subtotalFromLineItems > 0
      ? subtotalFromLineItems
      : parseCurrency(invoice.invoice_amount);

  const taxRate = toNumber(invoice.tax_rate);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const amountPaid = toNumber(invoice.amount_paid);
  const amountDue = Math.max(total - amountPaid, 0);

  const companyName =
    business?.name || "R&L Creations";

  const billedToName =
    client?.name || invoice.customer_name || "Customer";

  const billedToAddress =
    client?.billing_address || "";

  const serviceAddress =
    invoice.service_address || "";

  const documentTitle =
    invoice.project_title || invoice.customer_name || "Invoice";

  const splitLabel =
    invoice.split_parent_invoice_id &&
    invoice.split_sequence &&
    invoice.split_count
      ? `Split ${invoice.split_sequence} of ${invoice.split_count}`
      : "";

  return (
    <main className="min-h-screen bg-white px-8 py-8 text-black print:p-0">
      <div className="mx-auto max-w-5xl bg-white print:max-w-none print:px-6 print:py-4">
        <section className="grid grid-cols-2 gap-8">
          <div>
            <div className="flex h-32 w-32 items-center justify-center bg-black text-center text-white print:h-28 print:w-28">
              <div>
                <p className="text-3xl font-black print:text-2xl">
                  R&L
                </p>

                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em]">
                  Creations
                </p>
              </div>
            </div>
          </div>

          <div className="text-right text-base leading-6">
            <p className="font-semibold">
              {companyName}
            </p>

            <p>(425) 350-4898</p>
            <p>1011 90th St SW #B</p>
            <p>Everett, WA 98204</p>
          </div>
        </section>

        <section className="mt-10 border-y border-gray-200 py-6 print:mt-8 print:py-5">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[#d9aa2f]">
                Invoice
              </p>

              <h1 className="mt-3 text-4xl font-semibold leading-tight print:text-3xl">
                {documentTitle}
              </h1>

              {splitLabel ? (
                <p className="mt-2 text-lg text-gray-600">
                  {splitLabel}
                </p>
              ) : null}
            </div>

            <div className="text-right">
              <PrintLabel>Amount Due (USD)</PrintLabel>

              <p className="mt-2 text-5xl font-light tracking-wide print:text-4xl">
                {formatCurrency(amountDue)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10 grid grid-cols-[1.5fr_1fr_1fr_1.4fr] gap-8 print:mt-8">
          <div>
            <PrintLabel>Billed To</PrintLabel>

            <p className="mt-2 text-base leading-6">
              {billedToName}
            </p>

            {billedToAddress && (
              <p className="whitespace-pre-line text-base leading-6">
                {billedToAddress}
              </p>
            )}

            {serviceAddress ? (
              <div className="mt-5">
                <PrintLabel>Service Address</PrintLabel>

                <p className="mt-2 whitespace-pre-line text-base leading-6">
                  {serviceAddress}
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <PrintLabel>Date of Issue</PrintLabel>

            <p className="mt-2 text-base">
              {formatDate(invoice.issue_date)}
            </p>

            <div className="mt-5">
              <PrintLabel>Due Date</PrintLabel>

              <p className="mt-2 text-base">
                {formatDate(invoice.due_date)}
              </p>
            </div>
          </div>

          <div>
            <PrintLabel>Invoice Number</PrintLabel>

            <p className="mt-2 text-base">
              {invoice.display_id || "Invoice"}
            </p>

            <div className="mt-5">
              <PrintLabel>Reference</PrintLabel>

              <p className="mt-2 whitespace-pre-line text-base leading-6">
                {invoice.reference || "-"}
              </p>
            </div>
          </div>

          <div />
        </section>

        <section className="mt-10 print:mt-8">
          <div className="border-t-4 border-[#e8bd3f] pt-4">
            <div className="grid grid-cols-[1fr_160px_90px_150px] gap-6 text-[#d9aa2f]">
              <p>Description</p>
              <p className="text-right">Rate</p>
              <p className="text-right">Qty</p>
              <p className="text-right">Line Total</p>
            </div>
          </div>

          <div className="mt-5 border-b border-gray-300 pb-5">
            {lineItems.length === 0 ? (
              <div className="grid grid-cols-[1fr_160px_90px_150px] gap-6">
                <p>{invoice.project_title || "Service"}</p>
                <p className="text-right">
                  {formatCurrency(subtotal)}
                </p>
                <p className="text-right">1</p>
                <p className="text-right">
                  {formatCurrency(subtotal)}
                </p>
              </div>
            ) : (
              <div className="grid gap-5">
                {lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_160px_90px_150px] gap-6"
                  >
                    <p className="whitespace-pre-line leading-7">
                      {item.description || "Line item"}
                    </p>

                    <p className="text-right">
                      {formatCurrency(
                        toNumber(item.unit_price)
                      )}
                    </p>

                    <p className="text-right">
                      {toNumber(item.quantity)}
                    </p>

                    <p className="text-right">
                      {formatCurrency(
                        toNumber(item.line_total)
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto mt-8 w-full max-w-md">
            <PrintSummaryRow
              label="Subtotal"
              value={formatCurrency(subtotal)}
            />

            <PrintSummaryRow
              label={`${invoice.tax_label || "Tax"} (${taxRate}%)`}
              value={formatCurrency(taxAmount)}
            />

            <div className="mt-4 border-t border-gray-300 pt-4">
              <PrintSummaryRow
                label="Total"
                value={formatCurrency(total)}
              />

              <PrintSummaryRow
                label="Amount Paid"
                value={formatCurrency(amountPaid)}
              />
            </div>

            <div className="mt-3 border-t-4 border-double border-gray-300 pt-5">
              <div className="flex items-center justify-between gap-6">
                <p className="text-xl text-[#d9aa2f]">
                  Amount Due (USD)
                </p>

                <p className="text-xl font-semibold">
                  {formatCurrency(amountDue)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 print:mt-10">
          <PrintLabel>Terms</PrintLabel>

          <p className="mt-3 max-w-4xl text-base leading-6">
            {invoice.terms ||
              "Payment due upon invoice. Thank you for your business."}
          </p>
        </section>

        {invoice.notes && (
          <section className="mt-8">
            <PrintLabel>Notes</PrintLabel>

            <p className="mt-3 max-w-4xl whitespace-pre-line text-base leading-6">
              {invoice.notes}
            </p>
          </section>
        )}

        <div className="mt-12 print:hidden">
          <Link
            href={`/invoices/${invoice.id}?business=${businessSlug}`}
            className="text-orange-600 underline"
          >
            Back to Invoice
          </Link>
        </div>
      </div>
    </main>
  );
}

function PrintLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="text-lg text-[#d9aa2f]">
      {children}
    </p>
  );
}

function PrintSummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-1 text-lg">
      <p>{label}</p>

      <p>{value}</p>
    </div>
  );
}
