import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type Estimate = {
  id: string;
  business_id: string | null;
  client_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  reference: string | null;
  estimate_amount: string | null;
  status: string | null;
  display_id: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  terms: string | null;
  notes: string | null;
};

type EstimateLineItem = {
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

export default async function EstimatePrintPage({
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
  const requestedBusinessSlug =
    resolvedSearchParams.business ?? "rnl-creations";

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>Estimate not found.</p>
      </main>
    );
  }

  const estimate = data as Estimate;

  const { data: businessData } = estimate.business_id
    ? await supabase
        .from("businesses")
        .select("id, name, slug")
        .eq("id", estimate.business_id)
        .single()
    : { data: null };

  const business = businessData as Business | null;
  const businessSlug =
    business?.slug || requestedBusinessSlug;

  const { data: clientData } = estimate.client_id
    ? await supabase
        .from("clients")
        .select("*")
        .eq("id", estimate.client_id)
        .single()
    : { data: null };

  const client = clientData as Client | null;

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
  const total = subtotal + taxAmount;

  const companyName =
    business?.name || "R&L Creations";

  const billedToName =
    client?.name || estimate.customer_name || "Customer";

  const billedToAddress =
    client?.billing_address || "";

  const serviceAddress =
    estimate.service_address ||
    estimate.project_address ||
    "";

  const documentTitle =
    estimate.project_title ||
    estimate.customer_name ||
    "Estimate";

  return (
    <main className="min-h-screen bg-white px-8 py-10 text-black print:p-0">
      <div className="mx-auto max-w-5xl bg-white print:max-w-none">
        <section className="grid grid-cols-2 gap-8">
          <div>
            <div className="flex h-40 w-40 items-center justify-center bg-black text-center text-white">
              <div>
                <p className="text-3xl font-black">
                  R&L
                </p>

                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.2em]">
                  Creations
                </p>
              </div>
            </div>
          </div>

          <div className="text-right text-lg leading-7">
            <p className="font-semibold">
              {companyName}
            </p>

            <p>(425) 350-4898</p>
            <p>1011 90th St SW #B</p>
            <p>Everett, WA 98204</p>
          </div>
        </section>

        <section className="mt-14 border-y border-gray-200 py-8">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-[#d9aa2f]">
                Estimate
              </p>

              <h1 className="mt-3 text-4xl font-semibold leading-tight">
                {documentTitle}
              </h1>

              <p className="mt-2 text-lg text-gray-600">
                {estimate.display_id || "Estimate"}
              </p>
            </div>

            <div className="text-right">
              <PrintLabel>Estimate Total (USD)</PrintLabel>

              <p className="mt-2 text-5xl font-light tracking-wide">
                {formatCurrency(total)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16 grid grid-cols-[1.5fr_1fr_1fr_1.4fr] gap-10">
          <div>
            <PrintLabel>Prepared For</PrintLabel>

            <p className="mt-2 text-lg leading-7">
              {billedToName}
            </p>

            {billedToAddress ? (
              <p className="whitespace-pre-line text-lg leading-7">
                {billedToAddress}
              </p>
            ) : null}

            {serviceAddress ? (
              <div className="mt-8">
                <PrintLabel>Service Address</PrintLabel>

                <p className="mt-2 whitespace-pre-line text-lg leading-7">
                  {serviceAddress}
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <PrintLabel>Status</PrintLabel>

            <p className="mt-2 text-lg">
              {estimate.status || "Draft"}
            </p>
          </div>

          <div>
            <PrintLabel>Estimate Number</PrintLabel>

            <p className="mt-2 text-lg">
              {estimate.display_id || "Estimate"}
            </p>

            <div className="mt-8">
              <PrintLabel>Reference</PrintLabel>

              <p className="mt-2 whitespace-pre-line text-lg leading-7">
                {estimate.reference || "-"}
              </p>
            </div>
          </div>

          <div />
        </section>

        <section className="mt-16">
          <div className="border-t-4 border-[#e8bd3f] pt-5">
            <div className="grid grid-cols-[1fr_160px_90px_150px] gap-6 text-[#d9aa2f]">
              <p>Description</p>
              <p className="text-right">Rate</p>
              <p className="text-right">Qty</p>
              <p className="text-right">Line Total</p>
            </div>
          </div>

          <div className="mt-6 border-b border-gray-300 pb-6">
            {lineItems.length === 0 ? (
              <div className="grid grid-cols-[1fr_160px_90px_150px] gap-6">
                <p>{documentTitle}</p>
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

          <div className="ml-auto mt-10 w-full max-w-lg">
            <PrintSummaryRow
              label="Subtotal"
              value={formatCurrency(subtotal)}
            />

            <PrintSummaryRow
              label={`${estimate.tax_label || "Tax"} (${taxRate}%)`}
              value={formatCurrency(taxAmount)}
            />

            <div className="mt-4 border-t border-gray-300 pt-4">
              <div className="flex items-center justify-between gap-6">
                <p className="text-xl text-[#d9aa2f]">
                  Estimate Total (USD)
                </p>

                <p className="text-xl font-semibold">
                  {formatCurrency(total)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {estimate.notes ? (
          <section className="mt-20">
            <PrintLabel>Scope of Work</PrintLabel>

            <p className="mt-3 max-w-4xl whitespace-pre-line text-lg leading-7">
              {estimate.notes}
            </p>
          </section>
        ) : null}

        <section className="mt-10">
          <PrintLabel>Terms</PrintLabel>

          <p className="mt-3 max-w-4xl text-lg leading-7">
            {estimate.terms ||
              "This estimate is provided for review and approval. Final pricing may vary if scope, materials, or site conditions change."}
          </p>
        </section>

        <div className="mt-12 print:hidden">
          <Link
            href={`/estimates/${estimate.id}?business=${businessSlug}`}
            className="text-orange-600 underline"
          >
            Back to Estimate
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
