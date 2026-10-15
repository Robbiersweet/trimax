// Health-only contract deliberately has no token, ciphertext, key or decryption methods.
export const credentialMonitorEnabled = false;
export type Health = { disabled: boolean; expiresAt: number; lastSuccessAt: number; heartbeatAt: number; phase: 'ready' | 'prepared' | 'sent' | 'staged' | 'recovery_required'; phaseDeadline: number | null; integrity?: 'ok' | 'failed'; consecutiveProviderRejections?: number };
export type AlertCode = 'HEALTH_UNAVAILABLE' | 'EXPIRING' | 'EXPIRED' | 'MISSED_HEARTBEAT' | 'STUCK_PHASE' | 'RENEWAL_OVERDUE' | 'RECOVERY_REQUIRED' | 'INTEGRITY_FAILURE' | 'PROVIDER_REJECTIONS';
export interface HealthReader { read(): Promise<Health> }
export interface MonitorJournal {
  /** Atomic unique incident key; durable outbox insertion, not a send-then-mark dedupe. */
  enqueueOnce(alert: { key: string; code: AlertCode; observedAt: number }): Promise<void>;
}
/** Invoked only by synthetic tests. Hosted monitor must have an independent external heartbeat observer. */
export async function runSyntheticCredentialMonitor(input: { mode: 'synthetic'; reader: HealthReader; journal: MonitorJournal; now: number }) {
  if (input.mode !== 'synthetic' || !Number.isFinite(input.now)) throw Error('MONITOR_DISABLED');
  const codes: AlertCode[] = [];
  try {
    const h = await input.reader.read();
    if (typeof h.disabled !== 'boolean' || (h.integrity !== undefined && !['ok','failed'].includes(h.integrity)) || (h.consecutiveProviderRejections !== undefined && (!Number.isInteger(h.consecutiveProviderRejections) || h.consecutiveProviderRejections < 0 || h.consecutiveProviderRejections > 1000000))) throw Error('INVALID_HEALTH');
    if (![h.expiresAt, h.lastSuccessAt, h.heartbeatAt].every(Number.isFinite) || h.lastSuccessAt > input.now || h.heartbeatAt > input.now || !['ready','prepared','sent','staged','recovery_required'].includes(h.phase) || (['prepared','sent','staged'].includes(h.phase) && !Number.isFinite(h.phaseDeadline))) throw Error('INVALID_HEALTH');
    if (h.expiresAt <= input.now) codes.push('EXPIRED');
    else if (h.expiresAt - input.now <= 15 * 60_000) codes.push('EXPIRING');
    if (input.now - h.heartbeatAt > 5 * 60_000) codes.push('MISSED_HEARTBEAT');
    if (input.now - h.lastSuccessAt > 45 * 60_000) codes.push('RENEWAL_OVERDUE');
    if (['prepared','sent','staged'].includes(h.phase) && h.phaseDeadline! <= input.now) codes.push('STUCK_PHASE');
    if (h.integrity === 'failed') codes.push('INTEGRITY_FAILURE');
    if ((h.consecutiveProviderRejections ?? 0) >= 3) codes.push('PROVIDER_REJECTIONS');
    if (h.disabled || h.phase === 'recovery_required') codes.push('RECOVERY_REQUIRED');
  } catch { codes.push('HEALTH_UNAVAILABLE'); }
  // Fixed codes only: never propagate provider errors, metadata, identities, or secret material.
  for (const code of codes) await input.journal.enqueueOnce({ key: `${code}:${Math.floor(input.now / 900_000)}`, code, observedAt: input.now });
  return codes;
}

