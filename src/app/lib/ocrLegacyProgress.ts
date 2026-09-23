import { AsyncLocalStorage } from 'node:async_hooks';

// Worker-only persistence hook. HTTP recognition uses exactly the same engine without a sink.
type Sink = (stage: string, evidence: unknown) => Promise<void>;
const progress = new AsyncLocalStorage<Sink>();
export function withLegacyProgress<T>(sink: Sink, run: () => Promise<T>) {
  return progress.run(sink, run);
}
export async function legacyProgress(stage: string, evidence: unknown) {
  await progress.getStore()?.(stage, evidence);
}
