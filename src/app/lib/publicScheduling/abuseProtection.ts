import {createHmac} from 'node:crypto';
import {SchedulingProviderError,reportSchedulingFailure} from './diagnostics.ts';
export interface SharedRateLimitProvider {consume(input:{key:string;limit:number;windowSeconds:number}):Promise<{allowed:boolean;retryAfterSeconds?:number}>}
export interface ChallengeProvider {verify(input:{token:string;action:'public-scheduling';businessSlug:string;requestFingerprint:string}):Promise<{verified:boolean}>}
export type AbuseProviders={rateLimit:SharedRateLimitProvider;challenge:ChallengeProvider;fingerprintSecret:string};
/** trustedClientIdentity must come from a deployment-specific trusted proxy adapter,
 * never blindly from a caller-controlled X-Forwarded-For header. Raw IP is not stored. */
export async function enforceProductionAbuse(input:{businessSlug:string;challengeToken:string;trustedClientIdentity:string},providers?:AbuseProviders){
 if(!providers||providers.fingerprintSecret.length<32||!input.trustedClientIdentity||!input.challengeToken||!input.businessSlug){reportSchedulingFailure('abuse_prerequisite');return {allowed:false,reason:'abuse_protection_unavailable'} as const;}
 const fingerprint=createHmac('sha256',providers.fingerprintSecret).update(input.businessSlug+'\0'+input.trustedClientIdentity).digest('hex');
 try{
  const limited=await providers.rateLimit.consume({key:fingerprint,limit:5,windowSeconds:600});
  if(!limited.allowed){reportSchedulingFailure('rate_limited');return {allowed:false,reason:'rate_limited',retryAfterSeconds:limited.retryAfterSeconds} as const;}
  const challenge=await providers.challenge.verify({token:input.challengeToken,action:'public-scheduling',businessSlug:input.businessSlug,requestFingerprint:fingerprint});
  if(!challenge.verified)reportSchedulingFailure('challenge_rejected');
  return challenge.verified?{allowed:true,fingerprint} as const:{allowed:false,reason:'challenge_rejected'} as const;
 }catch(error){reportSchedulingFailure(error instanceof SchedulingProviderError?error.code:'abuse_unknown',error instanceof SchedulingProviderError?error.status:undefined,error instanceof SchedulingProviderError?error.providerCode:undefined);return {allowed:false,reason:'abuse_protection_unavailable'} as const;}
}
