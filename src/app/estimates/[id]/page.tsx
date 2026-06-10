import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import ConvertEstimateToInvoiceButton from "../../components/ConvertEstimateToInvoiceButton";
import DeleteEstimateButton from "../../components/DeleteEstimateButton";
import OutlookDraftPrepCard from "../../components/OutlookDraftPrepCard";
import SplitInvoicePlanner from "../../components/SplitInvoicePlanner";
import { buildOutlookDraftPreview } from "../../lib/outlookDrafts";
import { buildSplitInvoicePlan } from "../../lib/splitInvoices";
import { supabase } from "../../lib/supabase";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
} from "../../utils/tax";
import { maybeCanonicalApartmentUnitLabel } from "../../utils/unitLabels";

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
  estimate_amount: number | string | null;
  tax_mode: string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  tax_number: string | null;
  split_warning_enabled: boolean | null;
  split_target_amount: number | string | null;
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
  split_warning_amount: number | string | null;
};

function toNumber(value: number | string | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCurrency(value: number | string | null) {
  return toNumber(value);
}

function formatCurrency(amount: number) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `$${safeAmount.toFixed(2)}`;
}

export default async function EstimateDetailsPage({
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

  const { data: selectedBusinessData } = await supabase
    .from("businesses")
    .select("id, slug, split_warning_amount")
    .eq("slug", requestedBusinessSlug)
    .limit(1)
    .maybeSingle();

  const selectedBusiness =
    selectedBusinessData as Business | null;

  if (!selectedBusiness) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Selected business was not found.
          </p>
        </Card>
      </AppShell>
    );
  }

  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .eq("business_id", selectedBusiness.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-400">
            Estimate not found for this workspace.
          </p>
        </Card>
      </AppShell>
    );
  }

  const estimate = data as SupabaseEstimate;
  const businessSlug = selectedBusiness.slug;
  const splitWarningAmount = toNumber(
    selectedBusiness.split_warning_amount ?? null
  );

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

  const taxRate = getEffectiveTaxRate({
    taxMode: estimate.tax_mode,
    taxRate: estimate.tax_rate,
  });
  const taxAmount = subtotal * (taxRate / 100);
  const estimateTotal = subtotal + taxAmount;

  const effectiveSplitTargetAmount =
    toNumber(estimate.split_target_amount) ||
    splitWarningAmount;
  const splitPlan = buildSplitInvoicePlan({
    subtotalAmount: subtotal,
    targetAmount: effectiveSplitTargetAmount,
    taxRate,
  });
  const isOverSplitWarning =
    Boolean(estimate.split_warning_enabled) &&
    splitPlan.length > 0;
  const outlookDraftPreview = buildOutlookDraftPreview("estimate", {
    businessSlug,
    customerName: estimate.customer_name,
    documentNumber: estimate.display_id,
    projectTitle: estimate.project_title,
    amountDue: formatCurrency(estimateTotal),
    serviceAddress:
      estimate.service_address || estimate.project_address,
    reference: maybeCanonicalApartmentUnitLabel(estimate.reference),
  });

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, display_id, status")
    .eq("estimate_id", estimate.id)
    .eq("business_id", selectedBusiness.id)
    .limit(1);

  const linkedInvoice = ((invoiceData ?? []) as LinkedInvoice[])[0] ?? null;

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

        {isOverSplitWarning && (
          <Card className="border-yellow-500/60 bg-yellow-500/10">
            <p className="text-sm uppercase tracking-[0.25em] text-yellow-300">
              Split Warning
            </p>

            <p className="mt-2 text-lg font-semibold text-yellow-100">
              This estimate would be over{" "}
              {formatCurrency(effectiveSplitTargetAmount)} after tax.
            </p>

            <p className="mt-2 text-sm leading-6 text-yellow-100/80">
              Converting this estimate will create split invoice drafts that
              stay under the target including tax.
            </p>
          </Card>
        )}

        {isOverSplitWarning && !linkedInvoice && (
          <SplitInvoicePlanner
            subtotalAmount={subtotal}
            targetAmount={effectiveSplitTargetAmount}
            taxLabel={estimate.tax_label || "Tax"}
            taxRate={taxRate}
            taxMode={estimate.tax_mode}
            taxNumber={estimate.tax_number}
          />
        )}

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

        <OutlookDraftPrepCard
          documentLabel="Estimate"
          preview={outlookDraftPreview}
          printHref={`/estimates/${estimate.id}/print?business=${businessSlug}`}
        />

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
              value={maybeCanonicalApartmentUnitLabel(estimate.reference)}
            />

            <Info
              label="Estimate Total"
              value={formatCurrency(estimateTotal)}
            />

            <Info
              label="Split Target"
              value={
                estimate.split_warning_enabled && effectiveSplitTargetAmount > 0
                  ? formatCurrency(effectiveSplitTargetAmount)
                  : "-"
              }
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
              label={formatTaxSummaryLabel({
                label: estimate.tax_label,
                rate: taxRate,
                taxNumber: estimate.tax_number,
                taxMode: estimate.tax_mode,
              })}
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
              splitTargetAmount={effectiveSplitTargetAmount}
            />
          )}

          {!linkedInvoice ? (
            <DeleteEstimateButton
              estimateId={estimate.id}
              businessId={estimate.business_id}
              estimateLabel={
                estimate.display_id ||
                estimate.project_title ||
                estimate.customer_name ||
                "Estimate"
              }
              returnHref={`/estimates?business=${businessSlug}`}
            />
          ) : (
            <span className="rounded-2xl border border-zinc-700 px-5 py-3 text-sm font-bold text-zinc-500">
              Delete disabled while linked to invoice
            </span>
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
