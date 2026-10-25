// Explicit synthetic acceptance only. Never selected by production or ordinary previews.
export const labProject='yzyfmvoswucyauogueca';
export const labRole='trimax_lab_website_intake_20261025';
export function isolatedLabConfig(env:Record<string,string|undefined>=process.env){
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.RNL_ISOLATED_INTAKE_ENABLED!=='enabled')throw Error('LAB_DISABLED');
 const origin=new URL(env.RNL_ISOLATED_INTAKE_ORIGIN??'');
 if(origin.origin!==env.RNL_ISOLATED_INTAKE_ORIGIN||origin.protocol!=='https:'||!origin.hostname.endsWith('.vercel.app')||origin.hostname!==env.VERCEL_URL)throw Error('LAB_ORIGIN_REJECTED');
 const database=new URL(env.RNL_SCHEDULING_DATABASE_URL??'');
 if(database.protocol!=='postgres:'||database.hostname!=='aws-1-us-west-2.pooler.supabase.com'||database.port!=='5432'||database.pathname!=='/postgres'||database.username!==`${labRole}.${labProject}`||database.password.length<40||database.search||database.hash)throw Error('LAB_DATABASE_REJECTED');
 const slug=env.RNL_ISOLATED_INTAKE_SLUG;
 if(!['trimax-acceptance-20261026-a','trimax-acceptance-20261026-b'].includes(slug??'')||!env.RNL_ISOLATED_FINGERPRINT_SECRET||env.RNL_ISOLATED_FINGERPRINT_SECRET.length<32)throw Error('LAB_CONFIGURATION_REJECTED');
 return {origin:origin.origin,database,slug:slug!,fingerprintSecret:env.RNL_ISOLATED_FINGERPRINT_SECRET};
}
export function isolatedLabRequest(request:Request,env:Record<string,string|undefined>=process.env){
 try{const config=isolatedLabConfig(env);return new URL(request.url).origin===config.origin&&request.headers.get('origin')===config.origin?config:null;}catch{return null;}
}
