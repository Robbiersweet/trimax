/** Fixed-vocabulary server diagnostics. Never log inputs, tokens, URLs,
 * fingerprints, headers, error messages, or provider response bodies. */
export type SchedulingFailureCode = 'rate_http'|'rate_network'|'rate_response'|'challenge_http'|'challenge_network'|'challenge_response'|'abuse_prerequisite'|'rate_limited'|'challenge_rejected'|'abuse_unknown';
export class SchedulingProviderError extends Error {
 readonly code: SchedulingFailureCode;
 readonly status?: number;
 constructor(code: SchedulingFailureCode,status?:number){super('Scheduling provider unavailable');this.code=code;this.status=status;}
}
export function reportSchedulingFailure(code:SchedulingFailureCode,status?:number){
 // Platform log envelopes supply request/deployment correlation.
 try {console.warn(JSON.stringify({event:'scheduling_failure',code,...(typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?{status}:{})}));}catch{/* Preserve fail-closed behavior even when logging fails. */}
}
