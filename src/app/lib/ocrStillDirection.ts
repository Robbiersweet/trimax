import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { directionEvidence } from './ocrFaint.ts';
export type OrientationObservation = { rotation:number; score:number; credible:boolean; durationMs:number; status:'completed'|'failed'; error?:string };
export async function probeDocumentDirection(image: Buffer) {
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
