import {createHmac} from 'node:crypto';
export interface SharedRateLimitProvider {consume(input:{key:string;limit:number;windowSeconds:number}):Promise<{allowed:boolean;retryAfterSeconds?:number}>}
export interface ChallengeProvider {verify(input:{token:string;action:'public-scheduling';businessSlug:string;requestFingerprint:string}):Promise<{verified:boolean}>}
export type AbuseProviders={rateLimit:SharedRateLimitProvider;challenge:ChallengeProvider;fingerprintSecret:string};
/** trustedClientIdentity must come from a deployment-specific trusted proxy adapter,
 * never blindly from a caller-controlled X-Forwarded-For header. Raw IP is not stored. */
export async function enforceProductionAbuse(input:{businessSlug:string;challengeToken:string;trustedClientIdentity:string},providers?:AbuseProviders){
 if(!providers||providers.fingerprintSecret.length<32||!input.trustedClientIdentity||!input.challengeToken||!input.businessSlug)return {allowed:false,reason:'abuse_protection_unavailable'} as const;
 const fingerprint=createHmac('sha256',providers.fingerprintSecret).update(input.businessSlug+'\0'+input.trustedClientIdentity).digest('hex');
 try{
  const limited=await providers.rateLimit.consume({key:fingerprint,limit:5,windowSeconds:600});
  if(!limited.allowed)return {allowed:false,reason:'rate_limited',retryAfterSeconds:limited.retryAfterSeconds} as const;
  const challenge=await providers.challenge.verify({token:input.challengeToken,action:'public-scheduling',businessSlug:input.businessSlug,requestFingerprint:fingerprint});
  return challenge.verified?{allowed:true,fingerprint} as const:{allowed:false,reason:'challenge_rejected'} as const;
 }catch{return {allowed:false,reason:'abuse_protection_unavailable'} as const;}
}
