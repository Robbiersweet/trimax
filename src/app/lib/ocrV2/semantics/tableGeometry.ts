import type { Bounds } from '../types.ts';
import { headerMoney } from '../recognition/documentTotalAuthority.ts';
import { fitTableHeader } from './headerGeometry.ts';
import { localizePhysicalRows, owns, type RowComponent } from './physicalRows.ts';
import type { SemanticColumn, SemanticLabel, SemanticObservation, SemanticRow } from './model.ts';
const right = (b: Bounds) => b.left + b.width;
const bottom = (b: Bounds) => b.top + b.height;
const union = (boxes: Bounds[]): Bounds => {
    const left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top));
    return { left, top, width: Math.max(...boxes.map(right)) - left, height: Math.max(...boxes.map(bottom)) - top };
};
const invoiceToken = (text: string) => /^INV[\w-]*\d[\w-]*$/i.test(text) || /^\d[\d-]+$/.test(text);
// Decimal currency syntax, not arbitrary account numbers, dates, or quantities.
const moneyToken = (text: string) => /^[$£€]?\d[\d,]*\.\d{2}$/.test(text.trim()) && headerMoney(text) !== null;
/** Same-image observations share coordinates. A missed label in one pass must
 * not erase a spatially aligned sibling label. Geometry never supplies values. */
export function mapSemanticTable(observations: SemanticObservation[], labels: SemanticLabel[], physicalComponents?: RowComponent[]) {
    const invoice = labels.filter(l => l.type === 'invoice_number').sort((a, b) => b.confidence - a.confidence)[0];
    if (!invoice)
        return { heading: [] as SemanticLabel[], columns: [] as SemanticColumn[], rows: [] as SemanticRow[] };
    const { heading, geometry: headerGeometry } = fitTableHeader(labels, invoice);
    const columns: SemanticColumn[] = [];
    for (const label of heading.slice().sort((a, b) => b.confidence - a.confidence)) {
        const existing = columns.find(c => c.type === label.type);
        if (existing) {
            if (Math.abs(existing.bounds.left - label.bounds.left) < Math.max(existing.bounds.height, label.bounds.height) * 2)
                existing.labelEvidence!.push(label.id);
        }
        else
            columns.push({ type: label.type, bounds: label.bounds, labelEvidence: [label.id], geometryEvidence: [], semanticConfidence: 'label-supported' });
    }
    const sourceHash = observations[0]?.sourceHash ?? '';
    const pageWidth = Math.max(0, ...observations.map(o => right(o.region)), ...observations.flatMap(o => o.words.map(w => right(w.bounds)))), pageHeight = Math.max(0, ...observations.map(o => bottom(o.region)), ...observations.flatMap(o => o.words.map(w => bottom(w.bounds))));
    const seen = new Set<string>();
    const components = observations.flatMap(o => o.words.flatMap(w => {
        const key = JSON.stringify(w.bounds);
        if (seen.has(key))
            return [];
        seen.add(key);
        return [{ id: `word-box-${seen.size}`, bounds: w.bounds, pixels: w.bounds.width * w.bounds.height, provenance: o.id }];
    }));
    let physical = localizePhysicalRows({ components, columns, slope: headerGeometry.slope, width: pageWidth, height: pageHeight, sourceHash, inkComponents: physicalComponents });
    if (!columns.some(c => c.type === 'row_amount')) {
        const monetary = observations.flatMap(o => o.words.filter(w => moneyToken(w.text) && physical.rows.some(r => owns(r, w.bounds))).map(w => ({ ...w, observationId: o.id })));
        const clusters: typeof monetary[] = [];
        for (const word of monetary) {
            const group = clusters.find(g => Math.abs(right(g[0].bounds) - right(word.bounds)) < Math.max(g[0].bounds.height, word.bounds.height));
            if (group)
                group.push(word);
            else
                clusters.push([word]);
        }
        const supported = clusters.filter(g => physical.rows.filter(r => g.some(w => owns(r, w.bounds))).length >= 2);
        if (supported.length === 1) {
            const extent = union(supported[0].map(w => w.bounds));
            columns.push({ type: 'row_amount', bounds: { left: extent.left, top: invoice.bounds.top, width: extent.width, height: invoice.bounds.height }, labelEvidence: [], geometryEvidence: supported[0].map(w => ({ observationId: w.observationId, bounds: w.bounds, kind: 'decimal-money-aligned-with-physical-row' })), semanticConfidence: 'provisional-geometry' });
        }
        physical = localizePhysicalRows({ components, columns, slope: headerGeometry.slope, width: pageWidth, height: pageHeight, sourceHash, inkComponents: physicalComponents });
    }
    columns.sort((a, b) => a.bounds.left - b.bounds.left);
    const rows: SemanticRow[] = physical.rows.map(row => ({ id: row.id, bounds: row.bounds, physical: row, invoiceRegion: row.columnRegions.invoice_number, amountRegion: row.columnRegions.row_amount, amountCents: null }));
    // Transcriptions attach only after geometry is frozen; they cannot create/delete rows.
    for (const row of rows)
        for (const o of observations) {
            const inv = columns.find(c => c.type === 'invoice_number');
            for (const w of o.words.filter(w => invoiceToken(w.text) && owns(row.physical!, w.bounds) && row.invoiceRegion && w.bounds.left >= row.invoiceRegion.left && right(w.bounds) <= right(row.invoiceRegion)))
                inv?.geometryEvidence?.push({ observationId: o.id, bounds: w.bounds, kind: 'repeated-invoice-token' });
        }
    // Preserve the existing observed-subtotal safety check, after row ownership freezes.
    for (const row of rows) {
        const amount = columns.find(c => c.type === 'row_amount');
        const next = amount && columns.find(c => c.bounds.left > amount.bounds.left);
        const matched = observations.flatMap(o => o.words.filter(w => amount && moneyToken(w.text) && owns(row.physical!, w.bounds) && w.bounds.left >= amount.bounds.left - amount.bounds.height && right(w.bounds) <= (next ? next.bounds.left - next.bounds.height : pageWidth)).map(w => ({ ...w, observationId: o.id })));
        const values = [...new Set(matched.map(w => headerMoney(w.text)))];
        row.amountCents = values.length === 1 ? values[0] : null;
        amount?.geometryEvidence?.push(...matched.map(w => ({ observationId: w.observationId, bounds: w.bounds, kind: 'decimal-money-aligned-with-invoice-row' })));
    }
    return { heading, columns, rows, headerGeometry, physicalGeometry: physical };
}
