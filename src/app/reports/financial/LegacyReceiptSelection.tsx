"use client";

import { useState } from "react";
import { displayCents } from "../../lib/financialReportExport";
import type { ReceiptPeriod } from "../../lib/financialReports";

type Row = { id: string; invoice: string | null; gross: number; review?: ReceiptPeriod; paidDateHints: string[] };

export default function LegacyReceiptSelection({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const open = rows.filter(row => row.review?.grossCents !== row.gross || !row.review.through);
  const prior = open.filter(row => row.paidDateHints.length === 1 && row.paidDateHints[0] < "2026-01-01");
  const current = open.filter(row => row.paidDateHints.length === 1 && row.paidDateHints[0].startsWith("2026"));
  return <>
    <div className="flex flex-wrap gap-3 text-sm">
      <button type="button" className="underline" onClick={() => setSelected(prior.map(row => row.id))}>Select pre-2026 source dates ({prior.length})</button>
      <button type="button" className="underline" onClick={() => setSelected(current.map(row => row.id))}>Select 2026 source dates ({current.length})</button>
      <button type="button" className="underline" onClick={() => setSelected([])}>Clear selection</button>
      <span>{selected.length} selected</span>
    </div>
    <p className="text-sm">FreshBooks paid dates are review clues. Confirm the period only for amounts you know were received then.</p>
    <div className="max-h-72 overflow-auto">{rows.map(row => <label className="flex gap-2 border-b border-slate-600 p-2" key={row.id}>
      <input type="checkbox" name="invoice" value={row.id} checked={selected.includes(row.id)} onChange={event => {
        const checked = event.target.checked;
        setSelected(previous => checked ? [...previous, row.id] : previous.filter(id => id !== row.id));
      }} />
      <input type="hidden" name={"gross-" + row.id} value={row.gross} />
      <span>{row.invoice ?? "Invoice"} · {displayCents(row.gross)}
        {row.review?.grossCents === row.gross ? (row.review.through ? " · Reviewed through " + row.review.through : " · Period unknown") : " · Needs review"}
        {row.paidDateHints.length > 0 && <span className="block text-sm">FreshBooks paid date {row.paidDateHints.join(", ")}</span>}
      </span>
    </label>)}</div>
  </>;
}
