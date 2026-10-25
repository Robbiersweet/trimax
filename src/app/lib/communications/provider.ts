import {createHmac, timingSafeEqual} from 'node:crypto';

export type SmsConfig = {business_id:string;provider:'test'|'twilio';sender:string;account_sid:string;credential_key:string;display_name:string};
export type SmsMessage = {id:string;recipient:string;body:string};
export class SmsSendError extends Error {
  code:string;retryable:boolean;uncertain:boolean;
  constructor(code:string,retryable:boolean,uncertain=false){super(code);this.code=code;this.retryable=retryable;this.uncertain=uncertain;}
}
export function providerMode(env:Record<string,string|undefined>, configured:SmsConfig['provider']):'disabled'|'test'|'twilio' {
  // A preview cannot send a real SMS even if it inherits production credentials.
  if(env.VERCEL_ENV!=='production')return env.SMS_TEST_MODE==='enabled'?'test':'disabled';
  return env.SERVICE_REQUEST_SMS_ENABLED==='enabled'?configured:'disabled';
}
export function credential(config:SmsConfig,env:Record<string,string|undefined>):string {
  if(!/^[A-Z0-9_]{1,64}$/.test(config.credential_key))throw Error('sms_credentials_unavailable');
  const secret=env[`TRIMAX_SMS_${config.credential_key}_AUTH_TOKEN`];
  if(!secret)throw Error('sms_credentials_unavailable');return secret;
}
export function verifyTwilioSignature(url:string,params:URLSearchParams,signature:string,secret:string):boolean {
  // Preserve the exact configured public URL; don't trust forwarded host headers.
  let input=url;
  for(const name of [...new Set(params.keys())].sort())for(const value of [...new Set(params.getAll(name))].sort())input+=name+value;
  const expected=createHmac('sha1',secret).update(input).digest('base64');
  return signature.length===expected.length&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
export async function sendSms(config:SmsConfig,message:SmsMessage,env:Record<string,string|undefined>=process.env,transport:typeof fetch=fetch){
  const mode=providerMode(env,config.provider);
  if(mode==='disabled')throw new SmsSendError('sms_disabled',false);
  if(mode==='test')return {id:`test-${message.id}`,status:'accepted',simulated:true};
  const origin=env.TRIMAX_SMS_PUBLIC_ORIGIN;
  if(!origin||new URL(origin).protocol!=='https:'||new URL(origin).origin!==origin)throw new SmsSendError('sms_callback_origin_unavailable',false);
  if(!/^AC[0-9a-f]{32}$/i.test(config.account_sid)||!/^\+[1-9]\d{7,14}$/.test(config.sender))throw new SmsSendError('sms_sender_unavailable',false);
  const secret=credential(config,env);
  let response:Response;
  try {response=await transport(`https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${config.account_sid}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:message.recipient,From:config.sender,Body:message.body,StatusCallback:`${origin}/api/communications/webhooks/twilio`}),signal:AbortSignal.timeout(10000)});}
  catch{throw new SmsSendError('provider_outcome_unknown',false,true);}
  // Twilio Messages creation has no application idempotency key. Never blindly retry
  // a timeout/5xx: an accepted message could otherwise be sent twice.
  if(response.status>=500)throw new SmsSendError('provider_outcome_unknown',false,true);
  if(!response.ok){
    let code:unknown;try{code=(await response.json()).code;}catch{/* Never log provider response bodies. */}
    throw new SmsSendError(code===21610?'provider_opted_out':response.status===429?'provider_rate_limited':'provider_rejected',response.status===429);
  }
  let result:{sid?:string;status?:string};try{result=await response.json();}catch{throw new SmsSendError('provider_outcome_unknown',false,true);}
  if(!result.sid||!/^SM[0-9a-f]{32}$/i.test(result.sid))throw new SmsSendError('provider_outcome_unknown',false,true);
  return {id:result.sid,status:result.status||'accepted',simulated:false};
}

