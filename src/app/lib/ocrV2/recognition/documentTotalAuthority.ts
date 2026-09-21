// Offline Phase 5C. No invoice database, expected values, or production callers.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Bounds } from '../types.ts';
import { inspectStructuralLines, type structuralLayout } from '../layout/generalized.ts';
import { fieldVariant } from './index.ts';
import { decideMoney, paymentMoney, type DocumentPaymentEvidence, type PaymentObservation } from './paymentEvidence.ts';

type Layout = Awaited<ReturnType<typeof structuralLayout>>;
type Label = { observationId: string; text: string; bounds: Bounds; confidence: number; variant: string; headerCents: number | null; valueBounds: Bounds | null };
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const bottom = (b: Bounds) => b.top + b.height;
const right = (b: Bounds) => b.left + b.width;
const overlap = (a: Bounds, b: Bounds) => Math.max(0, Math.min(right(a), right(b)) - Math.max(a.left, b.left)) * Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.top, b.top));
const union = (boxes: Bounds[]): Bounds => { const left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top)); return { left, top, width: Math.max(...boxes.map(right)) - left, height: Math.max(...boxes.map(bottom)) - top }; };

/** Spacing/punctuation around a complete money token only; no character repair. */
export function headerMoney(text: string): number | null {
    const clean = text.trim().replace(/^[\s:$]+/, '').replace(/[\s*%+»]+$/, '').replace(/\s*([.,])\s*/g, '$1');
    const values = paymentMoney(clean);
    return values.length === 1 && /^\d[\d.,]*$/.test(clean) ? values[0] : null;
}

export function totalLabels(observations: PaymentObservation[], layout: Layout): Label[] {
    const first = Math.min(...layout.rows.map(r => r.bounds.top));
    return observations.filter(o => o.scope === 'document' && o.field === 'header').flatMap(o => o.words.flatMap(w => {
        // No fuzzy TOTAL correction: SUBTOTAL, TOTALS, TOIAL, and body labels fail.
        const labelText = w.text.trim().replace(/^[('"“]+/, '');
        const match = labelText.match(/^(?:(?:CHECK|GRAND)\s+)?TOTAL(?=[:\s$]|$)/i);
        if (!match || bottom(w.bounds) > Math.min(first, layout.headerRegion?.top ?? first) || layout.rows.some(r => overlap(w.bounds, r.bounds) > 0)) return [];
        if (/\bSUB\s*-?\s*TOTAL\b/i.test(o.raw)) return [];
        const inline = labelText.slice(match[0].length);
        const following = o.words.filter(other => other !== w && other.bounds.left >= right(w.bounds) - 2 && other.bounds.left - right(w.bounds) < w.bounds.height * 12 && Math.abs(bottom(other.bounds) - bottom(w.bounds)) <= Math.max(other.bounds.height, w.bounds.height) * .5).sort((a, b) => a.bounds.left - b.bounds.left);
        const parts = inline.trim() ? [inline] : [], boxes: Bounds[] = inline.trim() ? [w.bounds] : [];
        for (const other of following) {
            if (!/^[\s:$\d.,*%+»]+$/.test(other.text)) break;
            parts.push(other.text); boxes.push(other.bounds);
            // At most the printed amount; never consume another header field.
            if (headerMoney(parts.join(' ')) !== null) break;
        }
        return [{ observationId: o.id, text: w.text, bounds: w.bounds, confidence: w.confidence, variant: o.variant, headerCents: headerMoney(parts.join(' ')), valueBounds: boxes.length ? union(boxes) : null }];
    }));
}

export function decideDocumentTotal(layout: Layout, evidence: DocumentPaymentEvidence, observations: PaymentObservation[]) {
    const start = performance.now();
    const scoped = observations.filter(o => o.sourceHash === evidence.sourceHash);
    const labels = totalLabels(scoped, layout), reliableLabels = labels.filter(l => l.confidence >= 40);
    const last = Math.max(...layout.rows.map(r => bottom(r.bounds))), regions = layout.rows.flatMap(r => r.amountRegion ? [r.amountRegion] : []);
    const font = layout.diagnostics.font * layout.sourceWidth / Math.min(layout.sourceWidth, 2400);
    const candidateRegion = layout.totalCandidateRegion;
    const geometry = !!candidateRegion && candidateRegion.top >= last && !layout.rows.some(r => overlap(candidateRegion, r.bounds) > 0)
        && regions.length === layout.rows.length && regions.every(r => Math.abs(right(r) - right(candidateRegion)) <= font * 2)
        && candidateRegion.top - last <= Math.max(...layout.rows.map(r => r.bounds.height)) * 4;
    // An OCR field name alone cannot turn a body crop into a document total.
    const footer = scoped.filter(o => o.scope === 'document' && o.field === 'total' && o.bounds.top >= last && candidateRegion && overlap(o.bounds, candidateRegion) >= candidateRegion.width * candidateRegion.height * .8 && !layout.rows.some(r => overlap(o.bounds, r.bounds) > 0));
    const numeric = decideMoney(footer);
    const supportedFooter = numeric.candidates.filter(candidate => decideMoney(footer.filter(o => o.money.length === 1 && o.money[0] === candidate.cents)).cents === candidate.cents);
    const headerValues = [...new Set(reliableLabels.flatMap(l => l.headerCents === null ? [] : [l.headerCents]))];
    const matches = supportedFooter.filter(candidate => headerValues.includes(candidate.cents));
    const repeatedLabel = (reliableLabels.length > 0 && new Set(labels.filter(l => l.confidence >= 20).map(l => l.variant)).size >= 2) || reliableLabels.some(l => l.confidence >= 85);
    const explicitFooterLabels = scoped.filter(o => o.field === 'footer-label' && o.scope === 'document' && !/\bSUB\s*-?\s*TOTAL\b/i.test(o.raw) && candidateRegion && o.words.some(w => /^TOTAL:?$/i.test(w.text.trim()) && w.bounds.left < candidateRegion.left && w.bounds.top >= last && Math.abs(w.bounds.top - candidateRegion.top) < candidateRegion.height * 1.5 && !layout.rows.some(r => overlap(w.bounds, r.bounds) > 0)));
    const sameRegionAuthority = new Set(explicitFooterLabels.map(o => o.variant)).size >= 2 && numeric.cents !== null;
    let cents: number | null = null;
    let reason = 'No supported document-level label/value association';
    if (!geometry) reason = 'Footer candidate is not an isolated final amount-column field';
    else if (headerValues.length > 1) reason = 'Conflicting labeled header amounts';
    else if (sameRegionAuthority && (!headerValues.length || headerValues[0] === numeric.cents)) { cents = numeric.cents; reason = 'Explicit footer TOTAL labels and supported same-region value'; }
    else if (!reliableLabels.length) reason = 'No sufficiently reliable exact TOTAL label outside the body';
    else if (matches.length === 1) { cents = matches[0].cents; reason = 'Explicit header total agrees with independently supported isolated footer value'; }
    else if (!headerValues.length && repeatedLabel && numeric.cents !== null) { cents = numeric.cents; reason = 'Repeated explicit header TOTAL semantics plus supported final amount-column value'; }
    else if (headerValues.length && supportedFooter.length) reason = 'Labeled header and supported footer values disagree';
    const subtotal = evidence.rows.every(r => r.cents !== null) ? evidence.rows.reduce((sum, r) => sum + r.cents!, 0) : null;
    // A visible conflict blocks authority; subtotal never selects or manufactures money.
    if (cents !== null && subtotal !== null && subtotal !== cents) { cents = null; reason = 'Observed row subtotal conflicts with document total'; }
    return { cents, reason, labels, explicitFooterLabels: explicitFooterLabels.map(o => ({ id: o.id, bounds: o.bounds, words: o.words })), supportedFooter, allFooterCandidates: numeric.candidates, headerValues, geometry: { rowBody: layout.rows.map(r => r.bounds), header: layout.headerRegion, footer: candidateRegion, alignedAndIsolated: geometry, belowLastRow: candidateRegion ? candidateRegion.top >= last : false }, subtotal, subtotalCorroborates: cents !== null && subtotal === cents, durationMs: performance.now() - start };
}

/** Retained field observations must be bound to these exact normalized pixels and crop bytes. */
export async function validateRetainedAmounts(image: Buffer, layout: Layout, evidence: DocumentPaymentEvidence, retained: PaymentObservation[]) {
    const accepted: PaymentObservation[] = [], rejected: Array<{ id: string; reason: string; observation: PaymentObservation }> = [];
    const sourceHash = hash(image);
    for (const o of retained) {
        const index = evidence.rows.findIndex(row => row.rowId === o.rowId), row = layout.rows[index];
        let reason = '';
        if (o.sourceHash !== sourceHash || o.sourceHash !== evidence.sourceHash) reason = 'source hash mismatch';
        else if (!row?.amountRegion || o.scope !== 'row' || o.field !== 'amount') reason = 'row/field scope mismatch';
        else if (hash(await sharp(image).extract(o.bounds).flatten({ background: 'white' }).png().toBuffer()) !== o.cropHash) reason = 'crop hash mismatch';
        else {
            const moneyWords = o.words.filter(w => paymentMoney(w.text).length > 0);
            if (!moneyWords.length || moneyWords.some(w => overlap(w.bounds, row.bounds) < w.bounds.width * w.bounds.height * .8 || overlap(w.bounds, row.amountRegion!) < w.bounds.width * w.bounds.height * .8 || layout.rows.some((other, j) => j !== index && overlap(w.bounds, other.bounds) > 0))) reason = 'money glyphs cross physical row/amount ownership';
        }
        if (reason) rejected.push({ id: o.id, reason, observation: { ...o, money: paymentMoney(o.raw) } }); else accepted.push({ ...o, money: paymentMoney(o.raw) });
    }
    return { accepted, rejected };
}

export async function recognizeDocumentTotal(image: Buffer, layout: Layout, original: DocumentPaymentEvidence, retainedAmounts: PaymentObservation[] = []) {
    const start = performance.now();
    if (hash(image) !== original.sourceHash) throw Error('Phase 5C source mismatch');
    const metadata = await sharp(image).metadata();
    if (metadata.width !== layout.sourceWidth || metadata.height !== layout.sourceHeight) throw Error('Phase 5C image/layout coordinate mismatch');
    const evidence = structuredClone(original);
    const retained = await validateRetainedAmounts(image, layout, evidence, retainedAmounts);
    evidence.rows = evidence.rows.map(row => { const observations = [...row.observations, ...retained.accepted.filter(o => o.rowId === row.rowId)]; return { ...row, ...decideMoney(observations), observations }; });
    const observations = [...evidence.headerEvidence.observations, ...evidence.totalEvidence.observations];
    let authority = decideDocumentTotal(layout, evidence, observations), extraPasses = 0;
    if (authority.cents === null && !authority.labels.some(l => l.confidence >= 40)) {
        // One physical header line, two variants. No full-document recovery loop.
        const structural = await inspectStructuralLines(image), font = structural.font * structural.scaleY;
        const line = structural.lines.filter(l => l.top * structural.scaleY < (layout.headerRegion?.top ?? 0) && l.top * structural.scaleY > (layout.headerRegion?.top ?? 0) - font * 10).sort((a, b) => b.width - a.width)[0];
        if (line) {
            const left = Math.max(0, Math.floor(line.left * structural.scaleX - font * .3)), top = Math.max(0, Math.floor(line.top * structural.scaleY - font * .3));
            const bounds = { left, top, width: Math.min(layout.sourceWidth - left, Math.ceil(line.width * structural.scaleX + font * .6)), height: Math.min((layout.headerRegion?.top ?? layout.sourceHeight) - top, Math.ceil(line.height * structural.scaleY + font * .6)) };
            const worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => undefined });
            try {
                const requests: Array<{ bounds: Bounds; variant: 'native' | 'local-contrast'; region: string }> = ['native', 'local-contrast'].map(variant => ({ bounds, variant: variant as 'native' | 'local-contrast', region: 'header-line' }));
                for (const [index, request] of requests.entries()) {
                    const { bounds, variant, region } = request;
                    const began = performance.now(), prepared = await fieldVariant(image, { regionId: 'document-total-header', field: 'header', bounds, ownership: bounds }, variant);
                    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '', user_defined_dpi: '300' });
                    const { data } = await worker.recognize(prepared.image, {}, { text: true, blocks: true });
                    const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))).map(w => ({ text: w.text, confidence: w.confidence, bounds: { left: bounds.left + (w.bbox.x0 - 12) / 2, top: bounds.top + (w.bbox.y0 - 12) / 2, width: (w.bbox.x1 - w.bbox.x0) / 2, height: (w.bbox.y1 - w.bbox.y0) / 2 } }));
                    observations.push({ id: `${evidence.documentId}:5c-${region}:${variant}`, scope: 'document', field: 'header', variant: `${region}-${variant}`, raw: data.text, bounds, sourceHash: evidence.sourceHash, cropHash: hash(prepared.pixels), confidence: data.confidence, words, money: paymentMoney(data.text), durationMs: performance.now() - began }); extraPasses++;
                    if (index === 1) {
                        const current = decideDocumentTotal(layout, evidence, observations);
                        const anchor = current.labels.sort((a, b) => b.confidence - a.confidence)[0];
                        // One targeted exact-label crop, never a fuzzy label or a guessed amount.
                        if (current.cents === null && anchor && anchor.confidence < 40) {
                            const left = Math.max(0, Math.floor(anchor.bounds.left - 5)), top = Math.max(0, Math.floor(anchor.bounds.top - 5));
                            const narrow = { left, top, width: Math.min(layout.sourceWidth - left, Math.ceil(anchor.bounds.width + 10)), height: Math.min((layout.headerRegion?.top ?? layout.sourceHeight) - top, Math.ceil(anchor.bounds.height + 10)) };
                            if (narrow.width > 0 && narrow.height > 0) for (const variant of ['native', 'local-contrast'] as const) requests.push({ bounds: narrow, variant, region: 'label' });
                        }
                    }
                }
            } finally { await worker.terminate(); }
            authority = decideDocumentTotal(layout, evidence, observations);
        }
    }
    return { evidence: { ...evidence, authoritativeTotal: authority.cents, documentAuthority: authority, totalEvidence: { ...evidence.totalEvidence, authorityScope: 'legacy-footer-only' } }, authority, observations, retainedAudit: { accepted: retained.accepted.map(o => o.id), rejected: retained.rejected }, extraPasses, incrementalMs: performance.now() - start };
}
