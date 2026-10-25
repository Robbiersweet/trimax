import {createClient} from '@supabase/supabase-js';
import {isIntakeRole,type PublicBusiness,type PublicServiceRequest,type RequestActivity} from './domain.ts';
import {validateReviewChange} from './ownerWorkflow.ts';
import type {WorkflowChange,WorkflowContext} from './workflow.ts';

/** Uses the caller's authenticated token and RLS, never the intake credential. */
export async function productionOwner(request:Request,slug:string){
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)throw Error('Owner/admin required');
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:user,error:authError}=await client.auth.getUser(token);
 if(authError||!user.user)throw Error('Owner/admin required');
 const {data:s,error}=await client.from('public_scheduling_settings').select('*').eq('public_slug',slug).maybeSingle();
 if(error||!s)throw Error('Owner/admin required');
 const {data:members,error:membershipError}=await client.from('business_users').select('role').eq('business_id',s.business_id).eq('user_id',user.user.id);
 if(membershipError||!members?.some(m=>isIntakeRole(m.role)))throw Error('Owner/admin required');
 const {data:types,error:typeError}=await client.from('public_service_request_types').select('*').eq('business_id',s.business_id).order('display_order');
 if(typeError)throw Error('Settings unavailable');
 const business:PublicBusiness={businessId:s.business_id,slug:s.public_slug,displayName:s.display_name,description:s.description,phone:s.public_phone,email:s.public_email,logoUrl:s.logo_reference,accent:s.accent_token,enabled:s.enabled,rules:{weekdays:s.available_weekdays,blockedDates:s.blocked_dates,minimumLeadHours:s.minimum_lead_hours,maximumHorizonDays:s.maximum_horizon_days,timeZone:s.time_zone,businessHours:s.business_hours,windows:s.appointment_windows,ownerApprovalRequired:s.owner_approval_required,mode:s.mode},requestTypes:(types??[]).map(t=>({id:t.public_key,publicLabel:t.public_label,internalLabel:t.internal_label,description:t.description,active:t.active,displayOrder:t.display_order,estimatedDurationMinutes:t.estimated_duration_minutes,schedulingEligible:t.scheduling_eligible}))};
 async function list(id?:string){
  let query=client.from('public_service_requests').select('id,business_id,request_type_id,public_reference,customer_name,phone,email,preferred_contact,service_address,description,preferred_date,time_window_id,flexibility,urgency,customer_notes,internal_notes,status,revision,submitted_at,contact_consent_at').eq('business_id',s.business_id).order('submitted_at',{ascending:false}).limit(200);
  if(id)query=query.eq('id',id);
  const {data:rows,error:readError}=await query;if(readError)throw Error('Intake unavailable');
  return Promise.all((rows??[]).map(async r=>{
   const {data:events,error:eventError}=await client.from('public_request_activity').select('id,created_at,actor_id,event_type,details').eq('business_id',s.business_id).eq('request_id',r.id).order('created_at');
   if(eventError)throw Error('History unavailable');
   const activity:RequestActivity[]=(events??[]).map(e=>({id:e.id,at:e.created_at,actor:e.actor_id??'Customer',event:e.event_type,from:e.details.fromStatus,to:e.details.toStatus,note:e.details.note}));
   return {id:r.id,businessId:r.business_id,businessSlug:slug,requestTypeId:types?.find(t=>t.id===r.request_type_id)?.public_key??'',reference:r.public_reference,customerName:r.customer_name,phone:r.phone,email:r.email,preferredContact:r.preferred_contact,address:r.service_address,description:r.description,preferredDate:r.preferred_date??'',timeWindowId:r.time_window_id??'',flexibility:r.flexibility,urgency:r.urgency,notes:r.customer_notes,internalNotes:r.internal_notes,status:r.status,revision:r.revision,submittedAt:r.submitted_at,consent:!!r.contact_consent_at,source:'public-web',confirmationStatus:'unconfirmed',notificationStatus:'not_configured',activity} as PublicServiceRequest;
  }));
 }
 async function workflowContext(id:string):Promise<WorkflowContext>{
  if(!(await list(id)).length)throw Error('Request not found');
  const [customers,scheduled,linked,delivery,blocks]=await Promise.all([
   client.from('clients').select('id,name,email,phone').eq('business_id',s.business_id).order('name').limit(500),
   client.from('queue_items').select('id,property,scheduled_date,appointment_start,appointment_end').eq('business_id',s.business_id).is('completed_date',null).not('scheduled_date','is',null).order('scheduled_date').limit(500),
   client.from('queue_items').select('id,request_client_id,appointment_start,appointment_end,appointment_revision,appointment_status,appointment_previous_start,appointment_previous_end,appointment_changed_at').eq('business_id',s.business_id).eq('source_request_id',id).maybeSingle(),
   client.from('public_scheduling_outbox').select('channel,event_type,status,attempts,last_error_code,email_delivery_status,provider_message_id').eq('business_id',s.business_id).eq('request_id',id).in('channel',['push','email','sms']).order('created_at',{ascending:false}).limit(50),
   client.from('scheduling_time_blocks').select('id,starts_at,ends_at,label').eq('business_id',s.business_id).gte('ends_at',new Date().toISOString()).order('starts_at').limit(500)
  ]);
  if(customers.error||scheduled.error||linked.error||delivery.error||blocks.error)throw Error('Workflow unavailable');
  return {blocks:blocks.data??[],delivery:delivery.data??[],clients:customers.data??[],queue:scheduled.data??[],linked:linked.data};
 }
 return {async blocks(){const {data,error}=await client.from('scheduling_time_blocks').select('id,starts_at,ends_at,label').eq('business_id',s.business_id).gte('ends_at',new Date().toISOString()).order('starts_at').limit(500);if(error)throw Error('Blocks unavailable');return {blocks:data,timeZone:s.time_zone};},async block(input:{start:string|null;end:string|null;label:string;removeId?:string|null}){const {data,error}=await client.rpc('trimax_schedule_block',{p_business_id:s.business_id,p_start:input.start,p_end:input.end,p_label:input.label,p_remove_id:input.removeId??null});if(error)throw Error('Block rejected');return data;},settings:{revision:0,business,production:true},list,workflowContext,async workflow(change:WorkflowChange){
  if(!(await list(change.requestId)).length)throw Error('Request not found');
  const {data,error:failure}=await client.rpc('trimax_service_request_workflow',{p_request_id:change.requestId,p_revision:change.expectedRevision,p_mutation_id:change.mutationId,p_action:change.action,p_client_id:change.clientId,p_start:change.start,p_minutes:change.minutes,p_conflict_reason:change.conflictReason??null,p_buffer_before:change.bufferBefore??0,p_buffer_after:change.bufferAfter??0,p_kind:change.kind??'job'});
  if(failure)throw Error('Workflow rejected');
  return {receipt:data,request:(await list(change.requestId))[0],context:await workflowContext(change.requestId)};
 },async review(value:unknown){
  const change=validateReviewChange(value);
  // Bind request to the URL workspace before invoking the independently guarded RPC.
  if(!(await list(change.requestId)).length)throw Error('Request not found');
  const {error:reviewError}=await client.rpc('trimax_review_public_service_request',{p_request_id:change.requestId,p_revision:change.expectedRevision,p_status:change.status,p_internal_notes:change.note,p_mutation_id:change.mutationId});
  if(reviewError)throw Error('Review rejected. Reload before retrying.');
  return (await list(change.requestId))[0];
 }};
}
