import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import ClientSmartSearch from "../components/ClientSmartSearch";
import DeleteClientButton from "../components/DeleteClientButton";
import { isCollectibleInvoiceStatus } from "../lib/invoiceLifecycle";
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

type RelationshipSignal = {
  client: Client;
  score: number;
  label: string;
  detail: string;
  tone: "ready" | "collect" | "proposal" | "cleanup";
  href: string;
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

function clientContactGaps(client: Client) {
  const gaps: string[] = [];

  if (!client.email?.trim().includes("@")) {
    gaps.push("email");
  }

  if (!client.phone?.trim()) {
    gaps.push("phone");
  }

  if (!client.service_address?.trim() && !client.billing_address?.trim()) {
    gaps.push("address");
  }

  return gaps;
}

function relationshipScore(client: Client, summary: ClientSummary | undefined) {
  const contactGaps = clientContactGaps(client).length;
  const contactPoints = 3 - contactGaps;
  const hasWorkHistory =
    (summary?.linkedInvoices ?? 0) + (summary?.linkedEstimates ?? 0) > 0;

  return Math.max(
    0,
    Math.min(
      100,
      contactPoints * 22 +
        Math.min(summary?.linkedInvoices ?? 0, 4) * 5 +
        Math.min(summary?.linkedEstimates ?? 0, 4) * 4 +
        (hasWorkHistory ? 14 : 0) -
        ((summary?.openBalance ?? 0) > 0 ? 8 : 0)
    )
  );
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
    .select("id, name, slug")
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
          .select(
            "id, name, contact_name, email, phone, billing_address, service_address"
          )
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

    if (!isCollectibleInvoiceStatus(status)) {
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
  const clientReadiness = clients.reduce(
    (readiness, client) => {
      const summary = clientSummaries[client.id];
      const hasEmail = client.email?.trim().includes("@") ?? false;
      const hasPhone = Boolean(client.phone?.trim());
      const hasAddress = Boolean(
        client.service_address?.trim() || client.billing_address?.trim()
      );

      readiness.totalOpenBalance += summary?.openBalance ?? 0;
      readiness.activeEstimateTotal += summary?.activeEstimates ?? 0;

      if (hasEmail) {
        readiness.clientsWithEmail += 1;
      }

      if (hasPhone) {
        readiness.clientsWithPhone += 1;
      }

      if (hasAddress) {
        readiness.clientsWithAddress += 1;
      }

      if (hasEmail && hasPhone && hasAddress) {
        readiness.contactReadyClients += 1;
      }

      if ((summary?.openBalance ?? 0) > 0) {
        readiness.clientsWithOpenBalances += 1;
      }

      return readiness;
    },
    {
      activeEstimateTotal: 0,
      clientsWithAddress: 0,
      clientsWithEmail: 0,
      clientsWithOpenBalances: 0,
      clientsWithPhone: 0,
      contactReadyClients: 0,
      totalOpenBalance: 0,
    }
  );
  const {
    activeEstimateTotal,
    clientsWithAddress,
    clientsWithEmail,
    clientsWithOpenBalances,
    clientsWithPhone,
    contactReadyClients,
    totalOpenBalance,
  } = clientReadiness;
  const clientsByOpenBalance = [...clients].sort(
    (first, second) =>
      (clientSummaries[second.id]?.openBalance ?? 0) -
      (clientSummaries[first.id]?.openBalance ?? 0)
  );
  const topBalanceClient = clientsByOpenBalance[0];
  const recentlyActiveClients = clientsByOpenBalance.slice(0, 3);
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
  const relationshipSignals: RelationshipSignal[] = clients
    .map<RelationshipSignal>((client) => {
      const summary = clientSummaries[client.id];
      const gaps = clientContactGaps(client);
      const score = relationshipScore(client, summary);
      const hasOpenBalance = (summary?.openBalance ?? 0) > 0;
      const hasActiveEstimates = (summary?.activeEstimates ?? 0) > 0;

      if (hasOpenBalance) {
        const params = new URLSearchParams({
          business: businessSlug,
          customer: client.name,
        });

        return {
          client,
          score,
          label: "Collection ready",
          detail: `${formatMoney(summary?.openBalance ?? 0)} open across ${
            summary?.openInvoices ?? 0
          } invoice${(summary?.openInvoices ?? 0) === 1 ? "" : "s"}.`,
          tone: "collect",
          href: `/payments?${params.toString()}#batch-payment-tool`,
        };
      }

      if (hasActiveEstimates) {
        return {
          client,
          score,
          label: "Proposal follow-up",
          detail: `${summary?.activeEstimates ?? 0} active estimate${
            (summary?.activeEstimates ?? 0) === 1 ? "" : "s"
          } still open.`,
          tone: "proposal",
          href: `/clients/${client.id}${businessQuery}`,
        };
      }

      if (gaps.length > 0) {
        return {
          client,
          score,
          label: "Contact cleanup",
          detail: `Missing ${gaps.join(", ")}.`,
          tone: "cleanup",
          href: `/clients/${client.id}/edit${businessQuery}`,
        };
      }

      return {
        client,
        score,
        label: "Ready account",
        detail: "Contact details are complete and ready for future work.",
        tone: "ready",
        href: `/clients/${client.id}${businessQuery}`,
      };
    })
    .sort((first, second) => {
      const tonePriority = {
        collect: 4,
        proposal: 3,
        cleanup: 2,
        ready: 1,
      };

      if (tonePriority[second.tone] !== tonePriority[first.tone]) {
        return tonePriority[second.tone] - tonePriority[first.tone];
      }

      return second.score - first.score;
    });
  const topRelationshipSignals = relationshipSignals.slice(0, 4);
  const relationshipReadyCount = relationshipSignals.filter(
    (signal) => signal.tone === "ready"
  ).length;
  const cleanupNeededCount = relationshipSignals.filter(
    (signal) => signal.tone === "cleanup"
  ).length;
  const relationshipAverage =
    relationshipSignals.length > 0
      ? Math.round(
          relationshipSignals.reduce((total, signal) => total + signal.score, 0) /
            relationshipSignals.length
        )
      : 0;
  const clientHealthCards = [
    {
      label: "Contact Ready",
      value: `${contactReadyClients}/${clients.length}`,
      detail:
        clients.length > 0
          ? `${clientsWithEmail} email, ${clientsWithPhone} phone, ${clientsWithAddress} address.`
          : "Add clients to build a reusable customer book.",
      href: `/clients${businessQuery}#client-results`,
      tone: "info",
    },
    {
      label: "Payment Follow-up",
      value: formatMoney(totalOpenBalance),
      detail:
        clientsWithOpenBalances > 0
          ? `${clientsWithOpenBalances} client${
              clientsWithOpenBalances === 1 ? "" : "s"
            } with open balances.`
          : "No client balances need collection right now.",
      href: `/payments${businessQuery}#batch-payment-tool`,
      tone: clientsWithOpenBalances > 0 ? "warning" : "success",
    },
    {
      label: "Estimate Follow-up",
      value: String(activeEstimateTotal),
      detail:
        activeEstimateTotal > 0
          ? "Open proposals are ready for follow-up or conversion."
          : "No active estimate follow-up needed.",
      href: `/estimates${businessQuery}#estimate-results`,
      tone: activeEstimateTotal > 0 ? "success" : "info",
    },
    {
      label: "Top Account",
      value: topBalanceClient?.name ?? "Not enough data",
      detail: topBalanceClient
        ? `${formatMoney(
            clientSummaries[topBalanceClient.id]?.openBalance ?? 0
          )} currently open.`
        : "Top client appears once invoices exist.",
      href: topBalanceClient
        ? `/clients/${topBalanceClient.id}${businessQuery}`
        : `/clients/new${businessQuery}`,
      tone: "info",
    },
  ];

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

          <div className="client-health-panel mt-6 rounded-3xl border border-white/10 bg-zinc-950/70 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.28em] text-sky-300">
                  Client Health
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">
                  Customer book readiness
                </h2>
              </div>

              <p className="text-sm text-zinc-400">
                Accounting and follow-up signal
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {clientHealthCards.map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  data-tone={card.tone}
                  className="client-health-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-sky-300/60"
                >
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                    {card.label}
                  </p>
                  <p className="mt-3 line-clamp-2 text-2xl font-black text-white">
                    {card.value}
                  </p>
                  <p className="mt-2 min-h-[3rem] text-sm leading-6 text-zinc-400">
                    {card.detail}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="client-relationship-panel mt-6 rounded-3xl border border-white/10 bg-zinc-950/70 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-200">
                  Relationship Signal
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">
                  Account readiness and follow-up
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  Trimax checks client contact completeness, open balances, and active proposals so the next account move is obvious.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[24rem]">
                <div className="client-relationship-stat rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Avg Readiness
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {relationshipAverage}%
                  </p>
                </div>
                <div className="client-relationship-stat rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Ready
                  </p>
                  <p className="mt-2 text-2xl font-black text-emerald-100">
                    {relationshipReadyCount}
                  </p>
                </div>
                <div className="client-relationship-stat rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Cleanup
                  </p>
                  <p className="mt-2 text-2xl font-black text-amber-100">
                    {cleanupNeededCount}
                  </p>
                </div>
              </div>
            </div>

            {topRelationshipSignals.length > 0 ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                {topRelationshipSignals.map((signal) => (
                  <Link
                    key={signal.client.id}
                    href={signal.href}
                    data-tone={signal.tone}
                    className="client-relationship-card rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">
                          {signal.client.name}
                        </p>
                        <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                          {signal.label}
                        </p>
                      </div>
                      <span className="client-relationship-score rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-black text-emerald-100">
                        {signal.score}%
                      </span>
                    </div>

                    <p className="mt-3 min-h-[2.75rem] text-sm leading-6 text-zinc-400">
                      {signal.detail}
                    </p>
                  </Link>
                ))}
              </div>
            ) : null}
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
                  href={`/payments${businessQuery}#batch-payment-tool`}
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
                            href={`/payments?${paymentParams.toString()}#batch-payment-tool`}
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
                              ? `/invoices?${invoiceParams.toString()}#invoice-results`
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
          <ClientSmartSearch
            clients={clients}
            businessSlug={businessSlug}
            initialSearchTerm={searchTerm}
          />
        </Card>

        <div id="client-results" className="scroll-mt-6">
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
              const contactGaps = clientContactGaps(client);
              const clientScore = relationshipScore(client, summary);

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

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="client-signal-chip rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-100">
                          {clientScore}% ready
                        </span>
                        {contactGaps.length > 0 ? (
                          <span className="client-signal-chip rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-100">
                            Missing {contactGaps.join(", ")}
                          </span>
                        ) : (
                          <span className="client-signal-chip rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-100">
                            Contact ready
                          </span>
                        )}
                      </div>
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
                        href={`/payments?${paymentParams.toString()}#batch-payment-tool`}
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
