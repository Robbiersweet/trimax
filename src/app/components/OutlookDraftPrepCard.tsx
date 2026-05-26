import Link from "next/link";
import Button from "./Button";
import Card from "./Card";
import type { OutlookDraftPreview } from "../lib/outlookDrafts";

type OutlookDraftPrepCardProps = {
  documentLabel: "Invoice" | "Estimate";
  preview: OutlookDraftPreview;
  printHref: string;
  settingsHref: string;
};

export default function OutlookDraftPrepCard({
  documentLabel,
  preview,
  printHref,
  settingsHref,
}: OutlookDraftPrepCardProps) {
  return (
    <Card className="border-sky-500/30 bg-sky-500/10">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-200">
            Outlook Draft
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Review-ready email draft
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/90">
            Trimax is being prepared to create Outlook drafts with the PDF
            attached. For now, this shows the exact subject and message we will
            hand to Outlook once the Microsoft connection is enabled.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link href={printHref}>
            <Button variant="secondary">Print {documentLabel}</Button>
          </Link>

          <Link href={settingsHref}>
            <Button variant="secondary">Outlook Setup</Button>
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="rounded-2xl border border-sky-500/20 bg-black/25 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">
            To
          </p>
          <p className="mt-2 text-sm text-sky-50">{preview.toLabel}</p>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-black/25 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">
            Subject
          </p>
          <p className="mt-2 text-sm text-sky-50">{preview.subject}</p>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-black/25 p-4">
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
