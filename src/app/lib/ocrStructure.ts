export type RowBand = { y: number; height: number };
export type WordBox = { x0: number; y0: number; x1: number; y1: number };

export function rowAssignment(box: WordBox, row: RowBand, rows: RowBand[]) {
  const centerY = (box.y0 + box.y1) / 2;
  const previous = Math.max(-Infinity, ...rows.filter(other => other.y < row.y).map(other => other.y));
  const next = Math.min(Infinity, ...rows.filter(other => other.y > row.y).map(other => other.y));
  const tolerance = Math.max(2, row.height * 0.65);
  const top = Math.max(row.y - tolerance, (previous + row.y) / 2);
  const bottom = Math.min(row.y + tolerance, (next + row.y) / 2);
  const accepted = centerY > top && centerY < bottom;
  return { centerY, rowY: row.y, distance: Math.abs(centerY - row.y), top, bottom, accepted,
    reason: accepted ? "inside exclusive physical row band" : "outside physical row band or on adjacent-row boundary" };
}

// Bare glyph tokens are allowed only inside a geometrically identified invoice column.
export function normalizeInvoiceColumnToken(raw: string, inInvoiceColumn = false) {
  const token = raw.trim().toUpperCase().replace(/\s+/g, "");
  const prefixed = token.match(/^(?:[I1L|]?NV(?:OICE)?)[.#:-]?([0-9OSIL|]{3,8})$/);
  const body = prefixed?.[1] ?? (inInvoiceColumn && /^[0-9OSIL|]{4,6}$/.test(token) && /\d/.test(token) ? token : "");
  if (!body) return "";
  const digits = body.replace(/O/g, "0").replace(/S/g, "5").replace(/[IL|]/g, "1");
  return /^\d+$/.test(digits) ? `INV-${digits.padStart(4, "0")}` : "";
}

export function rankSourceEvaluations<T extends { completenessScore?: number; invoiceTokens?: number; rowCount?: number; explicitTotal?: number; words?: number }>(values: T[]) {
  const coverage = (value: T) => Number((value.explicitTotal ?? 0) > 0 && (value.rowCount ?? 0) > 0 && (value.invoiceTokens ?? 0) > 0);
  return values.slice().sort((a, b) => coverage(b) - coverage(a) ||
    (b.completenessScore ?? 0) - (a.completenessScore ?? 0) ||
    (b.invoiceTokens ?? 0) - (a.invoiceTokens ?? 0) || (b.words ?? 0) - (a.words ?? 0));
}

// Preserve the native still whenever its completed OCR supplies useful evidence.
// This affects capture selection only, never invoice or monetary authority.
export function selectPhysicalSource<T extends { id?: string; usable?: boolean; completenessScore?: number; invoiceTokens?: number; rowCount?: number; explicitTotal?: number; words?: number }>(values: T[]) {
  const useful = values.filter(value => value.usable === true);
  const stills = useful.filter(value => value.id === "still-full" || value.id === "still-crop");
  return rankSourceEvaluations(stills.length ? stills : useful)[0];
}

export function rankRowAmounts<T extends { raw: string; value: number; score?: number; confidence?: number; bbox?: Partial<WordBox> }>(values: T[]) {
  const fragment = (value: T) => values.some(other => {
    if (other === value || !value.bbox || !other.bbox || !/^\$?\s*\d{1,3}(?:,\d{3})+\.\d{2}$/.test(other.raw.trim())) return false;
    const box = value.bbox, full = other.bbox;
    return [box.x0, box.x1, full.x0, full.x1].every(Number.isFinite) &&
      Number(box.x0) >= Number(full.x0) - 2 && Number(box.x1) <= Number(full.x1) + 2 &&
      value.raw.replace(/\D/g, "").length < other.raw.replace(/\D/g, "").length && value.value < other.value;
  });
  return values.map(value => ({ ...value, score: (value.score ?? 0) - (fragment(value) ? 1000 : 0) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0));
}
