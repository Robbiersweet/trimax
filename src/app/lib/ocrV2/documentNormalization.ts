import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorker, OEM, PSM } from "tesseract.js";
import { directionEvidence } from "../ocrFaint.ts";
import { detectDocumentGeometry, rectifyDocument } from "./documentGeometry.ts";
import type { OcrV2Foundation, OrientationObservation } from "./types.ts";
export async function lightingVariants(image: Buffer) {
    const gray = await sharp(image).flatten({ background: 'white' }).grayscale().raw().toBuffer({ resolveWithObject: true }), width = gray.info.width, height = gray.info.height;
    const background = await sharp(image).flatten({ background: 'white' }).grayscale().blur(24).raw().toBuffer();
    const enhanced = Buffer.alloc(gray.data.length), threshold = Buffer.alloc(gray.data.length);
    for (let i = 0; i < enhanced.length; i++) {
        enhanced[i] = Math.max(0, Math.min(255, 240 + (gray.data[i] - background[i]) * 3));
        threshold[i] = background[i] - gray.data[i] > 4 ? 0 : 255;
    }
    const raw = { width, height, channels: 1 as const };
    return {
        grayscale: await sharp(gray.data, { raw }).png().toBuffer(),
        "local-contrast": await sharp(enhanced, { raw }).png().toBuffer(),
        "light-sharpen": await sharp(gray.data, { raw }).sharpen({ sigma: .6, m1: .3, m2: .7 }).png().toBuffer(),
        "adaptive-threshold-experimental": await sharp(threshold, { raw }).png().toBuffer(),
    };
}
async function direction(image: Buffer) {
    const dimensions = await sharp(image).metadata();
    // A postage-stamp/empty input cannot support text direction. Preserve it and
    // report uncertainty instead of starting a recognizer on an invalid text area.
    if (Math.min(dimensions.width ?? 0, dimensions.height ?? 0) < 32)
        return { rotation: 0, certain: false, observations: [] as OrientationObservation[] };
    const preview = await sharp(image).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const observations: OrientationObservation[] = [];
    const cachePath = join(tmpdir(), "trimax-v2-tesseract");
    await mkdir(cachePath, { recursive: true });
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
        worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath, gzip: true, logger: () => undefined });
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' });
        for (const rotation of [0, 90, 180, 270]) {
            const start = performance.now();
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                const rotated = await sharp(preview).rotate(rotation).png().toBuffer();
                const result = await Promise.race([worker.recognize(rotated, {}, { text: true, blocks: true }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Orientation observation exceeded 2 seconds')), 2000); })]);
                const evidence = directionEvidence(result.data);
                observations.push({ rotation, score: evidence.score, credible: evidence.credible, status: 'completed', durationMs: performance.now() - start });
            }
            catch (error) {
                observations.push({ rotation, score: 0, credible: false, status: 'failed', durationMs: performance.now() - start, error: error instanceof Error ? error.message : String(error) });
                break;
            }
            finally {
                clearTimeout(timer);
            }
        }
    }
    catch (error) {
        observations.push({ rotation: 0, score: 0, credible: false, status: 'failed', durationMs: 0, error: error instanceof Error ? error.message : String(error) });
    }
    finally {
        await worker?.terminate().catch(() => undefined);
    }
    const ranked = observations.filter(p => p.credible).sort((a, b) => b.score - a.score);
    const certain = observations.length === 4 && observations.every(p => p.status === 'completed') && ranked.length > 0 && (!ranked[1] || ranked[1].score < ranked[0].score * .9);
    return { rotation: certain ? ranked[0].rotation : 0, certain, observations };
}
export async function pixelMetrics(image: Buffer, reference?: Buffer) {
    const raw = await sharp(image).flatten({ background: 'white' }).grayscale().raw().toBuffer({ resolveWithObject: true }), background = await sharp(image).flatten({ background: 'white' }).grayscale().blur(8).raw().toBuffer();
    let black = 0, white = 0, contrast = 0, strokes = 0;
    for (let i = 0; i < raw.data.length; i++) {
        const v = raw.data[i];
        if (v === 0)
            black++;
        if (v === 255)
            white++;
        const delta = background[i] - v;
        if (delta >= 2 && delta <= 80) {
            contrast += delta;
            strokes++;
        }
    }
    let weak = 0, retained = 0;
    if (reference) {
        const native = await sharp(reference).flatten({ background: 'white' }).grayscale().raw().toBuffer(), nativeBackground = await sharp(reference).flatten({ background: 'white' }).grayscale().blur(8).raw().toBuffer();
        for (let i = 0; i < native.length; i++) {
            const delta = nativeBackground[i] - native[i];
            if (delta >= 2 && delta <= 12) {
                weak++;
                if (background[i] - raw.data[i] >= 1)
                    retained++;
            }
        }
    }
    return { clippedBlackFraction: black / raw.data.length, clippedWhiteFraction: white / raw.data.length, strokeContrast: strokes ? contrast / strokes : 0, weakStrokeRetention: weak ? retained / weak : null };
}
/** No fixture labels, invoice records, payment APIs or production route imports. */
export async function normalizeDocument(original: Buffer) {
    const start = performance.now(), meta = await sharp(original, { limitInputPixels: 48000000, failOn: 'error' }).metadata();
    if (!meta.width || !meta.height || (meta.pages ?? 1) > 1)
        throw Error('Expected one still image, not an animation/multipage document');
    const normalizedFull = await sharp(original, { limitInputPixels: 48000000, failOn: 'error' }).rotate().flatten({ background: 'white' }).toColourspace('srgb').png().toBuffer();
    const fullMeta = await sharp(normalizedFull).metadata(), decodeMs = performance.now() - start;
    let stage = performance.now();
    const geometry = await detectDocumentGeometry(normalizedFull), geometryMs = performance.now() - stage;
    stage = performance.now();
    const rectified = await rectifyDocument(normalizedFull, geometry), rectificationMs = performance.now() - stage;
    geometry.perspectiveTransform = rectified.matrix;
    stage = performance.now();
    const prepared = await lightingVariants(rectified.image);
    let variantsMs = performance.now() - stage;
    stage = performance.now();
    const orientation = await direction(prepared['local-contrast']), orientationMs = performance.now() - stage;
    stage = performance.now();
    const rotate = async (bytes: Buffer) => orientation.rotation ? sharp(bytes).rotate(orientation.rotation).png().toBuffer() : bytes;
    const documentColor = await rotate(rectified.image), variants: Record<string, Buffer> = {};
    for (const [name, bytes] of Object.entries(prepared))
        variants[name] = await rotate(bytes);
    const variantMetrics: OcrV2Foundation['variants'] = [];
    for (const [name, bytes] of Object.entries({ 'native-color': documentColor, ...variants }))
        variantMetrics.push({ name, authoritative: name === 'native-color', purpose: name.includes('threshold') ? 'Diagnostic experiment only; not a default OCR source' : 'Preserved color or non-binary recognition candidate', ...await pixelMetrics(bytes, documentColor) });
    variantsMs += performance.now() - stage;
    const documentMeta = await sharp(documentColor).metadata();
    const warnings = [];
    if (!geometry.reliable)
        warnings.push(geometry.reason);
    if (!orientation.certain)
        warnings.push('Direction uncertain; retained pixels without discarding the still.');
    const evidence: OcrV2Foundation = { engine: 'v2', version: 'phase1-optical-1', stage: 'optical-foundation', sourceImage: { sha256: createHash('sha256').update(original).digest('hex'), width: meta.width, height: meta.height, format: meta.format ?? 'unknown', bytes: original.length, exifOrientation: meta.orientation ?? null }, normalization: { exifAppliedOnce: true, rotation: orientation.rotation, orientationCertain: orientation.certain, orientationObservations: orientation.observations, originalNormalizedDimensions: { width: fullMeta.width!, height: fullMeta.height! }, documentDimensions: { width: documentMeta.width!, height: documentMeta.height! }, perspectiveApplied: Boolean(rectified.matrix), deskewDegrees: geometry.reliable ? geometry.angle : 0, resampling: rectified.matrix ? 'One bilinear projective resampling; right-angle rotation is lossless' : 'No projective resampling', warnings }, documentGeometry: geometry, variants: variantMetrics, metrics: { decodeMs, geometryMs, rectificationMs, variantsMs, orientationMs, completeMs: performance.now() - start, ocrPassCount: orientation.observations.length }, result: 'foundation-only-no-business-resolution' };
    return { normalizedFull, documentColor, variants, evidence };
}
