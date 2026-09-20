import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { Worker } from "tesseract.js";

type Observation = Awaited<ReturnType<Worker["recognize"]>>;
const context = new AsyncLocalStorage<{scope:string;hits:number;misses:number}>();
const observations = new Map<string, { expires: number; value: Observation }>();
// Only server-produced observations enter this bounded, short-lived cache. A
// different attempt, pixel buffer or page segmentation mode is always a miss.
export function withOcrObservations<T>(scope: string | null, run: () => T): T {
  return context.run({scope:/^[0-9a-f-]{36}$/i.test(scope ?? "") ? scope! : randomUUID(),hits:0,misses:0}, run);
}
export async function observeOcr(
  worker: Worker, image: Buffer, pageMode: string,
): Promise<Observation> {
  const state = context.getStore();
  const scope = state?.scope;
  if (!scope) return worker.recognize(image, {}, { text: true, blocks: true });
  const key = `${scope}:${pageMode}:${createHash("sha256").update(image).digest("hex")}`;
  const now = Date.now();
  for (const [id, entry] of observations) if (entry.expires < now) observations.delete(id);
  const cached = observations.get(key);
  if (cached) { state!.hits++; return structuredClone(cached.value); }
  state!.misses++;
  const result = await worker.recognize(image, {}, { text: true, blocks: true });
  if (observations.size >= 64) observations.delete(observations.keys().next().value!);
  observations.set(key, { expires: now + 120_000, value: structuredClone(result) });
  return result;
}

export function ocrCacheStats() { const state=context.getStore();return {hits:state?.hits??0,misses:state?.misses??0,scope:"attempt-local",storage:"bounded-process-memory"}; }
