import {isIP} from 'node:net';
import {SchedulingProviderError} from './diagnostics.ts';
import type {ChallengeProvider, SharedRateLimitProvider} from './abuseProtection.ts';

type Transport = typeof fetch;
export function turnstileProvider(secret:string, hostname:string, transport:Transport=fetch):ChallengeProvider {
 return {async verify({token,action}) {
  if(!secret||!hostname||!token||token.length>2048)return {verified:false};
  let response:Response;
  try{response=await transport('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:token}),signal:AbortSignal.timeout(5000),cache:'no-store'});}catch{throw new SchedulingProviderError('challenge_network');}
  if(!response.ok)throw new SchedulingProviderError('challenge_http',response.status);
  let result;try{result=await response.json();if(!result||typeof result!=='object')throw Error();}catch{throw new SchedulingProviderError('challenge_response');}
  return {verified:result.success===true&&result.hostname===hostname&&result.action===action};
 }};
}
// Atomic fixed window: INCR and TTL installation cannot be split across instances.
export const rateScript="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; local t=redis.call('TTL',KEYS[1]); if t<0 then return redis.error_reply('missing rate TTL') end; return {n,t}";
export function upstashProvider(url:string, token:string, transport:Transport=fetch):SharedRateLimitProvider {
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||!endpoint.hostname.endsWith('.upstash.io')||!token)throw Error('Invalid rate provider configuration');
 return {async consume({key,limit,windowSeconds}) {
  if(!/^[a-f0-9]{64}$/.test(key))throw Error('Invalid rate fingerprint');
  let response:Response;
  try{response=await transport(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',rateScript,'1',`trimax:scheduling:${key}`,String(windowSeconds)]),signal:AbortSignal.timeout(3000),cache:'no-store'});}catch{throw new SchedulingProviderError('rate_network');}
  if(!response.ok)throw new SchedulingProviderError('rate_http',response.status);
  let result;try{result=await response.json();if(!result||typeof result!=='object')throw Error();}catch{throw new SchedulingProviderError('rate_response');}const values=result.result;
  if(result.error||!Array.isArray(values)||values.length!==2||!Number.isSafeInteger(values[0])||values[0]<1||!Number.isSafeInteger(values[1])||values[1]<0)throw new SchedulingProviderError('rate_response');
  return {allowed:values[0]<=limit,retryAfterSeconds:Math.max(1,values[1])};
 }};
}
/** Only Vercel's overwritten deployment header is accepted. Never XFF/Real-IP.
 * Do not mount this adapter behind an alternate non-Vercel ingress. */
export function trustedVercelIdentity(request:Request,env:Record<string,string|undefined>=process.env):string {
 if(env.VERCEL!=='1'||!['production','preview'].includes(env.VERCEL_ENV??''))throw Error('Trusted ingress unavailable');
 const raw=request.headers.get('x-vercel-forwarded-for')?.trim()??'';
 if(!isIP(raw))throw Error('Trusted identity unavailable');
 return isIP(raw)===6?new URL(`http://[${raw}]/`).hostname.slice(1,-1):raw;
}
