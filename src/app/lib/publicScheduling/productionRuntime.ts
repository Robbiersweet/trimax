import {assertSchedulingTransport} from './transportSelection.ts';
import {createHmac} from 'node:crypto';
import type {PublicBusiness} from './domain.ts';
import type {SchedulingRpc} from './productionAdapter.ts';
import {turnstileProvider,upstashProvider} from './providers.ts';

export function productionConfig(env:Record<string,string|undefined>=process.env){
 assertSchedulingTransport(env.SCHEDULING_TRANSPORT);
 if(env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED!=='enabled'||env.VERCEL!=='1'||!['production','preview'].includes(env.VERCEL_ENV??''))throw Error('Scheduling disabled');
 const required=['NEXT_PUBLIC_TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','SCHEDULING_FINGERPRINT_SECRET','SCHEDULING_INTAKE_JWT','PUBLIC_SCHEDULING_ORIGIN','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
 for(const name of required)if(!env[name])throw Error('Scheduling configuration unavailable');
 if(env.VERCEL_ENV==='production'&&[env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,env.TURNSTILE_SECRET_KEY].some(value=>/^[123]x0+/.test(value!)))throw Error('Test challenge credentials forbidden in production');
 if(env.SCHEDULING_FINGERPRINT_SECRET!.length<32)throw Error('Invalid fingerprint configuration');
 const origin=new URL(env.PUBLIC_SCHEDULING_ORIGIN!);
 if(origin.protocol!=='https:'||origin.origin!==env.PUBLIC_SCHEDULING_ORIGIN)throw Error('Invalid scheduling origin');
 const database=new URL(env.NEXT_PUBLIC_SUPABASE_URL!);
 if(database.protocol!=='https:'||!database.hostname.endsWith('.supabase.co'))throw Error('Invalid database project');
 // This is a configuration guard, not signature validation. PostgREST validates
 // the signature before assuming the role. Never load a project signing key here.
 const claims=JSON.parse(Buffer.from(env.SCHEDULING_INTAKE_JWT!.split('.')[1]??'','base64url').toString());
 if(claims.role!=='trimax_scheduling_intake'||claims.ref!==database.hostname.split('.')[0]||!Number.isFinite(claims.exp)||claims.exp*1000<Date.now()+60000)throw Error('Restricted credential invalid or expired');
 return {origin:origin.origin,siteKey:env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,url:database.origin,key:env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,jwt:env.SCHEDULING_INTAKE_JWT!,fingerprintSecret:env.SCHEDULING_FINGERPRINT_SECRET!,providers:{fingerprintSecret:env.SCHEDULING_FINGERPRINT_SECRET!,challenge:turnstileProvider(env.TURNSTILE_SECRET_KEY!,origin.hostname),rateLimit:upstashProvider(env.UPSTASH_REDIS_REST_URL!,env.UPSTASH_REDIS_REST_TOKEN!)}};
}
export type RestrictedRpcConnection = {url:string;key:string;jwt?:string};
// Credential injection is opt-in; existing static configuration remains unchanged.
export function restrictedRpc(config:RestrictedRpcConnection,transport:typeof fetch=fetch,credential?:()=>Promise<string>):SchedulingRpc{
 const allowed=new Set(['trimax_public_scheduling_config','trimax_submit_public_service_request']);
 return {async rpc(name,args){
  if(!allowed.has(name))throw Error('RPC not allowed');
  const jwt=credential?await credential():config.jwt;
  if(!jwt)throw Error('Scheduling unavailable');
  const response=await transport(`${config.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(!response.ok){const failure=await response.json().catch(()=>null);return {data:null,error:{message:failure?.message==='Idempotency conflict'?'Idempotency conflict':'Scheduling unavailable'}};}
  return {data:await response.json(),error:null};
 }};
}
export async function productionBusiness(slug:string,client:SchedulingRpc):Promise<PublicBusiness|null>{
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>60)return null;
 const {data,error}=await client.rpc('trimax_public_scheduling_config',{p_slug:slug});
 if(error)throw Error('Settings unavailable');
 if(!data)return null;
 const business=data as PublicBusiness;
 if(business.slug!==slug||!business.enabled||business.rules.mode!=='request-only'||business.rules.ownerApprovalRequired!==true||!Array.isArray(business.requestTypes))throw Error('Invalid public configuration');
 return business;
}
// Stable across HTTP retries; token is never delivered, public status stays off.
export function unusedCapabilityHash(secret:string,slug:string,key:string){return createHmac('sha256',secret).update('disabled-status\0'+slug+'\0'+key).digest('hex');}
