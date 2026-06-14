import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import DeleteClientButton from "../components/DeleteClientButton";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
};

type Invoice = {
  client_id: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  status: string | null;
};

type Estimate = {
  client_id: string | null;
  status: string | null;
};

type ClientSummary = {
  openBalance: number;
  openInvoices: number;
  activeEstimates: number;
  linkedEstimates: number;
  linkedInvoices: number;
};

function parseMoney(value: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};

  const businessSlug =
    resolvedSearchParams.business ??
    "rnl-creations";
  const searchTerm =
    resolvedSearchParams.q?.trim() ?? "";
  const businessQuery = `?business=${businessSlug}`;

  const { data: businessData } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", businessSlug)
    .single();

  const selectedBusiness =
    businessData as Business | null;

  let clients: Client[] = [];
  let invoices: Invoice[] = [];
  let estimates: Estimate[] = [];

  if (selectedBusiness?.id) {
    const [clientResponse, invoiceResponse, estimateResponse] =
      await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .eq("business_id", selectedBusiness.id)
          .order("created_at", {
            ascending: false,
          }),
        supabase
          .from("invoices")
          .select("client_id, invoice_amount, amount_paid, status")
          .eq("business_id", selectedBusiness.id),
        supabase
          .from("estimates")
          .select("client_id, status")
          .eq("business_id", selectedBusiness.id),
      ]);

    clients = (clientResponse.data ?? []) as Client[];
    invoices = (invoiceResponse.data ?? []) as Invoice[];
    estimates = (estimateResponse.data ?? []) as Estimate[];
  }

  const clientSummaries = clients.reduce<Record<string, ClientSummary>>(
    (summaries, client) => {
      summaries[client.id] = {
        openBalance: 0,
        openInvoices: 0,
        activeEstimates: 0,
        linkedEstimates: 0,
        linkedInvoices: 0,
      };

      return summaries;
    },
    {}
  );

  invoices.forEach((invoice) => {
    if (!invoice.client_id || !clientSummaries[invoice.client_id]) {
      return;
    }

    const status = (invoice.status || "Draft").toLowerCase();

    clientSummaries[invoice.client_id].linkedInvoices += 1;

    if (status === "paid") {
      return;
    }

    const amountDue = Math.max(
      parseMoney(invoice.invoice_amount) - parseMoney(invoice.amount_paid),
      0
    );

    clientSummaries[invoice.client_id].openInvoices += 1;
    clientSummaries[invoice.client_id].openBalance += amountDue;
  });

  estimates.forEach((estimate) => {
    if (!estimate.client_id || !clientSummaries[estimate.client_id]) {
      return;
    }

    const status = (estimate.status || "Draft").toLowerCase();

    clientSummaries[estimate.client_id].linkedEstimates += 1;

    if (status === "converted" || status === "declined") {
      return;
    }

    clientSummaries[estimate.client_id].activeEstimates += 1;
  });

  const filteredClients = clients.filter((client) => {
    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      client.name,
      client.contact_name,
      client.email,
      client.phone,
      client.billing_address,
      client.service_address,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm.toLowerCase());
  });
  const totalOpenBalance = clients.reduce(
    (total, client) =>
      total + (clientSummaries[client.id]?.openBalance ?? 0),
    0
  );
  const clientsWithOpenBalances = clients.filter(
    (client) => (clientSummaries[client.id]?.openBalance ?? 0) > 0
  ).length;
  const activeEstimateTotal = clients.reduce(
    (total, client) =>
      total + (clientSummaries[client.id]?.activeEstimates ?? 0),
    0
  );
  const recentlyActiveClients = [...clients]
    .sort((first, second) => {
      const firstSummary = clientSummaries[first.id];
      const secondSummary = clientSummaries[second.id];

      return (
        (secondSummary?.openBalance ?? 0) -
        (firstSummary?.openBalance ?? 0)
      );
    })
    .slice(0, 3);
  const clientCommandQueue = [...clients]
    .filter((client) => {
      const summary = clientSummaries[client.id];

      return (
        (summary?.openBalance ?? 0) > 0 ||
        (summary?.activeEstimates ?? 0) > 0
      );
    })
    .sort((first, second) => {
      const firstSummary = clientSummaries[first.id];
      const secondSummary = clientSummaries[second.id];

      if ((secondSummary?.openBalance ?? 0) !== (firstSummary?.openBalance ?? 0)) {
        return (
          (secondSummary?.openBalance ?? 0) -
          (firstSummary?.openBalance ?? 0)
        );
      }

      return (
        (secondSummary?.activeEstimates ?? 0) -
        (firstSummary?.activeEstimates ?? 0)
      );
    })
    .slice(0, 4);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Clients
            </h1>

            <p className="mt-2 text-zinc-400">
              Customer address book for{" "}
              {selectedBusiness?.name ??
                "selected business"}
              .
            </p>
          </div>

          <Link
            href={`/clients/new${businessQuery}`}
          >
            <Button>
              + New Client
            </Button>
          </Link>
        </div>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-blue-300">
                Client Snapshot
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Client info at your fingertips
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                A Trimax overview: see who has
                open balances, who has active estimates, and which clients are
                ready for the next operations step.
              </p>
            </div>

            <Link href={`/clients/new${businessQuery}`}>
              <Button>New Client</Button>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="app-metric-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">
                Total Outstanding
              </p>

              <p className="mt-2 text-3xl font-black text-white">
                {formatMoney(totalOpenBalance)}
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                Across open client invoices.
              </p>
            </div>

            <div className="client-followup-card rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
              <p className="text-sm text-orange-100/80">
                Clients With Balances
              </p>

              <p className="mt-2 text-3xl font-black text-orange-100">
                {clientsWithOpenBalances}
              </p>

              <p className="mt-1 text-sm text-orange-100/60">
                Good targets for payment follow-up.
              </p>
            </div>

            <div className="client-estimate-card rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-100/80">
                Active Estimates
              </p>

              <p className="mt-2 text-3xl font-black text-emerald-100">
                {activeEstimateTotal}
              </p>

              <p className="mt-1 text-sm text-emerald-100/60">
                Work still in proposal stage.
              </p>
            </div>
          </div>

          {clientCommandQueue.length > 0 ? (
            <div className="mt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                    Client Command Queue
                  </p>

                  <h2 className="mt-2 text-xl font-bold">
                    Best client follow-ups
                  </h2>
                </div>

                <Link
                  href={`/payments${businessQuery}`}
                  className="text-sm font-semibold text-sky-300 transition hover:text-sky-100"
                >
                  Open payment workspace
                </Link>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-4">
                {clientCommandQueue.map((client) => {
                  const summary = clientSummaries[client.id];
                  const paymentParams = new URLSearchParams({
                    business: businessSlug,
                    customer: client.name,
                  });
                  const invoiceParams = new URLSearchParams({
                    business: businessSlug,
                    customer: client.name,
                    collection: "open",
                  });
                  const hasOpenBalance = (summary?.openBalance ?? 0) > 0;

                  return (
                    <div
                      key={client.id}
                      className="client-command-card rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">
                            {client.name}
                          </p>
                          <p className="mt-1 text-sm text-zinc-400">
                            {hasOpenBalance
                              ? `${summary.openInvoices} open invoice${
                                  summary.openInvoices === 1 ? "" : "s"
                                }`
                              : `${summary?.activeEstimates ?? 0} active estimate${
                                  (summary?.activeEstimates ?? 0) === 1
                                    ? ""
                                    : "s"
                                }`}
                          </p>
                        </div>

                        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-sky-100">
                          {hasOpenBalance ? "Collect" : "Estimate"}
                        </span>
                      </div>

                      <p className="mt-4 text-2xl font-black text-white">
                        {hasOpenBalance
                          ? formatMoney(summary.openBalance)
                          : `${summary?.activeEstimates ?? 0} active`}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {hasOpenBalance ? (
                          <Link
                            href={`/payments?${paymentParams.toString()}`}
                            className="rounded-full bg-sky-400 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-sky-300"
                          >
                            Record Payment
                          </Link>
                        ) : (
                          <Link
                            href={`/estimates/new${businessQuery}&clientId=${client.id}`}
                            className="rounded-full bg-emerald-400 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
                          >
                            New Estimate
                          </Link>
                        )}

                        <Link
                          href={
                            hasOpenBalance
                              ? `/invoices?${invoiceParams.toString()}`
                              : `/clients/${client.id}${businessQuery}`
                          }
                          className="rounded-full border border-white/15 px-3 py-2 text-sm font-semibold text-white transition hover:border-sky-200 hover:bg-white/10"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold">
                Recently active
              </h2>

              <p className="text-sm text-zinc-400">
                {clients.length} total client{clients.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <Link
                href={`/clients/new${businessQuery}`}
                className="client-add-card flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/60 p-4 text-center transition hover:border-orange-400 hover:text-orange-300"
              >
                <span className="text-3xl font-light text-orange-400">
                  +
                </span>

                <span className="mt-2 font-bold">
                  New Client
                </span>
              </Link>

              {recentlyActiveClients.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}${businessQuery}`}
                  className="client-mini-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-900"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-purple-400/40 bg-purple-500/10 text-sm font-black text-purple-200">
                      {client.name.slice(0, 2).toUpperCase()}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {client.name}
                      </p>

                      <p className="mt-1 truncate text-sm text-zinc-400">
                        {client.contact_name || "No contact"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-zinc-400">
                    Open balance
                  </p>

                  <p className="mt-1 text-lg font-black text-orange-300">
                    {formatMoney(
                      clientSummaries[client.id]?.openBalance ?? 0
                    )}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <form
            action="/clients"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input
              type="hidden"
              name="business"
              value={businessSlug}
            />

            <div>
              <label className="app-form-label mb-2 block text-sm text-zinc-400">
                Search Clients
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search name, contact, email, phone, or address"
                className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button type="submit">Search</Button>

              {searchTerm ? (
                <Link href={`/clients${businessQuery}`}>
                  <Button variant="secondary">
                    Clear
                  </Button>
                </Link>
              ) : null}
            </div>
          </form>
        </Card>

        {clients.length === 0 ? (
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-white">
                  No clients have been added yet.
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Add a client once, then reuse that customer on estimates,
                  invoices, payments, and reports for this workspace.
                </p>
              </div>

              <Link href={`/clients/new${businessQuery}`}>
                <Button>New Client</Button>
              </Link>
            </div>
          </Card>
        ) : filteredClients.length === 0 ? (
          <Card>
            <p className="font-semibold text-white">
              No clients match that search.
            </p>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Try a shorter search, or clear the search to return to the full
              client list.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  All Clients
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Client list
                </h2>
              </div>

              <p className="text-sm text-zinc-400">
                Showing {filteredClients.length} of {clients.length} client
                {clients.length === 1 ? "" : "s"}.
              </p>
            </div>

            {filteredClients.map((client) => {
              const summary = clientSummaries[client.id];
              const paymentParams = new URLSearchParams({
                business: businessSlug,
                customer: client.name,
              });
              const hasOpenBalance = (summary?.openBalance ?? 0) > 0;

              return (
                <Card
                  key={client.id}
                  className="client-list-card transition hover:border-orange-500/60 hover:bg-zinc-800"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold">
                        {client.name}
                      </h2>

                      <p className="mt-2 text-zinc-400">
                        {client.contact_name ||
                          "No contact"}
                      </p>

                      <p className="mt-2 max-w-xl text-sm text-zinc-500">
                        {client.service_address ||
                          client.billing_address ||
                          "No address"}
                      </p>
                    </div>

                    <div className="text-right text-sm text-zinc-400">
                      <p>
                        {client.email ||
                          "No email"}
                      </p>

                      <p className="mt-2">
                        {client.phone ||
                          "No phone"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-3">
                    <SummaryPill
                      label="Open Balance"
                      value={formatMoney(
                        summary?.openBalance ?? 0
                      )}
                      tone={
                        (summary?.openBalance ?? 0) > 0
                          ? "orange"
                          : "zinc"
                      }
                    />

                    <SummaryPill
                      label="Open Invoices"
                      value={String(
                        summary?.openInvoices ?? 0
                      )}
                      tone={
                        (summary?.openInvoices ?? 0) > 0
                          ? "blue"
                          : "zinc"
                      }
                    />

                    <SummaryPill
                      label="Active Estimates"
                      value={String(
                        summary?.activeEstimates ?? 0
                      )}
                      tone={
                        (summary?.activeEstimates ?? 0) > 0
                          ? "emerald"
                          : "zinc"
                      }
                    />
                  </div>

                  <div className="client-next-action mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                      Next Best Action
                    </p>

                    <p className="mt-2 text-sm font-semibold text-white">
                      {hasOpenBalance
                        ? `Collect ${formatMoney(summary?.openBalance ?? 0)} from open invoices.`
                        : (summary?.activeEstimates ?? 0) > 0
                          ? "Follow up on active estimates or convert approved work."
                          : "Client profile is ready for the next estimate or invoice."}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                    <Link
                      href={`/clients/${client.id}${businessQuery}`}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
                    >
                      Open
                    </Link>

                    <Link
                      href={`/clients/${client.id}/edit${businessQuery}`}
                      className="app-button-secondary rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                    >
                      Edit
                    </Link>

                    <Link
                      href={`/estimates/new${businessQuery}&clientId=${client.id}`}
                      className="app-button-secondary rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                    >
                      New Estimate
                    </Link>

                    <Link
                      href={`/invoices/new${businessQuery}&clientId=${client.id}`}
                      className="app-button-secondary rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                    >
                      New Invoice
                    </Link>

                    {hasOpenBalance ? (
                      <Link
                        href={`/payments?${paymentParams.toString()}`}
                        className="payment-action-button rounded-xl border px-4 py-2 text-sm font-bold transition"
                      >
                        Record Payment
                      </Link>
                    ) : null}

                    <DeleteClientButton
                      clientId={client.id}
                      clientName={client.name}
                      linkedEstimateCount={
                        clientSummaries[client.id]?.linkedEstimates ?? 0
                      }
                      linkedInvoiceCount={
                        clientSummaries[client.id]?.linkedInvoices ?? 0
                      }
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "orange" | "blue" | "emerald" | "zinc";
}) {
  const toneClasses = {
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-200",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    zinc: "border-zinc-800 bg-zinc-950 text-zinc-300",
  };

  return (
    <div className={`rounded-2xl border p-3 ${toneClasses[tone]}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-lg font-black">
        {value}
      </p>
    </div>
  );
}
