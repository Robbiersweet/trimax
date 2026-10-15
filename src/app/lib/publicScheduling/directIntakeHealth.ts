// Disabled integration preparation: no networking, credentials, provider errors or live alerts.
export const directIntakeMonitorEnabled = false;
export type DirectHealthObservation = {
  expectedRole: string; actualRole: string; loginAllowed: boolean;
  configurationExecutable: boolean; submissionExecutable: boolean;
  forbiddenApplicationAccess: boolean; configurationAccepted: boolean;
  observedAt: number; now: number;
};
export function classifySyntheticDirectHealth(mode: 'synthetic', h: DirectHealthObservation) {
  if (mode !== 'synthetic') throw Error('DIRECT_MONITOR_DISABLED');
  const codes: string[] = [];
  if (!Number.isFinite(h.observedAt) || !Number.isFinite(h.now) || h.observedAt > h.now || h.now - h.observedAt > 300_000) codes.push('STALE_HEARTBEAT');
  if (!h.expectedRole || h.actualRole !== h.expectedRole) codes.push('ROLE_MISMATCH');
  if (h.loginAllowed !== true) codes.push('LOGIN_REVOKED');
  if (h.configurationExecutable !== true || h.submissionExecutable !== true) codes.push('RPC_PERMISSION_DENIED');
  if (h.forbiddenApplicationAccess !== false) codes.push('PRIVILEGE_DRIFT');
  if (h.configurationAccepted !== true) codes.push('CONFIG_UNAVAILABLE');
  // A successful pooler handshake is deliberately not a health or revocation verdict.
  return { intakeAvailable: codes.length === 0, codes };
}
