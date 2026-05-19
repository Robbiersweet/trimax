import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { estimates } from "../../data/estimates";
import { invoices } from "../../data/invoices";

export default async function EstimateDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const estimate = estimates.find((estimate) => estimate.id === id);

  const linkedInvoice = invoices.find(
    (invoice) => invoice.linkedEstimateId === id
  );

  if (!estimate) {
    return (
      <AppShell>
        <p className="text-red-400">Estimate not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/estimates"
          className="inline-flex items-center text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Estimates
        </Link>

        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Estimate Details
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {estimate.project}
          </h1>

          <p className="mt-2 text-zinc-400">
            {estimate.displayId}
          </p>
        </div>

        {linkedInvoice && (
          <Card className="border-emerald-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
              Linked Invoice
            </p>

            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">
                  {linkedInvoice.displayId}
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  {linkedInvoice.status}
                </p>
              </div>

              <Link href={`/invoices/${linkedInvoice.id}`}>
                <Button variant="secondary">
                  Open Invoice
                </Button>
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-zinc-500">Customer</p>

              <p className="mt-1 text-lg font-medium">
                {estimate.customer}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">Status</p>

              <p className="mt-1 text-lg font-medium">
                {estimate.status}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">
                Project Address
              </p>

              <p className="mt-1 text-lg font-medium">
                {estimate.address}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">
                Estimate Amount
              </p>

              <p className="mt-1 text-lg font-medium text-orange-400">
                {estimate.amount}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">
            Scope of Work
          </p>

          <p className="mt-3 leading-7 text-zinc-300">
            {estimate.description}
          </p>
        </Card>

        <div className="flex gap-4">
          {!linkedInvoice ? (
            <Link href="/invoices">
              <Button>Convert to Invoice</Button>
            </Link>
          ) : (
            <Link href={`/invoices/${linkedInvoice.id}`}>
              <Button>Open Invoice</Button>
            </Link>
          )}

          <Link href={`/estimates/${estimate.id}/print`}>
            <Button variant="secondary">
              Print Estimate
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}