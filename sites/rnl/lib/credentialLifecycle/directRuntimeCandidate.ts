import 'server-only';
import pg from 'pg';
import {createReviewedDirectIntegration} from './directIntegrationReview.ts';
import {turnstileProvider,upstashProvider} from '../../.shared/lib/publicScheduling/providers.ts';
/** Source-controlled release boundary. Never changed by an environment variable. */
export const directRuntimeReleaseApproved=false;
export function createDisabledDirectRuntime(env:Record<string,string|undefined>=process.env){
 if(!directRuntimeReleaseApproved)throw Error('DIRECT_RELEASE_NOT_APPROVED');
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED!=='enabled'||env.SCHEDULING_TRANSPORT!=='direct-postgres')throw Error('DIRECT_DISABLED');
 const required=['SCHEDULING_DB_PASSWORD','SCHEDULING_DB_CA_PEM','SCHEDULING_FINGERPRINT_SECRET','NEXT_PUBLIC_TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'];
 if(required.some(k=>!env[k])||env.PUBLIC_SCHEDULING_ORIGIN!=='https://rnlcreations.com'||env.SCHEDULING_FINGERPRINT_SECRET!.length<32)throw Error('DIRECT_CONFIGURATION_REJECTED');
 if([env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,env.TURNSTILE_SECRET_KEY].some(v=>/^[123]x0+/.test(v!)))throw Error('TEST_CHALLENGE_FORBIDDEN');
 const transport=createReviewedDirectIntegration(pg,{mode:'offline-review',project:'gqknefosisnsjuzmhvts',role:'trimax_scheduling_web',database:'postgres',host:'aws-1-us-west-2.pooler.supabase.com',verifiedHost:'aws-1-us-west-2.pooler.supabase.com',port:6543,password:env.SCHEDULING_DB_PASSWORD!,ca:env.SCHEDULING_DB_CA_PEM!});
 return {client:transport.rpc,config:{origin:'https://rnlcreations.com',fingerprintSecret:env.SCHEDULING_FINGERPRINT_SECRET!,providers:{fingerprintSecret:env.SCHEDULING_FINGERPRINT_SECRET!,challenge:turnstileProvider(env.TURNSTILE_SECRET_KEY!,'rnlcreations.com'),rateLimit:upstashProvider(env.UPSTASH_REDIS_REST_URL!,env.UPSTASH_REDIS_REST_TOKEN!)}},status:transport.status,stop:transport.stop};
}
