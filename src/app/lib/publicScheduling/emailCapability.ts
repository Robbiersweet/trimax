import {emailMode} from './emailProvider.ts';
import {createHmac} from 'node:crypto';
export function emailLinkToken(outboxId:string,secret:string){if(!secret||!outboxId)throw Error('email_link_unavailable');return createHmac('sha256',secret).update('trimax-request-email-capability-v1\0'+outboxId).digest('base64url');}
export function emailLinkOrigin(env:Record<string,string|undefined>){
 const configured=env.TRIMAX_EMAIL_PUBLIC_ORIGIN;
 if(env.VERCEL_ENV==='production'){
  if(configured!=='https://app.rnlcreations.com')throw Error('email_link_origin_unavailable');
  return configured;
 }
 // Vercel supplies the immutable deployment hostname only while building/running
 // that deployment. Never derive a capability destination from request headers.
 const host=env.VERCEL_URL;
 if(env.VERCEL_ENV!=='preview'||emailMode(env)!=='test'||!host||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(host))throw Error('email_link_origin_unavailable');
 const origin=`https://${host}`;
 if(configured!==undefined&&configured!==origin)throw Error('email_link_origin_unavailable');
 return origin;
}
