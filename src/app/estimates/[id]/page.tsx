import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import ConvertEstimateToInvoiceButton from "../../components/ConvertEstimateToInvoiceButton";
import { supabase } from "../../lib/supabase";

type SupabaseEstimate = {
  id: string;
  business_id: string | null;
  display_id: string | null;
  queue_item_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  estimate_amount: string | null;
  notes: string | null;
  status: string | null;
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
    const { data: businessData } =
      await supabase
        .from("businesses")
        .select("id, slug")
        .eq("id", estimate.business_id)
        .single();

    const business =
      businessData as Business | null;

    if (business?.slug) {
      businessSlug = business.slug;
    }
  }

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, display_id, status")
    .eq("estimate_id", estimate.id)
    .maybeSingle();

  const linkedInvoice =
    invoiceData as LinkedInvoice | null;

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href={`/estimates?business=${businessSlug}`}
          className="text-sm text-orange-400"
        >
          ← Back to Estimates
        </Link>

        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Estimate Details
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {estimate.project_title ||
              "Untitled Estimate"}
          </h1>

          <p className="mt-2 text-zinc-400">
            {estimate.display_id ??
              "Estimate"}
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
                  {linkedInvoice.display_id ??
                    "Invoice"}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {linkedInvoice.status ??
                    "Draft"}
                </p>
              </div>

              <Link
                href={`/invoices/${linkedInvoice.id}`}
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
              value={
                estimate.customer_name ?? ""
              }
            />

            <Info
              label="Status"
              value={
                estimate.status ?? "Draft"
              }
            />

            <Info
              label="Project Address"
              value={
                estimate.project_address ??
                ""
              }
            />

            <Info
              label="Estimate Amount"
              value={
                estimate.estimate_amount ??
                ""
              }
            />
          </div>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Scope of Work
          </p>

          <p className="mt-3 leading-7 text-zinc-300">
            {estimate.notes ||
              "No scope of work added."}
          </p>
        </Card>

        <div className="flex flex-wrap gap-4">
          {estimate.queue_item_id && (
            <Link
              href={`/queue/${estimate.queue_item_id}`}
            >
              <Button variant="secondary">
                Open Queue Item
              </Button>
            </Link>
          )}

          <Link
            href={`/estimates/${estimate.id}/print`}
          >
            <Button variant="secondary">
              Print Estimate
            </Button>
          </Link>

          {!linkedInvoice && (
            <Link
              href={`/estimates/${estimate.id}/edit`}
            >
              <Button variant="secondary">
                Edit Estimate
              </Button>
            </Link>
          )}

          {linkedInvoice ? (
            <Link
              href={`/invoices/${linkedInvoice.id}`}
            >
              <Button>
                Open Invoice
              </Button>
            </Link>
          ) : (
            <ConvertEstimateToInvoiceButton
              estimateId={estimate.id}
              businessId={
                estimate.business_id ?? ""
              }
              customerName={
                estimate.customer_name ?? ""
              }
              projectTitle={
                estimate.project_title ?? ""
              }
              invoiceAmount={
                estimate.estimate_amount ?? ""
              }
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
        {value || "—"}
      </p>
    </div>
  );
}