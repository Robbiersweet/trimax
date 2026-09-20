import type { Bounds } from "../types.ts";
import type { DocumentLayout, PhysicalRow, TextBand, TextComponent } from "./types.ts";
import { textComponents, horizontalBands, median } from "./components.ts";
function robustExtent(components: TextComponent[]) {
    const sorted = components.slice().sort((a, b) => a.left - b.left), total = sorted.reduce((s, c) => s + c.pixels, 0);
    let accumulated = 0, left = sorted[0]?.left ?? 0, right = left;
    for (const c of sorted) {
        accumulated += c.pixels;
        if (accumulated >= total * .015) {
            left = c.left;
            break;
        }
    }
    accumulated = 0;
    for (const c of sorted.slice().sort((a, b) => (b.left + b.width) - (a.left + a.width))) {
        accumulated += c.pixels;
        if (accumulated >= total * .015) {
            right = c.left + c.width;
            break;
        }
    }
    return { left, right };
}
function selectBody(bands: TextBand[], width: number) {
    const broad = bands.filter(b => b.width > width * .45 && b.componentCount >= 12);
    if (broad.length < 2)
        return [];
    const height = median(broad.map(b => b.height)), glyphs = median(broad.map(b => b.componentCount)), regular = broad.filter(b => b.height >= height * .7 && b.height <= height * 1.35 && b.componentCount >= glyphs * .8);
    const spacing = median(regular.slice(1).map((b, i) => b.centerY - regular[i].centerY));
    if (!spacing || spacing > height * 6)
        return [];
    const clusters: TextBand[][] = [];
    for (const band of regular) {
        const last = clusters.at(-1);
        if (last && band.centerY - last[last.length - 1].centerY <= spacing * 2.5)
            last.push(band);
        else
            clusters.push([band]);
    }
    const best = clusters.sort((a, b) => b.length - a.length)[0] ?? [];
    if (best.length < 2)
        return [];
    // An unusually tall body row may lie between regular neighbors. Headings
    // outside that run do not become rows just because they contain many glyphs.
    return broad.filter(b => b.centerY >= best[0].centerY && b.centerY <= best[best.length - 1].centerY);
}
function groups(components: TextComponent[], gap: number) {
    const out: Array<Bounds & {
        ink: number;
        count: number;
    }> = [];
    for (const c of components.slice().sort((a, b) => a.left - b.left)) {
        const last = out[out.length - 1];
        if (last && c.left <= last.left + last.width + gap) {
            const right = Math.max(last.left + last.width, c.left + c.width), bottom = Math.max(last.top + last.height, c.top + c.height);
            last.top = Math.min(last.top, c.top);
            last.height = bottom - last.top;
            last.width = right - last.left;
            last.ink += c.pixels;
            last.count++;
        }
        else
            out.push({ left: c.left, top: c.top, width: c.width, height: c.height, ink: c.pixels, count: 1 });
    }
    return out;
}
function runs(mask: boolean[], minimum = 1) { const out: Array<{
    start: number;
    end: number;
}> = []; let start = -1; for (let i = 0; i <= mask.length; i++) {
    if (mask[i]) {
        if (start < 0)
            start = i;
    }
    else if (start >= 0) {
        if (i - start >= minimum)
            out.push({ start, end: i });
        start = -1;
    }
} return out; }
export function ownerAtY(layout: DocumentLayout, y: number) { return layout.rows.find(row => y >= row.top && y < row.bottom)?.id ?? null; }
export function ownerOfBounds(layout: DocumentLayout, bounds: Bounds) { const rows = layout.rows.filter(row => bounds.top >= row.top && bounds.top + bounds.height <= row.bottom); return rows.length === 1 ? rows[0].id : null; }
export function cropBounds(bounds: Bounds, padding: number, document: Bounds): Bounds {
    const left = Math.max(document.left, Math.floor(bounds.left - padding)), top = Math.max(document.top, Math.floor(bounds.top - padding));
    const right = Math.min(document.left + document.width, Math.ceil(bounds.left + bounds.width + padding)), bottom = Math.min(document.top + document.height, Math.ceil(bounds.top + bounds.height + padding));
    return { left, top, width: right - left, height: bottom - top };
}
/** Pixels in; geometry out. No OCR, fixture labels, invoice records or resolver. */
export async function detectLayout(input: Buffer, options: {
    maximumAnalysisEdge?: number;
} = {}): Promise<DocumentLayout> {
    const started = performance.now(), analysis = await textComponents(input, options.maximumAnalysisEdge ?? 3200);
    const { width, height, components, scaleX, scaleY } = analysis, { bands, characterHeight } = horizontalBands(components, width, height);
    const body = selectBody(bands, width), warnings: string[] = [];
    const map = (b: Bounds): Bounds => ({ left: b.left * scaleX, top: b.top * scaleY, width: b.width * scaleX, height: b.height * scaleY });
    const layout: DocumentLayout = { version: 'phase2-layout-1', coordinateSpace: 'normalized-document-color', documentBounds: { left: 0, top: 0, width: analysis.sourceWidth, height: analysis.sourceHeight }, columns: {}, rows: [], diagnostics: { sourceWidth: analysis.sourceWidth, sourceHeight: analysis.sourceHeight, analysisWidth: width, analysisHeight: height, scaleX, scaleY, threshold: analysis.threshold, characterHeight: characterHeight * scaleY, componentCount: components.length, bands: bands.map(b => ({ ...b, ...map(b), centerY: b.centerY * scaleY, characterHeight: b.characterHeight * scaleY })), headerAnchors: [], verticalWhitespace: [], warnings, durationMs: 0 } };
    if (body.length < 2) {
        warnings.push('No supported repeated multi-column body; do not invent rows.');
        layout.diagnostics.durationMs = performance.now() - started;
        return layout;
    }
    const spacing = median(body.slice(1).map((b, i) => b.centerY - body[i].centerY));
    const rowComponents = body.map(b => components.filter(c => c.centerY >= b.top && c.centerY < b.top + b.height && c.height >= characterHeight * .6));
    const font = median(rowComponents.flat().map(c => c.height)) || characterHeight;
    const extents = rowComponents.map(robustExtent), left = Math.max(0, median(extents.map(e => e.left)) - font * .5), right = Math.min(width, median(extents.map(e => e.right)) + font * .5);
    // Shared cuts define half-open ownership. Crop padding never changes these cuts.
    const cuts = [Math.max(0, body[0].centerY - spacing / 2), ...body.slice(1).map((b, i) => (body[i].top + body[i].height + b.top) / 2), Math.min(height, body[body.length - 1].centerY + spacing / 2)];
    for (let i = 0; i < body.length; i++) {
        const bounds = map({ left, top: cuts[i], width: right - left, height: cuts[i + 1] - cuts[i] });
        const rowBottom = cuts[i + 1] * scaleY;
        bounds.height = rowBottom - bounds.top;
        layout.rows.push({ id: `row-${String(i + 1).padStart(4, '0')}`, top: bounds.top, bottom: rowBottom, centerY: body[i].centerY * scaleY, bounds });
    }
    const top = cuts[0];
    let bottom = cuts[cuts.length - 1];
    layout.tableRegion = map({ left, top, width: right - left, height: bottom - top });
    layout.headerRegion = map({ left: 0, top: 0, width, height: top });
    const heading = bands.filter(b => b.centerY < top).at(-1);
    const headerComponents = heading ? components.filter(c => c.centerY > heading.centerY - font * 1.8 && c.centerY < heading.centerY + font * 1.5 && c.height >= font * .55) : [];
    const headerGroups = groups(headerComponents, font * 1.2), maxInk = Math.max(1, ...headerGroups.map(g => g.ink));
    const anchors = headerGroups.filter(g => g.ink > maxInk * .28 && g.count >= 3);
    layout.diagnostics.headerAnchors = anchors.map(map);
    const profile = new Float64Array(width);
    for (const row of rowComponents) {
        const line = new Float64Array(width);
        for (const c of row)
            for (let x = c.left; x < c.left + c.width; x++)
                line[x] += c.pixels / c.width;
        const peak = Math.max(...line);
        for (let x = 0; x < width; x++)
            if (line[x] > peak * .08)
                profile[x]++;
    }
    const present = Array.from(profile, v => v >= Math.ceil(body.length * .6));
    const gaps = runs(present.map(x => !x), Math.max(2, font * .25));
    layout.diagnostics.verticalWhitespace = gaps.map(g => ({ start: g.start * scaleX, end: g.end * scaleX }));
    function strongSpan(a: number, b: number) {
        const positions = present.flatMap((yes, i) => yes && i >= a && i <= b ? [i] : []), clusters: number[][] = [];
        for (const x of positions) {
            const last = clusters.at(-1);
            if (last && x - last[last.length - 1] <= font * 1.8)
                last.push(x);
            else
                clusters.push([x]);
        }
        const best = clusters.sort((x, y) => y.length - x.length)[0];
        return best && best.length >= font ? { left: Math.max(a, best[0] - font * .5), right: Math.min(b, best[best.length - 1] + font * .5) } : null;
    }
    const addColumn = (name: keyof DocumentLayout['columns'], a: number, b: number, evidence: string[], certainty: 'supported' | 'tentative' = 'tentative') => { if (b - a < font)
        return; const bounds = map({ left: a, top, width: b - a, height: bottom - top }); layout.columns[name] = { ...bounds, id: `column-${name}`, certainty, evidence, roleIsGeometricHypothesis: true }; };
    // Rightmost repeated narrow ink group, corroborated by the final heading anchor.
    const amountAnchor = anchors.at(-1);
    if (amountAnchor) {
        const span = strongSpan(amountAnchor.left, right);
        if (span && span.right - span.left < width * .25)
            addColumn('amount', span.left, span.right, ['Rightmost repeated body alignment', 'Separate right-hand heading anchor', 'Role requires Phase 3 field validation'], 'supported');
    }
    // A compact field followed by another isolated token column, between headings.
    // Roles are hypotheses; no text/character is recognized here.
    const internal = anchors.slice(1, -1);
    let fields: {
        invoice: {
            left: number;
            right: number;
        };
        date: {
            left: number;
            right: number;
        };
        description: {
            left: number;
            right: number;
        };
        score: number;
    } | null = null;
    // Prefer independent heading anchors over a word gap inside one labeled field.
    for (let i = 0; i < internal.length - 2; i++) {
        const a = internal[i], b = internal[i + 1], c = internal[i + 2];
        const invoice = strongSpan(a.left - font * .6, b.left - font * .6), date = strongSpan(b.left - font * .6, c.left - font), description = strongSpan(c.left - font * .6, amountAnchor?.left ?? right);
        if (!invoice || !date || !description)
            continue;
        if (invoice.left - a.left > font * 1.5 || date.left - b.left > font * 1.5 || description.left - c.left > font * 1.5)
            continue;
        const iw = invoice.right - invoice.left, dw = date.right - date.left, descriptionWidth = description.right - description.left;
        if (iw < font * 3 || iw > font * 14 || dw < iw * .8 || dw > font * 18 || descriptionWidth < Math.max(iw, dw) * 1.35)
            continue;
        const score = descriptionWidth / Math.max(iw, dw);
        if (!fields || score > fields.score)
            fields = { invoice, date, description, score };
    }
    let pair: {
        anchor: Bounds;
        next: Bounds;
        gap: {
            start: number;
            end: number;
        };
        score: number;
    } | null = null;
    for (let i = 0; i < internal.length - 1; i++) {
        const a = internal[i], next = internal[i + 1];
        for (const gap of gaps.filter(g => g.start > a.left + font * 3 && g.end < next.left - font * 2 && g.end - g.start > font * .8)) {
            const before = strongSpan(a.left - font * .6, gap.start), after = strongSpan(gap.end, next.left - font);
            if (!before || !after || before.right - before.left > font * 14 || after.right - after.left > font * 18)
                continue;
            const score = (gap.end - gap.start) / (next.left - a.left);
            if (!pair || score > pair.score)
                pair = { anchor: a, next, gap, score };
        }
    }
    if (!fields && pair) {
        const invoice = strongSpan(pair.anchor.left - font * .6, pair.gap.start), date = strongSpan(pair.gap.end, pair.next.left - font), description = strongSpan(pair.next.left - font * .6, amountAnchor?.left ?? right);
        if (invoice && date && description && description.left - pair.next.left <= font * 1.5 && description.right - description.left > Math.max(invoice.right - invoice.left, date.right - date.left) * 1.35)
            fields = { invoice, date, description, score: pair.score };
    }
    if (fields) {
        const { invoice, date, description } = fields;
        if (invoice)
            addColumn('invoice', invoice.left, invoice.right, ['Heading-aligned compact body field', 'Repeated whitespace separates next compact column', 'Semantic invoice role remains tentative']);
        if (date)
            addColumn('date', date.left, date.right, ['Compact column adjacent to invoice hypothesis', 'Repeated shared whitespace', 'Semantic date role remains tentative']);
        if (description)
            addColumn('description', description.left, description.right, ['Long central/right text span below an independent heading', 'Leading short token retained in same crop']);
        if (invoice)
            addColumn('propertyAccount', left, invoice.left, ['Left-side property/account text preceding the compact field']);
    }
    else
        warnings.push('Invoice/date pair not supported by heading and repeated whitespace geometry.');
    warnings.push('Column role names are geometry hypotheses, not recognized labels. Unit is not separated without independent structural support.');
    // Search below the actual last row in the right-aligned field, not at a fixed Y.
    const amount = layout.columns.amount;
    const lastInkBottom = body[body.length - 1].top + body[body.length - 1].height;
    const footerComponents = amount ? components.filter(c => c.top > lastInkBottom + font * .1 && c.left >= amount.left / scaleX - font && c.left + c.width <= (amount.left + amount.width) / scaleX + font && c.height >= font * .65) : [];
    const footerCandidates: TextBand[] = [];
    for (const c of footerComponents) {
        const aligned = footerComponents.filter(p => Math.abs(p.centerY - c.centerY) < font * .65);
        if (aligned.length < 4)
            continue;
        const extent = robustExtent(aligned), t = Math.min(...aligned.map(p => p.top)), b = Math.max(...aligned.map(p => p.top + p.height));
        if (b - t > font * 2.5)
            continue;
        footerCandidates.push({ left: extent.left, top: t, width: extent.right - extent.left, height: b - t, centerY: (t + b) / 2, characterHeight: median(aligned.map(p => p.height)), componentCount: aligned.length });
    }
    const footer = footerCandidates.sort((a, b) => a.top - b.top).find(b => b.componentCount >= 5 && b.width > font * 3);
    if (footer) {
        bottom = Math.min(bottom, (lastInkBottom + footer.top) / 2);
        const last = layout.rows[layout.rows.length - 1];
        last.bottom = bottom * scaleY;
        last.bounds.height = last.bottom - last.top;
        layout.tableRegion.height = last.bottom - layout.tableRegion.top;
        for (const column of Object.values(layout.columns))
            column.height = bottom * scaleY - column.top;
        const candidateTop = Math.max(bottom, footer.top - font * .5), candidateBottom = Math.min(height, footer.top + footer.height + font * .5);
        const candidate = { left: Math.max(0, footer.left - font), top: candidateTop, width: Math.min(width, footer.left + footer.width + font) - Math.max(0, footer.left - font), height: candidateBottom - candidateTop };
        layout.totalCandidateRegion = map(candidate);
        layout.footerRegion = map({ left: 0, top: bottom, width, height: Math.min(height, candidateBottom + font * .5) - bottom });
    }
    else {
        layout.footerRegion = map({ left: 0, top: bottom, width, height: height - bottom });
        warnings.push('No isolated aligned footer group; preserve all remaining document pixels for review.');
    }
    for (const row of layout.rows)
        for (const name of ['invoice', 'unit', 'date', 'description', 'amount'] as const) {
            const column = layout.columns[name];
            if (column)
                row[`${name}Region` as keyof Pick<PhysicalRow, 'invoiceRegion' | 'unitRegion' | 'dateRegion' | 'descriptionRegion' | 'amountRegion'>] = { left: column.left, top: row.top, width: column.width, height: row.bottom - row.top };
        }
    layout.diagnostics.durationMs = performance.now() - started;
    return layout;
}
