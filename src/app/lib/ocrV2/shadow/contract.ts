/** Diagnostics only. These types intentionally expose no payment-writing callback. */
export const SHADOW_VERSION = 'phase6-shadow-1';
export type ShadowFlags = { enabled: boolean; nativeStill: boolean };
export const DISABLED_SHADOW: ShadowFlags = { enabled: false, nativeStill: false };
export function shadowAllowed(flags: ShadowFlags, role: string | null | undefined) {
  return flags.enabled === true && (role === 'owner' || role === 'admin');
}
export type CaptureTimings = {
  captureOpenedAt: number | null; stillReturnedAt: number | null;
  previewPaintOpportunityAt: number | null; legacyCompletedAt?: number;
  cameraIndicatorMs: null; // Native camera indicator is not observable by browser JS.
};
export type ShadowLink = {
  ocrEngine: 'legacy' | 'v2-shadow'; captureSessionId: string;
  legacyAttemptId: string; shadowAttemptId: string;
  sourceImageHash: string; sourceDescription: string;
  sameInputBytes: true; captureTimings: CaptureTimings;
};
export async function isolateShadow<T>(run: () => Promise<T>, failure: (message: string) => void) {
  try { return await run(); }
  catch (error) { failure(error instanceof Error ? error.message : String(error)); return undefined; }
}
export function assertUnverifiedInput(input: Record<string, unknown>) {
  const allowed = new Set(['attemptId', 'captureSessionId', 'sourceImageHash', 'build', 'snapshot']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw Error('Unexpected shadow inference input; verified truth is scoring-only');
}
