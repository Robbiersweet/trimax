import Link from "next/link";
import {
  buildSplitChildSourceRelationship,
  buildSplitSourceRelationshipItems,
  type SplitRelationshipInvoice,
} from "../lib/splitInvoiceRelationships";

type SplitInvoiceRelationshipDisplayProps = {
  businessQuery: string;
  sourceInvoice?: SplitRelationshipInvoice | null;
  childInvoices?: SplitRelationshipInvoice[];
};

export default function SplitInvoiceRelationshipDisplay({
  businessQuery,
  sourceInvoice = null,
  childInvoices = [],
}: SplitInvoiceRelationshipDisplayProps) {
  const children = buildSplitSourceRelationshipItems(childInvoices);
  const source = buildSplitChildSourceRelationship(sourceInvoice);

  if (children.length === 0 && !source) {
    return null;
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-green-500/25 bg-black/20 p-4 text-sm">
      {children.length > 0 ? (
        <div>
          <p className="font-black text-green-100">Split Source</p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-green-200/70">
            Creates:
          </p>
          <div className="mt-2 grid gap-2">
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/invoices/${child.id}${businessQuery}`}
                className="flex flex-col gap-1 rounded-xl border border-green-500/20 bg-black/25 px-3 py-2 transition hover:border-orange-300/60 hover:text-orange-200 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-black text-white">
                  {child.displayId} - {child.splitLabel}
                </span>
                <span className="w-fit rounded-full border border-green-400/25 bg-green-400/10 px-2 py-0.5 text-xs font-black uppercase tracking-[0.12em] text-green-100">
                  {child.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {source ? (
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-green-200/70">
            Source:
          </p>
          <Link
            href={`/invoices/${source.id}${businessQuery}`}
            className="mt-2 inline-flex rounded-xl border border-green-500/20 bg-black/25 px-3 py-2 font-black text-white transition hover:border-orange-300/60 hover:text-orange-200"
          >
            {source.displayId}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
