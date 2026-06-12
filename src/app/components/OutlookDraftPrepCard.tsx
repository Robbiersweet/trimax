"use client";

import Link from "next/link";
import Button from "./Button";
import Card from "./Card";
import type { OutlookDraftPreview } from "../lib/outlookDrafts";

type OutlookDraftPrepCardProps = {
  documentLabel: "Invoice" | "Estimate";
  preview: OutlookDraftPreview;
  printHref: string;
};

export default function OutlookDraftPrepCard({
  documentLabel,
  preview,
  printHref,
}: OutlookDraftPrepCardProps) {
  return (
    <Card className="outlook-draft-card border-sky-500/30 bg-sky-500/10">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-200">
            Email Prep
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Review-ready manual email
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/90">
            Trimax prepares the subject, message, and printable document. Copy
            this into Outlook and send it with your normal signature after you
            review the PDF.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link href={printHref}>
            <Button variant="secondary">Print {documentLabel}</Button>
          </Link>

          <Button
            variant="secondary"
            onClick={() => navigator.clipboard.writeText(preview.subject)}
          >
            Copy Subject
          </Button>

          <Button
            variant="secondary"
            onClick={() => navigator.clipboard.writeText(preview.body)}
          >
            Copy Message
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="outlook-draft-preview rounded-2xl border border-sky-500/20 bg-black/25 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">
            To
          </p>
          <p className="mt-2 text-sm text-sky-50">{preview.toLabel}</p>
        </div>

        <div className="outlook-draft-preview rounded-2xl border border-sky-500/20 bg-black/25 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">
            Subject
          </p>
          <p className="mt-2 text-sm text-sky-50">{preview.subject}</p>
        </div>

        <div className="outlook-draft-preview rounded-2xl border border-sky-500/20 bg-black/25 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">
            Message
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-sky-50">
            {preview.body}
          </p>
        </div>
      </div>
    </Card>
  );
}
