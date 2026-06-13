import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import DeleteClientButton from "../../components/DeleteClientButton";
import InternalNotes from "../../components/InternalNotes";
import StatusBadge from "../../components/StatusBadge";
import { supabase } from "../../lib/supabase";

type Client = {
  id: string;
  business_id: string | null;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
  notes: string | null;
};

type Business = {
  id: string;
  name: string;
  slug: string;
};

type Estimate = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  estimate_amount: string | number | null;
  status: string | null;
  created_at: string | null;
};

type Invoice = {
  id: string;
  display_id: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  status: string | null;
  due_date: string | null;
  created_at: string | null;
};

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(parseMoney(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function ClientDetailsPage({
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
  const businessQuery = `?business=${businessSlug}`;

  const { data: businessData } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  const selectedBusiness =
    businessData as Business | null;

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
    .from("clients")
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
            Client not found for {selectedBusiness.name}.
          </p>
        </Card>
      </AppShell>
    );
  }

  const client = data as Client;

  const [estimateResponse, invoiceResponse] = await Promise.all([
    supabase
      .from("estimates")
      .select(
        "id, display_id, project_title, estimate_amount, status, created_at"
      )
      .eq("business_id", selectedBusiness.id)
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("invoices")
      .select(
        "id, display_id, project_title, invoice_amount, amount_paid, status, due_date, created_at"
      )
      .eq("business_id", selectedBusiness.id)
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const estimates = (estimateResponse.data ?? []) as Estimate[];
  const invoices = (invoiceResponse.data ?? []) as Invoice[];

  const openInvoices = invoices.filter(
    (invoice) => (invoice.status || "Draft").toLowerCase() !== "paid"
  );

  const openBalance = openInvoices.reduce((total, invoice) => {
    return (
      total +
      Math.max(
        parseMoney(invoice.invoice_amount) - parseMoney(invoice.amount_paid),
        0
      )
    );
  }, 0);

  const estimateTotal = estimates.reduce(
    (total, estimate) => total + parseMoney(estimate.estimate_amount),
    0
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href={`/clients${businessQuery}`}
          className="app-back-button inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold text-orange-400 hover:text-orange-300"
        >
          &lt; Back to Clients
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Client Details
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {client.name}
            </h1>

            <p className="mt-2 text-zinc-400">
              {selectedBusiness.name}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/clients/${client.id}/edit${businessQuery}`}
            >
              <Button variant="secondary">
                Edit Client
              </Button>
            </Link>

            <Link
              href={`/estimates/new${businessQuery}&clientId=${client.id}`}
            >
              <Button variant="secondary">
                Create Estimate
              </Button>
            </Link>

            <Link
              href={`/invoices/new${businessQuery}&clientId=${client.id}`}
            >
              <Button>
                Create Invoice
              </Button>
            </Link>

            <DeleteClientButton
              clientId={client.id}
              clientName={client.name}
              linkedEstimateCount={estimates.length}
              linkedInvoiceCount={invoices.length}
              returnHref={`/clients${businessQuery}`}
            />
          </div>
        </div>

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info
              label="Contact Name"
              value={client.contact_name}
            />

            <Info label="Email" value={client.email} />

            <Info label="Phone" value={client.phone} />

            <Info
              label="Billing Address"
              value={client.billing_address}
            />

            <Info
              label="Default Service Address"
              value={
                client.service_address ||
                client.billing_address
              }
            />
          </div>

          <div className="mt-6">
            <p className="text-sm text-zinc-500">
              Notes
            </p>

            <p className="mt-2 leading-7 text-zinc-300">
              {client.notes || "No notes added."}
            </p>
          </div>
        </Card>

        <InternalNotes
          businessId={selectedBusiness.id}
          entityType="client"
          entityId={client.id}
          title="Client Conversation"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="client-followup-card border-orange-500/30 bg-orange-500/10">
            <p className="text-sm text-zinc-400">
              Open Balance
            </p>

            <p className="mt-3 text-3xl font-black text-orange-300">
              {formatMoney(openBalance)}
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              Unpaid balance from recent open invoices.
            </p>
          </Card>

          <Card className="border-blue-500/30 bg-blue-500/10">
            <p className="text-sm text-zinc-400">
              Recent Estimates
            </p>

            <p className="mt-3 text-3xl font-black">
              {estimates.length}
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              {formatMoney(estimateTotal)} in the latest estimate records.
            </p>
          </Card>

          <Card className="border-emerald-500/30 bg-emerald-500/10">
            <p className="text-sm text-zinc-400">
              Recent Invoices
            </p>

            <p className="mt-3 text-3xl font-black">
              {invoices.length}
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              {openInvoices.length} still open in the latest records.
            </p>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Estimates
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Recent Estimates
                </h2>
              </div>

              <Link
                href={`/estimates/new${businessQuery}&clientId=${client.id}`}
              >
                <Button variant="secondary">
                  New Estimate
                </Button>
              </Link>
            </div>

            <div className="app-data-table mt-5 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
              {estimates.length > 0 ? (
                estimates.map((estimate) => (
                  <Link
                    key={estimate.id}
                    href={`/estimates/${estimate.id}${businessQuery}`}
                    className="app-data-table-row grid gap-3 bg-zinc-950 p-4 transition hover:bg-zinc-900 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-bold">
                        {estimate.display_id || "Estimate"}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {estimate.project_title || client.name}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        Created {formatDate(estimate.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 sm:justify-end">
                      <StatusBadge status={estimate.status || "Draft"} />
                      <p className="font-bold text-orange-300">
                        {formatMoney(estimate.estimate_amount)}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="app-empty-state bg-zinc-950 p-4 text-zinc-400">
                  No estimates for this client yet.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Invoices
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Recent Invoices
                </h2>
              </div>

              <Link
                href={`/invoices/new${businessQuery}&clientId=${client.id}`}
              >
                <Button variant="secondary">
                  New Invoice
                </Button>
              </Link>
            </div>

            <div className="app-data-table mt-5 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
              {invoices.length > 0 ? (
                invoices.map((invoice) => {
                  const amountDue = Math.max(
                    parseMoney(invoice.invoice_amount) -
                      parseMoney(invoice.amount_paid),
                    0
                  );

                  return (
                    <Link
                      key={invoice.id}
                      href={`/invoices/${invoice.id}${businessQuery}`}
                      className="app-data-table-row grid gap-3 bg-zinc-950 p-4 transition hover:bg-zinc-900 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-bold">
                          {invoice.display_id || "Invoice"}
                        </p>

                        <p className="mt-1 text-sm text-zinc-400">
                          {invoice.project_title || client.name}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          Due {formatDate(invoice.due_date)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 sm:justify-end">
                        <StatusBadge status={invoice.status || "Draft"} />
                        <p className="font-bold text-orange-300">
                          {formatMoney(amountDue)}
                        </p>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="app-empty-state bg-zinc-950 p-4 text-zinc-400">
                  No invoices for this client yet.
                </div>
              )}
            </div>
          </Card>
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
