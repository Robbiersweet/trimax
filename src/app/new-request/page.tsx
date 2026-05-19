import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import BackButton from "../components/BackButton";

export default function NewRequestPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <BackButton label="Back" />

        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <h1 className="mt-3 text-5xl font-bold">New Request</h1>
        </div>

        <Card>
          <p className="text-zinc-400">
            Create a new estimate, invoice, or work order.
          </p>

          <div className="mt-6 grid gap-4">
            <Link
              href="/estimates/new"
              className="rounded-2xl bg-orange-500 px-4 py-4 text-center font-semibold text-black"
            >
              New Estimate
            </Link>

            <Link
              href="/invoices/new"
              className="rounded-2xl bg-zinc-800 px-4 py-4 text-center font-semibold"
            >
              New Invoice
            </Link>

            <Link
              href="/queue/new"
              className="rounded-2xl bg-zinc-800 px-4 py-4 text-center font-semibold"
            >
              New Work Order
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}