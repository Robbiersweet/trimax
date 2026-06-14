"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function EstimateErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") || "rnl-creations";
  const backHref = `/estimates?business=${encodeURIComponent(businessSlug)}`;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/30 bg-red-500/10 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-200">
          Estimate Error
        </p>
        <h1 className="mt-3 text-3xl font-black">
          This estimate could not load.
        </h1>
        <p className="mt-3 leading-7 text-red-50/80">
          Trimax hit a page error while opening this estimate. The record is
          not deleted; one saved field likely needs cleanup.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Retry estimate
          </button>

          <Link
            href={backHref}
            className="rounded-2xl bg-zinc-800 px-5 py-3 font-semibold text-white"
          >
            Back to estimates
          </Link>
        </div>
      </div>
    </main>
  );
}
