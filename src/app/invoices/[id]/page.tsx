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
  business_id: string | null;
  estimate_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | null;
  status: string | null;
  display_id: string | null;
  due_date: string | null;
  notes: string | null;
};

type Business = {
  id: string;
  name: string;
  slug: string;
};

type LinkedEstimate = {
  id: string;
  display_id: string | null;
  project_title: string | null;
};

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
        <p className="text-red-400">Invoice not found.</p>
      </AppShell>
    );
  }

  const invoice = data as Invoice;
  const invoiceStatus = invoice.status || "Draft";

  let businessSlug = "rnl-creations";

  if (invoice.business_id) {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("id, name, slug")
      .eq("id", invoice.business_id)
      .single();

    const business = businessData as Business | null;

    if (business?.slug) {
      businessSlug = business.slug;
    }
  }

  let linkedEstimate: LinkedEstimate | null = null;

  if (invoice.estimate_id) {
    const { data: estimateData } = await supabase
      .from("estimates")
      .select("id, display_id, project_title")
      .eq("id", invoice.estimate_id)
      .single();

    linkedEstimate = estimateData as LinkedEstimate | null;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href={`/invoices?business=${businessSlug}`}
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Invoices
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Invoice Details
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {invoice.project_title || "Untitled Invoice"}
            </h1>

            <p className="mt-2 text-zinc-400">
              {invoice.display_id || "Invoice"}
            </p>
          </div>

          <StatusBadge status={invoiceStatus} />
        </div>

        {linkedEstimate && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Estimate
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">
                  {linkedEstimate.display_id ?? "Estimate"}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {linkedEstimate.project_title ?? "No project title"}
                </p>
              </div>

              <Link href={`/estimates/${linkedEstimate.id}`}>
                <Button variant="secondary">Open Estimate</Button>
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info label="Customer" value={invoice.customer_name} />
            <Info label="Amount" value={invoice.invoice_amount} />
            <Info label="Due Date" value={invoice.due_date} />
            <Info label="Invoice Number" value={invoice.display_id} />
          </div>

          <div className="mt-6">
            <p className="text-sm text-zinc-500">Description</p>

            <p className="mt-2 leading-7 text-zinc-300">
              {invoice.notes || "No description added."}
            </p>
          </div>
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
            <Button variant="secondary">Send Reminder</Button>
          )}

          <DeleteInvoiceButton invoiceId={invoice.id} />
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
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-medium">{value || "—"}</p>
    </div>
  );
}