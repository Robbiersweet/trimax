import Link from "next/link";
import AppShell from "./components/AppShell";
import Card from "./components/Card";
import Button from "./components/Button";
import StatusBadge from "./components/StatusBadge";
import { supabase } from "./lib/supabase";

type QueueItem = {
  id: string;
  property: string | null;
  unit: string | null;
  paint_type: string | null;
  flooring: string | null;
  status: string | null;
};

type Estimate = {
  id: string;
  project_title: string | null;
  customer_name: string | null;
  status: string | null;
};

type Invoice = {
  id: string;
  project_title: string | null;
  customer_name: string | null;
  invoice_amount: string | null;
  status: string | null;
};

export default async function DashboardPage() {
  const selectedBusiness = "R&L Creations";

  const [
    queueResponse,
    estimateResponse,
    invoiceResponse,
  ] = await Promise.all([
    supabase
      .from("queue_items")
      .select("*")
      .order("created_at", { ascending: false }),

    supabase
      .from("estimates")
      .select("*")
      .order("created_at", { ascending: false }),

    supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const queueItems = (queueResponse.data ?? []) as QueueItem[];
  const estimates = (estimateResponse.data ?? []) as Estimate[];
  const invoices = (invoiceResponse.data ?? []) as Invoice[];

  const activeQueueItems = queueItems.filter(
    (item) => item.status !== "Scheduled"
  );

  const pendingEstimates = estimates.filter(
    (estimate) => estimate.status !== "Approved"
  );

  const openInvoices = invoices.filter(
    (invoice) => invoice.status !== "Paid"
  );

  const outstandingRevenueTotal = openInvoices.reduce((total, invoice) => {
    const numericAmount = Number(
      invoice.invoice_amount?.replace(/[^0-9.-]+/g, "") || 0
    );

    return total + numericAmount;
  }, 0);

  const outstandingRevenue = outstandingRevenueTotal.toLocaleString(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }
  );

  const quickActions = [
    {
      title: "New Queue Item",
      subtitle: "Add apartment turn or work request",
      href: "/new-request",
      icon: "➕",
    },
    {
      title: "New Estimate",
      subtitle: "Create a customer estimate",
      href: "/estimates/new",
      icon: "🧾",
    },
    {
      title: "New Invoice",
      subtitle: "Create invoice or deposit request",
      href: "/invoices",
      icon: "📄",
    },
    {
      title: "Record Payment",
      subtitle: "Apply payment to invoice",
      href: "/invoices",
      icon: "💵",
    },
    {
      title: "Review Queue",
      subtitle: "Check upcoming units",
      href: "/queue",
      icon: "🏠",
    },
    {
      title: "Print Documents",
      subtitle: "Estimates and invoices",
      href: "/estimates",
      icon: "🖨️",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Dashboard
            </h1>

            <p className="mt-2 text-zinc-400">
              Operations overview for {selectedBusiness}.
            </p>
          </div>

          <div className="flex gap-3">
            <button className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white">
              {selectedBusiness} ▾
            </button>

            <button className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-300">
              Robbie ▾
            </button>
          </div>
        </div>

        <Card className="border-orange-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Outstanding Revenue
              </p>

              <h2 className="mt-3 text-5xl font-black tracking-tight">
                {outstandingRevenue}
              </h2>

              <p className="mt-3 text-zinc-400">
                Open invoices, deposits requested, and unpaid balances.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-zinc-400">
                  Open Invoices
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {openInvoices.length}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-zinc-400">
                  Estimates
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {estimates.length}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-zinc-400">
              Active Queue
            </p>

            <p className="mt-2 text-4xl font-bold">
              {activeQueueItems.length}
            </p>

            <Link
              href="/queue"
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View queue →
            </Link>
          </Card>

          <Card>
            <p className="text-sm text-zinc-400">
              Pending Estimates
            </p>

            <p className="mt-2 text-4xl font-bold">
              {pendingEstimates.length}
            </p>

            <Link
              href="/estimates"
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View estimates →
            </Link>
          </Card>

          <Card>
            <p className="text-sm text-zinc-400">
              Open Invoices
            </p>

            <p className="mt-2 text-4xl font-bold">
              {openInvoices.length}
            </p>

            <Link
              href="/invoices"
              className="mt-4 inline-block text-sm text-orange-400"
            >
              View invoices →
            </Link>
          </Card>
        </div>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Next Action
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Review apartment queue items
              </h2>

              <p className="mt-2 text-zinc-400">
                New turns, smoker units, flooring notes, and paint scopes should
                be reviewed before scheduling.
              </p>
            </div>

            <Link href="/queue">
              <Button>
                Review Queue
              </Button>
            </Link>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Action Center
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Quick Actions
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-800"
              >
                <p className="text-3xl">
                  {action.icon}
                </p>

                <p className="mt-3 font-semibold">
                  {action.title}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {action.subtitle}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="text-2xl font-bold">
              Recent Queue Items
            </h2>

            <div className="mt-4 space-y-3">
              {queueItems.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  href={`/queue/${item.id}`}
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 hover:border-orange-500/60"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {item.property} — Unit {item.unit}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {item.paint_type} • {item.flooring}
                      </p>
                    </div>

                    <StatusBadge
                      status={item.status || "Pending"}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-2xl font-bold">
              Recent Invoices
            </h2>

            <div className="mt-4 space-y-3">
              {invoices.slice(0, 3).map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-4 hover:border-orange-500/60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {invoice.project_title || "Untitled Invoice"}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {invoice.customer_name || "Unknown Customer"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-orange-400">
                        {invoice.invoice_amount || "$0"}
                      </p>

                      <p className="text-sm text-zinc-400">
                        {invoice.status || "Draft"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}