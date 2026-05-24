import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import ConvertEstimateToInvoiceButton from "../../components/ConvertEstimateToInvoiceButton";
import { supabase } from "../../lib/supabase";

type SupabaseEstimate = {
  id: string;
  business_id: string | null;
  client_id: string | null;
  display_id: string | null;
  queue_item_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  reference: string | null;
  estimate_amount: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  terms: string | null;
  notes: string | null;
  status: string | null;
};

type EstimateLineItem = {
  id: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type LinkedInvoice = {
  id: string;
  display_id: string | null;
  status: string | null;
};

type Business = {
  id: string;
  slug: string;
};

function toNumber(value: number | string | null) {
  return Number(value) || 0;
}

function parseCurrency(value: string | null) {
  return Number(value?.replace(/[^0-9.]/g, "") ?? 0) || 0;
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export default async function EstimateDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <AppShell>
        <p className="text-red-400">
          Estimate not found.
        </p>
      </AppShell>
    );
  }

  const estimate = data as SupabaseEstimate;

  let businessSlug = "rnl-creations";

  if (estimate.business_id) {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("id, slug")
      .eq("id", estimate.business_id)
      .single();

    const business = businessData as Business | null;

    if (business?.slug) {
      businessSlug = business.slug;
    }
  }

  const { data: lineItemData } = await supabase
    .from("estimate_line_items")
    .select("*")
    .eq("estimate_id", estimate.id)
    .order("sort_order", {
      ascending: true,
    });

  const lineItems =
    (lineItemData ?? []) as EstimateLineItem[];

  const subtotalFromLineItems = lineItems.reduce(
    (total, item) =>
      total + toNumber(item.line_total),
    0
  );

  const subtotal =
    subtotalFromLineItems > 0
      ? subtotalFromLineItems
      : parseCurrency(estimate.estimate_amount);

  const taxRate = toNumber(estimate.tax_rate);
  const taxAmount = subtotal * (taxRate / 100);
  const estimateTotal = subtotal + taxAmount;

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, display_id, status")
    .eq("estimate_id", estimate.id)
    .maybeSingle();

  const linkedInvoice = invoiceData as LinkedInvoice | null;

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href={`/estimates?business=${businessSlug}`}
          className="text-sm text-orange-400"
        >
          Back to Estimates
        </Link>

        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Estimate Details
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {estimate.project_title || "Untitled Estimate"}
          </h1>

          <p className="mt-2 text-zinc-400">
            {estimate.display_id ?? "Estimate"}
          </p>
        </div>

        {linkedInvoice && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Invoice
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">
                  {linkedInvoice.display_id ?? "Invoice"}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {linkedInvoice.status ?? "Draft"}
                </p>
              </div>

              <Link
                href={`/invoices/${linkedInvoice.id}?business=${businessSlug}`}
              >
                <Button variant="secondary">
                  Open Invoice
                </Button>
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info
              label="Customer"
              value={estimate.customer_name ?? ""}
            />

            <Info
              label="Status"
              value={estimate.status ?? "Draft"}
            />

            <Info
              label="Service Address"
              value={
                estimate.service_address ||
                estimate.project_address ||
                ""
              }
            />

            <Info
              label="Reference"
              value={estimate.reference ?? ""}
            />

            <Info
              label="Estimate Total"
              value={formatCurrency(estimateTotal)}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">
              Line Items
            </h2>

            <p className="text-2xl font-bold text-orange-400">
              {formatCurrency(estimateTotal)}
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
              value={formatCurrency(subtotal)}
            />

            <SummaryRow
              label={`${estimate.tax_label || "Tax"} (${taxRate}%)`}
              value={formatCurrency(taxAmount)}
            />

            <div className="border-t border-zinc-700 pt-3">
              <SummaryRow
                label="Estimate Total"
                value={formatCurrency(estimateTotal)}
                strong
              />
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Scope of Work
          </p>

          <p className="mt-3 leading-7 text-zinc-300">
            {estimate.notes || "No scope of work added."}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Terms
          </p>

          <p className="mt-3 leading-7 text-zinc-300">
            {estimate.terms || "No terms added."}
          </p>
        </Card>

        <div className="flex flex-wrap gap-4">
          {estimate.queue_item_id && (
            <Link
              href={`/queue/${estimate.queue_item_id}?business=${businessSlug}`}
            >
              <Button variant="secondary">
                Open Queue Item
              </Button>
            </Link>
          )}

          <Link
            href={`/estimates/${estimate.id}/print?business=${businessSlug}`}
          >
            <Button variant="secondary">
              Print Estimate
            </Button>
          </Link>

          {!linkedInvoice && (
            <Link
              href={`/estimates/${estimate.id}/edit?business=${businessSlug}`}
            >
              <Button variant="secondary">
                Edit Estimate
              </Button>
            </Link>
          )}

          {linkedInvoice ? (
            <Link
              href={`/invoices/${linkedInvoice.id}?business=${businessSlug}`}
            >
              <Button>
                Open Invoice
              </Button>
            </Link>
          ) : (
            <ConvertEstimateToInvoiceButton
              estimateId={estimate.id}
              businessId={estimate.business_id ?? ""}
              businessSlug={businessSlug}
              clientId={estimate.client_id}
              customerName={estimate.customer_name ?? ""}
              projectTitle={estimate.project_title ?? ""}
              invoiceAmount={formatCurrency(estimateTotal)}
              notes={estimate.notes ?? ""}
            />
          )}
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
  value: string;
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