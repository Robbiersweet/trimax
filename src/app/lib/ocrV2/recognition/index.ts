import sharp from 'sharp';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Bounds } from '../types.ts';
import type { DocumentLayout } from '../layout/types.ts';
import type { FieldCrop, FieldObservation, FieldType } from './types.ts';
import { normalizeField } from './normalize.ts';
export function fieldCrops(layout: DocumentLayout): FieldCrop[] {
    const crops: FieldCrop[] = [];
    const add = (regionId: string, field: FieldType, region: Bounds | undefined, ownership: Bounds, rowId?: string) => {
        if (!region)
            return;
        // Two horizontal pixels of padding, no vertical expansion across authoritative ownership.
        const left = Math.max(0, Math.floor(region.left - 2));
        const right = Math.min(layout.documentBounds.width, Math.ceil(region.left + region.width + 2));
        const top = Math.max(Math.ceil(ownership.top), Math.floor(region.top));
        const bottom = Math.min(Math.floor(ownership.top + ownership.height), Math.ceil(region.top + region.height));
        if (right <= left || bottom <= top)
            throw Error('Invalid field geometry');
        crops.push({ regionId, rowId, field, bounds: { left, top, width: right - left, height: bottom - top }, ownership });
    };
    for (const row of layout.rows) {
        for (const field of ['invoice', 'amount', 'date'] as const)
            add(`${row.id}-${field}`, field, row[`${field}Region`], row.bounds, row.id);
        if (layout.columns.unit?.certainty === 'supported')
            add(`${row.id}-unit`, 'unit', row.unitRegion, row.bounds, row.id);
    }
    if (layout.headerRegion)
        add('header', 'header', layout.headerRegion, layout.headerRegion);
    if (layout.footerRegion) {
        add('footer', 'footer', layout.footerRegion, layout.footerRegion);
        add('total', 'total', layout.totalCandidateRegion, layout.footerRegion);
    }
    return crops;
}
export async function fieldVariant(source: Buffer, crop: FieldCrop, variant: 'native' | 'local-contrast') {
    const pixels = await sharp(source).extract(crop.bounds).flatten({ background: 'white' }).png().toBuffer();
    let image = pixels;
    if (variant === 'local-contrast') {
        const gray = await sharp(pixels).grayscale().raw().toBuffer({ resolveWithObject: true });
        const background = await sharp(pixels).grayscale().blur(12).raw().toBuffer();
        const data = Buffer.from(gray.data.map((v, i) => Math.max(0, Math.min(255, 245 + (v - background[i]) * 3))));
        image = await sharp(data, { raw: { width: gray.info.width, height: gray.info.height, channels: 1 } }).png().toBuffer();
    }
    // Fixed 2x interpolation helps small print; source crop remains lossless and retained.
    return { pixels, image: await sharp(image).resize(crop.bounds.width * 2, crop.bounds.height * 2).extend({ top: 12, bottom: 12, left: 12, right: 12, background: 'white' }).png().toBuffer(), scale: 2, border: 12 };
}
export async function recognizeFields(source: Buffer, layout: DocumentLayout, imageId: string) {
    const start = performance.now(), meta = await sharp(source).metadata();
    if (meta.width !== layout.documentBounds.width || meta.height !== layout.documentBounds.height)
        throw Error('Layout/source dimensions disagree');
    const crops = fieldCrops(layout), observations: FieldObservation[] = [];
    const cachePath = join(tmpdir(), 'trimax-v2-tesseract');
    await mkdir(cachePath, { recursive: true });
    const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath, gzip: true, logger: () => undefined });
    try {
        for (const crop of crops)
            for (const variant of ['native', 'local-contrast'] as const) {
                const began = performance.now();
                const whitelist = crop.field === 'invoice' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' : crop.field === 'amount' || crop.field === 'total' ? '0123456789$,.' : crop.field === 'date' ? '0123456789/-' : crop.field === 'unit' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' : '';
                const psm = crop.field === 'header' || crop.field === 'footer' ? PSM.SPARSE_TEXT : PSM.SINGLE_LINE;
                const base = { ...crop, imageId, variant, configuration: { psm, whitelist }, scale: 2, border: 12 };
                try {
                    const prepared = await fieldVariant(source, crop, variant);
                    await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist, user_defined_dpi: '300' });
                    const { data } = await worker.recognize(prepared.image, {}, { text: true, blocks: true });
                    const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))).map(w => ({ text: w.text, confidence: w.confidence, bounds: { left: crop.bounds.left + (w.bbox.x0 - prepared.border) / prepared.scale, top: crop.bounds.top + (w.bbox.y0 - prepared.border) / prepared.scale, width: (w.bbox.x1 - w.bbox.x0) / prepared.scale, height: (w.bbox.y1 - w.bbox.y0) / prepared.scale } }));
                    observations.push({ ...base, rawText: data.text, ...normalizeField(data.text, crop.field), confidence: data.confidence, durationMs: performance.now() - began, status: 'completed', words });
                }
                catch (error) {
                    observations.push({ ...base, rawText: '', ...normalizeField('', crop.field), confidence: 0, durationMs: performance.now() - began, status: 'errored', error: String(error), words: [] });
                }
            }
    }
    finally {
        await worker.terminate();
    }
    return { imageId, crops, observations, durationMs: performance.now() - start, passCount: observations.length, unitSkipped: !crops.some(c => c.field === 'unit'), totalAuthority: 'not-evaluated', businessResolution: 'not-performed' };
}
