import { supabase } from '../../supabase';
import { scanSummary, type ScanSummary } from '../../ocrHistory';
import { saveScan } from '../../ocrHistoryClient';
import { DISABLED_SHADOW, isolateShadow, type ShadowFlags, type CaptureTimings } from './contract';
import type { OfflineSnapshot } from '../resolver';

export async function loadShadowFlags(businessId: string): Promise<ShadowFlags> {
  const { data, error } = await supabase.from('ocr_shadow_flags').select('enabled,native_still').eq('business_id', businessId).maybeSingle();
  return error || !data ? DISABLED_SHADOW : { enabled: data.enabled === true, nativeStill: data.native_still === true };
}
/** Detached from payment state. The server rechecks owner/admin + current flag.
 * No result from this function is used by the payment workflow. */
export function enqueueShadow(input: { businessId: string; legacy: ScanSummary; legacyObserved: unknown; imageDataUrl: string; snapshot: OfflineSnapshot; captureTimings: CaptureTimings }) {
  const shadowId = crypto.randomUUID();
  return isolateShadow(async () => {
    const blob = await (await fetch(input.imageDataUrl)).blob();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2,'0')).join('');
    const { error } = await supabase.rpc('trimax_enqueue_ocr_shadow', { p_legacy: input.legacy.attemptId, p_shadow: shadowId,
      p_session: input.legacy.attemptId, p_hash: hash, p_image: input.imageDataUrl, p_snapshot: input.snapshot, p_capture: input.captureTimings, p_legacy_observed: input.legacyObserved });
    if (error) throw Error(error.message);
  }, message => {
    const summary = { ...scanSummary(shadowId,shadowId,null,input.legacy.selectedSource,input.legacy.build), ocrEngine: 'v2-shadow' as const,
      legacyAttemptId: input.legacy.attemptId, captureSessionId: input.legacy.attemptId, result: 'failed' as const, reasons: [`Shadow enqueue failed: ${message}`] };
    void saveScan({ businessId: input.businessId, phase: 2, summary, payload: { stage: 'shadow-enqueue-failed', message } }).catch(() => console.warn('Shadow diagnostics could not be saved'));
  });
}
