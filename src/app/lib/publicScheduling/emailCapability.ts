import {createHmac} from 'node:crypto';
export function emailLinkToken(outboxId:string,secret:string){if(!secret||!outboxId)throw Error('email_link_unavailable');return createHmac('sha256',secret).update('trimax-request-email-capability-v1\0'+outboxId).digest('base64url');}
export function emailLinkOrigin(env:Record<string,string|undefined>){const origin=env.TRIMAX_EMAIL_PUBLIC_ORIGIN;if(!origin||new URL(origin).protocol!=='https:'||new URL(origin).origin!==origin)throw Error('email_link_origin_unavailable');return origin;}
