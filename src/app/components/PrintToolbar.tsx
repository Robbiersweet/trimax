"use client";

import Link from "next/link";
import BackButton from "./BackButton";

type PrintToolbarProps = {
  backHref: string;
  backLabel: string;
  documentLabel?: string;
  documentTitle?: string;
  alternateHref?: string;
  alternateLabel?: string;
  downloadHref?: string;
  downloadLabel?: string;
  suggestedFileName?: string;
};

export default function PrintToolbar({
  backHref,
  backLabel,
  documentLabel = "Customer document",
  documentTitle,
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
    <div className="print-preview-toolbar sticky top-0 z-10 border-b border-slate-200 bg-white/92 px-4 py-3 text-slate-950 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton
            label={backLabel.toLowerCase().startsWith("back to") ? "Back" : backLabel}
            fallbackHref={backHref}
            className="rounded-full border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
          />

          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-sky-700">
              {documentLabel}
            </p>
            <p className="truncate text-sm font-black text-slate-950">
              {documentTitle || suggestedFileName || "Ready to print"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {alternateHref && alternateLabel ? (
            <Link
              href={alternateHref}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {alternateLabel}
            </Link>
          ) : null}

          {downloadHref && downloadLabel ? (
            <a
              href={downloadHref}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 shadow-sm hover:bg-emerald-100"
            >
              {downloadLabel}
            </a>
          ) : null}

          <button
            type="button"
            onClick={handlePrint}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] hover:bg-blue-700"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
