import {AsyncLocalStorage} from 'node:async_hooks';

/** Only the validated local worker supplies this capability. Request JSON and
 * Vercel callers cannot enable a model subprocess or supply model answers. */
type MatureRunner = (image: Buffer, attemptId: string) => Promise<unknown>;
const context = new AsyncLocalStorage<{run: MatureRunner; used: boolean}>();
export function withLegacyMatureFallback<T>(run: MatureRunner, task: () => Promise<T>) {
  return context.run({run, used: false}, task);
}
export function legacyMatureFallbackAvailable() {return Boolean(context.getStore());}
export async function recognizeLegacyMatureFallback(image: Buffer, attemptId: string) {
  const scope = context.getStore();
  if (!scope || scope.used) return null;
  scope.used = true;
  return scope.run(image, attemptId);
}
