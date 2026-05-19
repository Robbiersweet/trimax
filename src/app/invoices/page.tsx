import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { invoices } from "../data/invoices";

export default function InvoicesPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>
            <h1 className="mt-2 text-4xl font-bold">Invoices</h1>
          </div>

          <Button>+ New Invoice</Button>
        </div>

        <div className="grid gap-4">
          {invoices.map((invoice) => (
            <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
              <Card className="transition hover:border-orange-500/60 hover:bg-zinc-800">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-orange-400">{invoice.displayId}</p>
                    <h2 className="mt-1 text-2xl font-semibold">
                      {invoice.project}
                    </h2>
                    <p className="mt-1 text-zinc-400">{invoice.customer}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-bold text-orange-400">
                      {invoice.amount}
                    </p>

                    <div className="mt-2">
                      <StatusBadge status={invoice.status} />
                    </div>

                    <p className="mt-2 text-sm text-zinc-400">
                      {invoice.dueDate}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}