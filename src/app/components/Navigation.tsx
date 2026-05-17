import Link from "next/link";

export default function Navigation() {
  return (
    <nav className="mb-8 flex items-center justify-between rounded-3xl border border-zinc-800 bg-zinc-900 px-6 py-4 shadow-lg">

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 font-bold text-black">
          T
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <p className="text-sm text-zinc-400">
            Operations Platform
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm font-medium">

        <Link
          href="/"
          className="rounded-xl px-4 py-2 text-zinc-300 transition hover:bg-zinc-800"
        >
          Dashboard
        </Link>

        <Link
          href="/invoices"
          className="rounded-xl px-4 py-2 text-zinc-300 transition hover:bg-zinc-800"
        >
          Invoices
        </Link>

        <Link
          href="/estimates"
          className="rounded-xl px-4 py-2 text-zinc-300 transition hover:bg-zinc-800"
        >
          Estimates
        </Link>

      </div>
    </nav>
  );
}