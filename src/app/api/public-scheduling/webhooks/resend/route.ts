import {communicationsDb} from '@/app/lib/communications/server';
import {verifyResendWebhook} from '@/app/lib/publicScheduling/resendWebhook';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.SERVICE_REQUEST_RESEND_WEBHOOK_SECRET,business=process.env.SERVICE_REQUEST_EMAIL_BUSINESS_ID;
 if(process.env.VERCEL_ENV!=='production'||process.env.SERVICE_REQUEST_EMAIL_WEBHOOK_ENABLED!=='enabled'||!secret||!business)return new Response('Disabled',{status:404});
 try{
 const reader=request.body?.getReader();if(!reader)throw Error();let bytes=0,body='';const decoder=new TextDecoder();while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>32768){await reader.cancel();throw Error();}body+=decoder.decode(p.value,{stream:true});}body+=decoder.decode();
 if(!verifyResendWebhook(body,request.headers,secret))return new Response('Invalid signature',{status:401});
 const event=JSON.parse(body);if(!['email.delivered','email.bounced','email.complained','email.failed'].includes(event.type))return new Response(null,{status:204});
 if(typeof event.data?.email_id!=='string'||!Array.isArray(event.data.to)||event.data.to.length!==1||typeof event.data.to[0]!=='string')throw Error();
 const {error}=await communicationsDb().rpc('trimax_request_email_status',{p_business:business,p_event:request.headers.get('svix-id'),p_provider:event.data.email_id,p_recipient:event.data.to[0],p_status:event.type});
 // A callback can beat the send-result commit; ask provider to retry rather than lose it.
 if(error)return new Response('Delivery event not yet matched',{status:503});return new Response(null,{status:204});
 }catch{return new Response('Invalid event',{status:400});}
}
