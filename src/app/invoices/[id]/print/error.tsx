"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function InvoicePrintErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") || "rnl-creations";
  const backHref = `/invoices?business=${encodeURIComponent(businessSlug)}`;

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-700">
          Print Error
        </p>
        <h1 className="mt-3 text-3xl font-black">
          This invoice print page could not load.
        </h1>
        <p className="mt-3 leading-7 text-red-950/80">
          Trimax could not prepare the printable invoice. The invoice itself is
          not deleted; this usually means one saved field needs to be cleaned up.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl bg-orange-500 px-5 py-3 font-semibold text-black"
          >
            Retry print page
          </button>

          <Link
            href={backHref}
            className="rounded-2xl bg-zinc-900 px-5 py-3 font-semibold text-white"
          >
            Back to invoices
          </Link>
        </div>
      </div>
    </main>
  );
}
