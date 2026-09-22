import type { Bounds } from '../types.ts';
import type { SemanticColumn } from './model.ts';
export type RowComponent = {
    id: string;
    bounds: Bounds;
    pixels: number;
    provenance: string;
};
export type PhysicalRow = {
    id: string;
    top: number;
    bottom: number;
    centerY: number;
    baseline: {
        slope: number;
        intercept: number;
        referenceX: number;
    };
    bounds: Bounds;
    ownership: {
        topIntercept: number;
        bottomIntercept: number;
    };
    supportingComponentIds: string[];
    columns: string[];
    columnRegions: Record<string, Bounds>;
    confidence: 'multi-column-geometry';
    sourceHash: string;
    coordinateSpace: 'normalized-still-pixels';
    provenance: string[];
};
const median = (xs: number[]) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
const right = (b: Bounds) => b.left + b.width;
export function owns(row: PhysicalRow, b: Bounds) { const y = b.top + b.height / 2 - row.baseline.slope * (b.left + b.width / 2); return y >= row.ownership.topIntercept && y < row.ownership.bottomIntercept; }
/** Components, not their transcriptions, establish rows. Each component has one
 * owner in the fitted table coordinate system. No expected row count is input. */
export function localizePhysicalRows(input: {
    components: RowComponent[];
    inkComponents?: RowComponent[];
    columns: SemanticColumn[];
    slope: number;
    width: number;
    height: number;
    sourceHash: string;
}) {
    const columns = input.columns.slice().sort((a, b) => a.bounds.left - b.bounds.left), slope = input.slope;
    const referenceX = columns.find(c => c.type === 'invoice_number')?.bounds.left ?? 0;
    const headingBottom = Math.max(0, ...columns.map(c => c.bounds.top + c.bounds.height - slope * (c.bounds.left + c.bounds.width / 2 - referenceX)));
    const cells: Array<{
        type: string;
        left: number;
        right: number;
    }> = columns.map((c, i) => ({ type: c.type, left: Math.max(0, c.bounds.left - c.bounds.height * .5), right: Math.min(input.width, columns[i + 1] ? columns[i + 1].bounds.left - columns[i + 1].bounds.height * .5 : input.width) }));
    if (cells[0]?.left > median(columns.map(c => c.bounds.height)) * 3)
        cells.unshift({ type: 'unlabeled-leading', left: 0, right: cells[0].left });
    const candidates = input.components.flatMap(c => {
        const cx = c.bounds.left + c.bounds.width / 2, cy = c.bounds.top + c.bounds.height / 2;
        const col = cells.find(r => cx >= r.left && cx < r.right);
        const y = cy - slope * (cx - referenceX);
        return col && y > headingBottom ? [{ ...c, column: col.type, y }] : [];
    });
    const headingScale = median(columns.map(c => c.bounds.height));
    const font = median(candidates.filter(c => c.column !== 'unlabeled-leading' && c.bounds.width >= headingScale * 1.5 && c.bounds.height >= headingScale * .5 && c.bounds.height <= headingScale * 1.3).map(c => c.bounds.height)) || headingScale;
    const glyphs = candidates.filter(c => c.bounds.height >= font * .45 && c.bounds.height <= font * 1.8 && c.bounds.width >= 1);
    const groups: typeof glyphs[] = [];
    for (const c of glyphs.slice().sort((a, b) => a.y - b.y)) {
        const last = groups.at(-1);
        if (last && c.y - median(last.map(g => g.y)) <= font * .65)
            last.push(c);
        else
            groups.push([c]);
    }
    const bands = groups.map(cs => {
        const support = cells.filter(cell => { const own = cs.filter(c => c.column === cell.type); return own.length > 0 && Math.max(...own.map(c => right(c.bounds))) - Math.min(...own.map(c => c.bounds.left)) >= font * 1.5; }).map(c => c.type);
        return { center: median(cs.map(c => c.y)), components: cs, columns: support, accepted: support.filter(c => c !== 'unlabeled-leading').length >= 2, reason: support.filter(c => c !== 'unlabeled-leading').length >= 2 ? 'corroborated columns' : 'insufficient independent columns' };
    });
    const supported: typeof bands = [];
    for (const band of bands.filter(b => b.accepted)) {
        const previous = supported.at(-1);
        if (previous && band.center - previous.center > Math.min(font * 6, supported.length >= 2 ? 2 * (previous.center - supported[supported.length - 2].center) : Infinity)) {
            band.accepted = false;
            band.reason = 'outside contiguous table body after vertical whitespace';
            continue;
        }
        supported.push(band);
    }
    const rows: PhysicalRow[] = supported.map((band, i) => {
        const previous = supported[i - 1], next = supported[i + 1];
        const top = Math.max(headingBottom, previous ? (previous.center + band.center) / 2 : Math.min(...band.components.map(c => c.y - c.bounds.height / 2)) - font * .2);
        const bottom = Math.min(input.height, next ? (band.center + next.center) / 2 : Math.max(...band.components.map(c => c.y + c.bounds.height / 2)) + font * .2);
        const columnRegions: Record<string, Bounds> = {};
        for (const cell of cells) {
            const ink = (input.inkComponents ?? []).filter(c => { const cx = c.bounds.left + c.bounds.width / 2, cy = c.bounds.top + c.bounds.height / 2 - slope * (cx - referenceX); return cx >= cell.left && cx < cell.right && cy >= top && cy < bottom && c.bounds.height >= font * .4 && c.bounds.height <= font * 1.8; });
            const own = [...band.components.filter(c => c.column === cell.type), ...ink];
            const left = Math.max(cell.left, own.length ? Math.floor(Math.min(...own.map(c => c.bounds.left)) - font * .12) : cell.left);
            const end = Math.min(cell.right, own.length ? Math.ceil(Math.max(...own.map(c => right(c.bounds))) + font * .12) : cell.right);
            const yTop = Math.max(0, Math.ceil(top + slope * ((slope >= 0 ? end : left) - referenceX)));
            const yEnd = Math.min(input.height, Math.floor(bottom + slope * ((slope >= 0 ? left : end) - referenceX)));
            if (end > left && yEnd > yTop)
                columnRegions[cell.type] = { left: Math.floor(left), top: yTop, width: Math.floor(end) - Math.floor(left), height: yEnd - yTop };
        }
        const left = cells[0]?.left ?? 0, end = cells.at(-1)?.right ?? input.width;
        return { id: `physical-row-${i}`, top, bottom, centerY: band.center, baseline: { slope, intercept: band.center - slope * referenceX, referenceX },
            bounds: { left: Math.floor(left), top: Math.ceil(top), width: Math.floor(end - left), height: Math.max(1, Math.floor(bottom) - Math.ceil(top)) },
            ownership: { topIntercept: top - slope * referenceX, bottomIntercept: bottom - slope * referenceX }, supportingComponentIds: band.components.map(c => c.id), columns: band.columns, columnRegions,
            confidence: 'multi-column-geometry', sourceHash: input.sourceHash, coordinateSpace: 'normalized-still-pixels', provenance: [...new Set(band.components.map(c => c.provenance))] };
    });
    const inkAssignments = (input.inkComponents ?? []).map(c => ({ componentId: c.id, rowId: rows.find(r => owns(r, c.bounds) && c.bounds.left + c.bounds.width / 2 >= cells[0].left && c.bounds.left + c.bounds.width / 2 < cells.at(-1)!.right)?.id ?? null }));
    return { version: 'physical-rows-1', font, slope, referenceX, headingBottom, bodyBounds: rows.length ? { left: cells[0].left, top: rows[0].top, width: cells.at(-1)!.right - cells[0].left, height: rows.at(-1)!.bottom - rows[0].top } : null, components: input.components, inkComponents: input.inkComponents ?? [], inkAssignments, candidateBands: bands.map(b => ({ centerY: b.center, componentIds: b.components.map(c => c.id), columns: b.columns, accepted: b.accepted, reason: b.reason })), rows };
}
