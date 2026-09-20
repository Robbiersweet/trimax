/* eslint-disable @typescript-eslint/no-require-imports -- Offline invoice recognition study only. */
const sharp = require('sharp');
const { PSM } = require('tesseract.js');
const whitelist = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
const configurations = [
    ['native-1', 'native', 1, 'cubic'], ['gray-1', 'gray', 1, 'cubic'],
    ['contrast-1', 'contrast', 1, 'cubic'], ['sharp-1', 'sharp', 1, 'cubic'],
    ['gray-2', 'gray', 2, 'cubic'], ['gray-3', 'gray', 3, 'cubic'],
    ['gray-4', 'gray', 4, 'cubic'], ['contrast-3', 'contrast', 3, 'cubic'],
    ['sharp-3', 'sharp', 3, 'cubic'], ['gray-3-lanczos', 'gray', 3, 'lanczos3']
].map(([id, preprocessing, scale, interpolation]) => ({ id, preprocessing, scale, interpolation, mode: PSM.SINGLE_LINE, whitelist, padding: 0 }));
function normalizeToken(raw) {
    const transformations = [];
    let text = raw;
    for (const [name, fn] of [['uppercase', s => s.toUpperCase()], ['standardize hyphens', s => s.replace(/[‐‑‒–—−]/g, '-')], ['remove whitespace', s => s.replace(/\s+/g, '')], ['trim edge punctuation', s => s.replace(/^[^A-Z0-9-]+|[^A-Z0-9-]+$/g, '')]]) {
        const next = fn(text);
        if (next !== text)
            transformations.push(name);
        text = next;
    }
    // Format candidate only, explicitly separate from literal normalization.
    const structuralCandidate = /^INV\d{4,}$/.test(text) ? { text: text.replace(/^INV/, 'INV-'), transformation: 'Insert separator after observed INV prefix; no digits changed' } : null;
    return { normalizedText: text, transformations, structuralCandidate };
}
function paddedBounds(crop, config, dimensions) {
    const delta = Math.round(crop.bounds.width * (config.padding || 0));
    const left = Math.max(0, crop.bounds.left - delta), right = Math.min(dimensions.width, crop.bounds.left + crop.bounds.width + delta);
    // Existing crop already occupies the entire row. Vertical padding must clamp to ownership.
    const v = Math.round(crop.bounds.height * (config.verticalPadding || 0));
    const top = Math.max(Math.ceil(crop.ownership.top), crop.bounds.top - v), bottom = Math.min(Math.floor(crop.ownership.top + crop.ownership.height), crop.bounds.top + crop.bounds.height + v);
    return { left, top, width: right - left, height: bottom - top };
}
async function prepare(source, crop, config) {
    const start = performance.now(), dimensions = await sharp(source).metadata(), bounds = paddedBounds(crop, config, dimensions);
    const authoritative = await sharp(source).extract(bounds).flatten({ background: 'white' }).png().toBuffer();
    let image = authoritative;
    if (config.preprocessing !== 'native')
        image = await sharp(image).grayscale().png().toBuffer();
    if (config.preprocessing === 'contrast') {
        const g = await sharp(image).grayscale().raw().toBuffer({ resolveWithObject: true }), b = await sharp(image).grayscale().blur(12).raw().toBuffer();
        const data = Buffer.from(g.data.map((v, i) => Math.max(0, Math.min(255, 245 + (v - b[i]) * 3))));
        image = await sharp(data, { raw: { width: g.info.width, height: g.info.height, channels: 1 } }).png().toBuffer();
    }
    if (config.preprocessing === 'sharp')
        image = await sharp(image).sharpen({ sigma: .6, m1: .3, m2: .7 }).png().toBuffer();
    image = await sharp(image).resize({ width: bounds.width * config.scale, height: bounds.height * config.scale, kernel: config.interpolation }).png().toBuffer();
    const raw = await sharp(image).grayscale().raw().toBuffer();
    const saturated = raw.filter(v => v === 0 || v === 255).length / raw.length;
    const border = 12;
    image = await sharp(image).extend({ top: border, bottom: border, left: border, right: border, background: 'white' }).png().toBuffer();
    return { image, authoritative, bounds, border, saturationFraction: saturated, preprocessingMs: performance.now() - start };
}
async function observe(worker, source, crop, config, imageId) {
    const start = performance.now(), p = await prepare(source, crop, config);
    await worker.setParameters({ tessedit_pageseg_mode: config.mode, tessedit_char_whitelist: config.whitelist, user_defined_dpi: '300' });
    const began = performance.now();
    let data, error;
    try {
        data = (await worker.recognize(p.image, {}, { text: true, blocks: true })).data;
    }
    catch (e) {
        error = String(e);
    }
    const ocrMs = performance.now() - began;
    return { rowId: crop.rowId, imageId, cropVariant: config.id, ...config, cropBounds: p.bounds, ownership: crop.ownership, rawText: data?.text ?? '', ...normalizeToken(data?.text ?? ''), confidence: data?.confidence ?? 0, durationMs: performance.now() - start, preprocessingMs: p.preprocessingMs, ocrMs, saturationFraction: p.saturationFraction, status: error ? 'errored' : 'completed', error };
}
// Projection experiment only. No knowledge of prefix length, expected digit count or labels.
async function segments(image, threshold = 5) {
    const { data, info } = await sharp(image).grayscale().raw().toBuffer({ resolveWithObject: true });
    const bg = await sharp(image).grayscale().blur(8).raw().toBuffer();
    const active = Array(info.width).fill(false);
    for (let x = 0; x < info.width; x++) {
        let count = 0;
        for (let y = 2; y < info.height - 2; y++)
            if (bg[y * info.width + x] - data[y * info.width + x] > threshold)
                count++;
        active[x] = count >= 3;
    }
    const runs = [];
    let left = -1;
    for (let x = 0; x <= info.width; x++) {
        if (active[x]) {
            if (left < 0)
                left = x;
        }
        else if (left >= 0) {
            if (x - left >= 2)
                runs.push({ left, top: 0, width: x - left, height: info.height });
            left = -1;
        }
    }
    return runs;
}
function phase4Gate(rows) {
    return rows.length === 5 && rows.filter(r => r.exact).length >= 4
        && rows.reduce((s, r) => s + r.characterAccuracy, 0) / rows.length >= .9
        && rows.every(r => r.exact || (r.distance <= 2 && r.characterAccuracy >= .75
            && !r.changes.some(c => /[0-9]/.test(c.expected) && !c.observed)));
}
module.exports = { configurations, normalizeToken, paddedBounds, prepare, observe, segments, whitelist, phase4Gate };
