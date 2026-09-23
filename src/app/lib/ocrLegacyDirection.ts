import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { directionEvidence } from './ocrFaint.ts';

type ProbeWorker = Pick<Worker, 'recognize' | 'setParameters' | 'terminate'>;
type Observation = {
  rotation: number; startedAt: string; started: true; recognitionStarted: boolean;
  status: 'completed' | 'timed-out' | 'errored'; durationMs: number;
  score: number; credible: boolean; words: number; unique: number; lines: number;
  rawText: string; signals: { headers: number; money: number; dates: number };
  error?: string;
};
const CANDIDATE_MS = 2000;
const WORKER_START_MS = 5000;
class ProbeTimeout extends Error {}
async function bounded<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ProbeTimeout(message)), ms); })]); }
  finally { clearTimeout(timer); }
}

/** Legacy-only direction selection. Timed-out workers cannot queue sibling work.
 * A recognition result is evidence only after recognize() completes; late results
 * from a terminated candidate never enter another candidate's observation. */
export async function probeLegacyDirection(image: Buffer, factory?: () => Promise<ProbeWorker>) {
  const startedAt = new Date().toISOString(), start = performance.now();
  const preview = await sharp(image).resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const meta = await sharp(preview).metadata();
  const cachePath = join(tmpdir(), 'trimax-v2-tesseract');
  await mkdir(cachePath, { recursive: true });
  const makeWorker = factory ?? (() => createWorker('eng', OEM.LSTM_ONLY, { cachePath, gzip: true, logger: () => undefined }));
  const observations: Observation[] = [];
  let worker: ProbeWorker | undefined;
  async function release() { const old = worker; worker = undefined; await old?.terminate().catch(() => undefined); }
  try {
    for (const rotation of [0, 90, 180, 270]) {
      const candidateStart = performance.now();
      const observation: Observation = { rotation, startedAt: new Date().toISOString(), started: true, recognitionStarted: false, status: 'errored', durationMs: 0, score: 0, credible: false, words: 0, unique: 0, lines: 0, rawText: '', signals: { headers: 0, money: 0, dates: 0 } };
      try {
        if (!worker) {
          let expired = false;
          const pending = makeWorker().then(async made => { if (expired) await made.terminate().catch(() => undefined); return made; });
          try { worker = await bounded(pending, WORKER_START_MS, 'Orientation worker initialization exceeded 5 seconds'); }
          catch (error) { expired = true; throw error; }
          await bounded(worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' }), WORKER_START_MS, 'Orientation worker configuration exceeded 5 seconds');
        }
        const rotated = await sharp(preview).rotate(rotation).png().toBuffer();
        observation.recognitionStarted = true;
        const result = await bounded(worker.recognize(rotated, {}, { text: true, blocks: true }), CANDIDATE_MS, 'Orientation observation exceeded 2 seconds');
        Object.assign(observation, directionEvidence(result.data));
        observation.rawText = result.data.text;
        observation.signals = {
          headers: (result.data.text.match(/\b(invoice|amount|date|total|property|account|description|check)\b/gi) ?? []).length,
          money: (result.data.text.match(/\b\d[\d,]*\.\d{2}\b/g) ?? []).length,
          dates: (result.data.text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) ?? []).length,
        };
        observation.status = 'completed';
      } catch (error) {
        observation.status = error instanceof ProbeTimeout ? 'timed-out' : 'errored';
        observation.error = error instanceof Error ? error.message : String(error);
        // Recognition cannot be cancelled with Promise.race alone. Terminate it
        // before creating a fresh worker for the next independent angle.
        await release();
      } finally { observation.durationMs = performance.now() - candidateStart; observations.push(observation); }
    }
  } finally { await release(); }
  const ranked = observations.filter(o => o.status === 'completed' && o.credible).sort((a, b) => b.score - a.score);
  const certain = ranked.length > 0 && (!ranked[1] || ranked[1].score < ranked[0].score * .9);
  return { startedAt, orientationProbeStarted: true, durationMs: performance.now() - start, candidateBudgetMs: CANDIDATE_MS,
    previewDimensions: { width: meta.width, height: meta.height }, rotation: certain ? ranked[0].rotation : null, certain, observations };
}
