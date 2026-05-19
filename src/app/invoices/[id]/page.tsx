import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import StatusBadge from "../../components/StatusBadge";
import { invoices } from "../../data/invoices";

export default async function InvoiceDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = invoices.find((invoice) => invoice.id === id);

  if (!invoice) {
    return (
      <AppShell>
        <p className="text-red-400">Invoice not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/invoices"
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Invoices
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Invoice Details
            </p>
            <h1 className="mt-2 text-4xl font-bold">{invoice.project}</h1>
            <p className="mt-2 text-zinc-400">{invoice.displayId}</p>
          </div>

          <StatusBadge status={invoice.status} />
        </div>

        {invoice.linkedEstimateId && (
          <Card className="border-purple-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Linked Estimate
            </p>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-lg font-semibold">
                {invoice.linkedEstimateId}
              </p>

              <Link href={`/estimates/${invoice.linkedEstimateId}`}>
                <Button variant="secondary">Open Estimate</Button>
              </Link>
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info label="Customer" value={invoice.customer} />
            <Info label="Amount" value={invoice.amount} />
            <Info label="Due Date" value={invoice.dueDate} />
            <Info label="Invoice Number" value={invoice.displayId} />
          </div>

          <div className="mt-6">
            <p className="text-sm text-zinc-500">Description</p>
            <p className="mt-2 leading-7 text-zinc-300">
              {invoice.description}
            </p>
          </div>
        </Card>

        <div className="flex gap-4">
          <Button>Apply Payment</Button>
          <Button variant="secondary">Send Reminder</Button>
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
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}