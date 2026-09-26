import { AsyncLocalStorage } from 'node:async_hooks';

// Worker-only persistence hook. HTTP recognition uses exactly the same engine without a sink.
type Sink = (stage: string, evidence: unknown) => Promise<void>;
const progress = new AsyncLocalStorage<{sink: Sink; recovery?: unknown}>();
export function withLegacyProgress<T>(sink: Sink, run: () => Promise<T>, recovery?: unknown) {
  return progress.run({sink, recovery}, run);
}
export async function legacyProgress(stage: string, evidence: unknown) {
  await progress.getStore()?.sink(stage, evidence);
}
// Only the authenticated background worker supplies this context, never request JSON.
export function completedLegacyRecognition<T>(): T | undefined {
  return progress.getStore()?.recovery as T | undefined;
}
