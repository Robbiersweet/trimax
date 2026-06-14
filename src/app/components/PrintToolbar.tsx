"use client";

import Link from "next/link";

type PrintToolbarProps = {
  backHref: string;
  backLabel: string;
  alternateHref?: string;
  alternateLabel?: string;
  downloadHref?: string;
  downloadLabel?: string;
  suggestedFileName?: string;
};

export default function PrintToolbar({
  backHref,
  backLabel,
  alternateHref,
  alternateLabel,
  downloadHref,
  downloadLabel,
  suggestedFileName,
}: PrintToolbarProps) {
  function handlePrint() {
    if (suggestedFileName) {
      document.title = suggestedFileName;
    }

    window.print();
  }

  return (
    <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-6 py-4 text-black shadow-sm print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
        >
          {backLabel}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          {alternateHref && alternateLabel ? (
            <Link
              href={alternateHref}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              {alternateLabel}
            </Link>
          ) : null}

          {downloadHref && downloadLabel ? (
            <a
              href={downloadHref}
              className="rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              {downloadLabel}
            </a>
          ) : null}

          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
