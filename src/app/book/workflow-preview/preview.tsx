"use client";
import {useMemo} from 'react';
import OwnerWorkspace from '../../admin/service-requests/components/OwnerWorkspace';
import {getPublicBusiness,type PublicServiceRequest} from '../../lib/publicScheduling/domain';
import type {WorkflowContext} from '../../lib/publicScheduling/workflow';
import {validateWorkflowChange} from '../../lib/publicScheduling/workflow';
/** Synthetic UI fixture only. Database/RLS/atomicity are verified separately in PGlite. */
export default function WorkflowPreview(){
 const fixture=useMemo(()=>{
  const business=getPublicBusiness('rnl-creations')!;
  const request:PublicServiceRequest={id:'00000000-0000-4000-8000-000000000001',businessId:business.businessId,businessSlug:business.slug,reference:'SYNTHETIC-001',requestTypeId:'repair',customerName:'Sample Customer',email:'sample@example.invalid',phone:'555-555-0100',preferredContact:'email',address:'100 Sample Lane',description:'Repair a sticking interior door and replace its handle.',preferredDate:'',timeWindowId:'morning',flexibility:'flexible',urgency:'routine',notes:'Please contact me before visiting.',consent:true,status:'pending_confirmation',revision:1,submittedAt:'2026-10-18T19:00:00.000Z',source:'public-web',internalNotes:'',confirmationStatus:'unconfirmed',notificationStatus:'not_configured',activity:[]};
  const context:WorkflowContext={clients:[{id:'00000000-0000-4000-8000-000000000002',name:'Sample Customer',email:'sample@example.invalid',phone:'555-555-0100'}],queue:[],linked:null,delivery:[]};
  const current=structuredClone(request);
  const history=(event:string)=>{current.activity!.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor:'Synthetic owner',event});};
  return {business,request,api:{load:async()=>structuredClone(context),save:async(input:Parameters<typeof validateWorkflowChange>[0])=>{
   const action=validateWorkflowChange(input);if(action.expectedRevision!==current.revision)throw Error('Reload after another edit');
   if(action.action!=='approve_schedule'&&current.status!=='approved')throw Error('Approve first');
   if(!context.linked){context.linked={id:'synthetic-queue-item',request_client_id:context.clients[0].id,appointment_start:null,appointment_end:null};history('client_matched');history('queue_converted');}
   if(['schedule','approve_schedule'].includes(action.action)){if(Date.parse(action.start!)<=Date.now())throw Error('Choose a future time');history(context.linked.appointment_start?'appointment_rescheduled':'appointment_scheduled');context.linked.appointment_start=action.start;context.linked.appointment_end=new Date(Date.parse(action.start!)+action.minutes!*60000).toISOString();}
   if(action.action==='cancel_appointment'){context.linked.appointment_start=null;context.linked.appointment_end=null;history('appointment_cancelled');}
   current.status='approved';current.revision!++;return {request:structuredClone(current),context:structuredClone(context)};
  }},review:async(change:{status:PublicServiceRequest['status'];note:string})=>{current.status=change.status;current.revision!++;current.internalNotes=change.note;history('review_updated');return structuredClone(current);}};
 },[]);
 return <><aside style={{padding:16,background:'#fff0d7',color:'#172d3b'}}>Isolated UI preview. Synthetic records reset on reload. No database writes, push, email or SMS. Queue/calendar links lead to the authenticated app and do not represent synthetic saved records.</aside><OwnerWorkspace initialRequestId={fixture.request.id} production demo requests={[fixture.request]} settings={{revision:1,business:fixture.business}} workflowApi={fixture.api} saveReview={fixture.review} saveSettings={async value=>value}/></>;
}
