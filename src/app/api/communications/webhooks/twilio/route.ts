import {createHash} from 'node:crypto';
import {communicationsDb} from '@/app/lib/communications/server';
import {credential,verifyTwilioSignature} from '@/app/lib/communications/provider';
export const runtime='nodejs';
export async function POST(request:Request){
 // Inbound STOP must continue working even when outbound sending is disabled.
 if(process.env.VERCEL_ENV!=='production')return new Response('Not available',{status:403});
 try{
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response('Unsupported payload',{status:415});
  const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts:Uint8Array[]=[];
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384){await reader.cancel();return new Response('Payload too large',{status:413});}parts.push(next.value);}
  const params=new URLSearchParams(Buffer.concat(parts).toString('utf8'));
  const sid=params.get('MessageSid')||'',account=params.get('AccountSid')||'',from=params.get('From')||'',to=params.get('To')||'';
  if(!/^SM[0-9a-f]{32}$/i.test(sid)||!/^AC[0-9a-f]{32}$/i.test(account))throw Error();
  const status=params.has('MessageStatus')&&params.get('MessageStatus')!=='received'?params.get('MessageStatus'):null;
  const db=communicationsDb();
  const {data:config,error}=await db.from('communication_settings').select('*').eq('provider','twilio').eq('account_sid',account).eq('sender',status?from:to).maybeSingle();if(error||!config)throw Error();
  const origin=process.env.TRIMAX_SMS_PUBLIC_ORIGIN;if(!origin||new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error();
  const canonical=`${origin}/api/communications/webhooks/twilio`;
  if(new URL(request.url).search||!verifyTwilioSignature(canonical,params,request.headers.get('x-twilio-signature')||'',credential(config,process.env)))throw Error();
  const key=createHash('sha256').update(`${sid}:${status||'inbound'}`).digest('hex');
  const {data:applied,error:rpcError}=await db.rpc('trimax_sms_webhook',{p_business:config.business_id,p_event_key:key,p_provider_id:sid,p_from:from,p_to:to,p_body:params.get('Body')||'',p_status:status,p_optout:params.get('OptOutType'),p_error:params.get('ErrorCode')});if(rpcError||applied!==true)return new Response('Retry later',{status:503});
  // Configure Twilio Advanced Opt-Out for provider-managed STOP/START/HELP replies.
  // Avoid an additional billable reply from the app.
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>',{headers:{'Content-Type':'text/xml','Cache-Control':'no-store'}});
 }catch{return new Response('Invalid webhook',{status:403});}
}
