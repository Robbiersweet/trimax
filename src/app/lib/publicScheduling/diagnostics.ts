/** Fixed-vocabulary server diagnostics. Never log inputs, tokens, URLs,
 * fingerprints, headers, error messages, or provider response bodies. */
export type SchedulingFailureCode = 'rate_http'|'rate_network'|'rate_response'|'challenge_http'|'challenge_network'|'challenge_response'|'abuse_prerequisite'|'rate_limited'|'challenge_rejected'|'abuse_unknown';
const challengeCodes = new Set(['missing-input-secret','invalid-input-secret','missing-input-response','invalid-input-response','bad-request','timeout-or-duplicate','internal-error']);
export function safeChallengeCode(value:unknown):string|undefined {
 return typeof value==='string'&&challengeCodes.has(value)?value:undefined;
}
export class SchedulingProviderError extends Error {
 readonly code: SchedulingFailureCode;
 readonly status?: number;
 readonly providerCode?:string;
 constructor(code: SchedulingFailureCode,status?:number,providerCode?:unknown){super('Scheduling provider unavailable');this.code=code;this.status=status;this.providerCode=safeChallengeCode(providerCode);}
}
export function reportSchedulingFailure(code:SchedulingFailureCode,status?:number,providerCode?:unknown){
 // Platform log envelopes supply request/deployment correlation.
 const safeCode=code==='challenge_http'?safeChallengeCode(providerCode):undefined;
 try {console.warn(JSON.stringify({event:'scheduling_failure',code,...(typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?{status}:{}),...(safeCode?{providerCode:safeCode}:{})}));}catch{/* Preserve fail-closed behavior even when logging fails. */}
}
