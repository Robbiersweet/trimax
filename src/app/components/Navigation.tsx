import Link from "next/link";

export default function Navigation() {
  return (
    <nav className="mb-8 flex items-center justify-between rounded-3xl border border-zinc-800 bg-zinc-900/80 px-5 py-4">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 font-bold text-black">
          T
        </div>

        <div>
          <p className="text-sm font-bold tracking-[0.25em] text-orange-400">
            TRIMAX
          </p>
          <p className="text-xs text-zinc-300">Operations Platform</p>
        </div>
      </Link>

      <div className="flex gap-6 text-sm font-medium text-zinc-300">
        <Link href="/" className="hover:text-orange-400">
          Dashboard
        </Link>

        <Link href="/queue" className="hover:text-orange-400">
          Queue
        </Link>

        <Link href="/estimates" className="hover:text-orange-400">
          Estimates
        </Link>

        <Link href="/invoices" className="hover:text-orange-400">
          Invoices
        </Link>
      </div>
    </nav>
  );
}