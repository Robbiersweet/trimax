const protectedProject='gqknefosisnsjuzmhvts';
/** Candidate preview may use only an explicitly configured isolated project. */
export function photoRuntime(env:Record<string,string|undefined>){
 if(env.REQUEST_PHOTOS_ENABLED!=='enabled')throw Error('Photos disabled');
 const url=new URL(env.NEXT_PUBLIC_SUPABASE_URL??'');if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Photo project invalid');
 const project=url.hostname.split('.')[0];if(url.hostname!==`${project}.supabase.co`)throw Error('Photo project invalid');
 if(env.VERCEL_ENV==='production'){if(project!==protectedProject)throw Error('Photo production project mismatch');return {origins:new Set(['https://rnlcreations.com','https://app.rnlcreations.com'])};}
 const isolated=env.REQUEST_PHOTOS_ISOLATED_PROJECT;if(!isolated||isolated===protectedProject||project!==isolated||!/^[a-z]{20}$/.test(isolated))throw Error('Photo preview production access denied');
 const origin=new URL(env.REQUEST_PHOTOS_ISOLATED_ORIGIN??'');if(origin.protocol!=='https:'||origin.origin!==env.REQUEST_PHOTOS_ISOLATED_ORIGIN||origin.username||origin.password)throw Error('Photo isolated origin invalid');
 return {origins:new Set([origin.origin])};
}
