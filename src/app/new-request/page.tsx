import Link from "next/link";
import AppShell from "../components/AppShell";
export default function NewRequestPage() {
  return (
   <AppShell>
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          New Request
        </h1>

        <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
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

            <button className="rounded-2xl bg-zinc-800 px-4 py-4 font-semibold">
              New Invoice
            </button>

            <button className="rounded-2xl bg-zinc-800 px-4 py-4 font-semibold">
              New Work Order
            </button>
          </div>
        </div>
    </AppShell>
  );
}