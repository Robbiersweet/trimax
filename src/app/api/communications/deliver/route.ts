import {createHash,randomBytes} from 'node:crypto';
import {communicationsDb,authorizedCron,isolatedSmsTestDatabase} from '@/app/lib/communications/server';
import {sendSms,SmsSendError,providerMode} from '@/app/lib/communications/provider';
import {smsBody,estimatedSegments,type Milestone} from '@/app/lib/communications/messages';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 if(!authorizedCron(request))return Response.json({error:'Unauthorized'},{status:401});
 const test=process.env.VERCEL_ENV!=='production';
 if(test?process.env.SMS_TEST_MODE!=='enabled':process.env.SERVICE_REQUEST_SMS_ENABLED!=='enabled')return Response.json({state:'disabled',accepted:0});
 // Test dispatch must target an explicitly isolated database, never production.
 if(test&&!isolatedSmsTestDatabase())return Response.json({error:'Isolated SMS test database required'},{status:403});
 const db=communicationsDb();let accepted=0,failed=0,deferred=0;
 const {data:rows,error}=await db.rpc('trimax_claim_sms',{p_test:test});if(error)return Response.json({error:'claim_failed'},{status:503});
 for(const row of rows||[]){
  let body='',segments=0;
  try{
   const {data:prepared,error:prepareError}=await db.rpc('trimax_prepare_sms',{p_id:row.id,p_lease:row.lease_token,p_test:test});if(prepareError)throw Error('prepare_failed');if(!prepared){deferred++;continue;}
   const {message,settings}=prepared;
   if(providerMode(process.env,settings.provider)==='disabled')throw new SmsSendError('sms_disabled',false);
   const origin=process.env.TRIMAX_SMS_PUBLIC_ORIGIN;
   let link:string|null=null;
   if((message.queue_id||message.entity_id)&&(!origin||new URL(origin).protocol!=='https:'||new URL(origin).origin!==origin))throw new SmsSendError('customer_link_origin_unavailable',false);
   if(origin&&new URL(origin).protocol==='https:'&&new URL(origin).origin===origin&&(message.queue_id||message.entity_id)){
    const token=randomBytes(32).toString('base64url');
    const {error:linkError}=await db.from('communication_links').insert({token_hash:createHash('sha256').update(token).digest('hex'),business_id:message.business_id,message_id:message.id,expires_at:new Date(Date.now()+7*86400000).toISOString()});if(linkError)throw Error('link_failed');
    link=`${origin}/api/communications/customer/${token}`;
   }
   const when=message.appointment_start?`${new Date(message.appointment_start).toLocaleString('en-US',{timeZone:settings.time_zone,dateStyle:'medium',timeStyle:'short'})} (${settings.time_zone})`:null;
   body=smsBody(message.event_type as Milestone,settings.display_name,when,link);segments=estimatedSegments(body);
   // Recheck consent + current appointment after preparing links, immediately before provider call.
   const {data:current,error:currentError}=await db.rpc('trimax_prepare_sms',{p_id:row.id,p_lease:row.lease_token,p_test:test});if(currentError)throw Error('prepare_failed');if(!current){deferred++;continue;}
   const result=await sendSms(settings,{id:message.id,recipient:message.recipient,body});
   const {data:done,error:finishError}=await db.rpc('trimax_finish_sms',{p_id:row.id,p_lease:row.lease_token,p_reference:result.id,p_body:body,p_segments:segments,p_simulated:result.simulated});
   if(finishError||!done){failed++;continue;}accepted++;
  }catch(error){
   const known=error instanceof SmsSendError;
   await db.rpc('trimax_finish_sms',{p_id:row.id,p_lease:row.lease_token,p_reference:null,p_body:body,p_segments:segments,p_simulated:test,p_error:known?error.code:'dispatch_failed',p_retry:known&&error.retryable,p_uncertain:known&&error.uncertain});failed++;
  }
 }
 return Response.json({accepted,failed,deferred,simulated:test},{status:failed?207:200,headers:{'Cache-Control':'no-store'}});
}
