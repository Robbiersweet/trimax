import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "../lib/supabase";

type Invoice = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | null;
  status: string | null;
  due_date: string | null;
};

export default async function InvoicesPage() {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
  }

  const invoices = (data ?? []) as Invoice[];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Invoices
            </h1>
          </div>

          <Link href="/invoices/new">
            <Button>
              + New Invoice
            </Button>
          </Link>
        </div>

        {invoices.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No invoices created yet.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
              >
                <Card className="transition hover:border-orange-500/60 hover:bg-zinc-800">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-orange-400">
                        {invoice.display_id ?? "Invoice"}
                      </p>

                      <h2 className="mt-1 text-2xl font-semibold">
                        {invoice.project_title || "Untitled Invoice"}
                      </h2>

                      <p className="mt-1 text-zinc-400">
                        {invoice.customer_name || "Unknown Customer"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-bold text-orange-400">
                        {invoice.invoice_amount || "$0"}
                      </p>

                      <div className="mt-2">
                        <StatusBadge
                          status={invoice.status || "Draft"}
                        />
                      </div>

                      <p className="mt-2 text-sm text-zinc-400">
                        {invoice.due_date || "No Due Date"}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}