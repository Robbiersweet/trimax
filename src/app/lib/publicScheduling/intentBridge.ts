import type {OutboxIntent} from './outbox.ts';
import {pendingReminder,type ReminderState} from './pendingReminder.ts';
export const intentBridgeEnabled=false;
export type CommittedEvent={businessId:string;requestId:string;activityId:string;kind:'received'|'review';status:string;preferredContact:string;consentReference:string|null};
/** Adapter must reload trusted activity and current membership, and atomically insert unique keys.
 * No customer-supplied recipients or notes enter the intent. */
export interface IntentTransaction {
 authorizeCurrentOwner(businessId:string,actorId:string):Promise<boolean>;
 committedEvent(businessId:string,requestId:string,activityId:string):Promise<CommittedEvent|null>;
 enqueueOnce(intent:OutboxIntent):Promise<void>;
 reminderState(businessId:string,requestId:string):Promise<ReminderState|null>;
}
export interface IntentStore {transaction<T>(work:(tx:IntentTransaction)=>Promise<T>):Promise<T>}
const reviewEvents:Record<string,OutboxIntent['event']>={approved:'approved',needs_information:'needs_information',rejected:'rejected',cancelled:'cancelled'};
export async function syntheticIntentBridge(input:{mode:'synthetic';store:IntentStore;businessId:string;requestId:string;activityId:string;actorId:string;now:number}){
 if(input.mode!=='synthetic'||!Number.isFinite(input.now))throw Error('INTENT_DISABLED');
 return input.store.transaction(async tx=>{
  if(!await tx.authorizeCurrentOwner(input.businessId,input.actorId))throw Error('OWNER_REQUIRED');
  const e=await tx.committedEvent(input.businessId,input.requestId,input.activityId);
  if(!e||e.businessId!==input.businessId||e.requestId!==input.requestId||e.activityId!==input.activityId)throw Error('ACTIVITY_MISMATCH');
  if(!['received','review'].includes(e.kind)||(e.kind==='received'&&e.status!=='pending_confirmation'))throw Error('EVENT_MISMATCH');
  const events:OutboxIntent[]=[];
  const make=(event:OutboxIntent['event'],audience:'customer'|'internal'):OutboxIntent=>({businessId:e.businessId,requestId:e.requestId,event,audience,channel:audience==='internal'?'in-app':'email',recipient:audience==='internal'?'workspace-owners':'current-consented-customer',idempotencyKey:JSON.stringify([e.businessId,e.requestId,e.activityId,event,audience]),scheduledFor:new Date(input.now).toISOString(),consentReference:audience==='customer'?e.consentReference:null,template:event,parameters:{}});
  if(e.kind==='received')events.push(make('new_request','internal'));
  const event=e.kind==='received'?'request_received':Object.prototype.hasOwnProperty.call(reviewEvents,e.status)?reviewEvents[e.status]:null;
  if(event&&e.preferredContact==='email'&&e.consentReference)events.push(make(event,'customer'));
  for(const intent of events)await tx.enqueueOnce(intent);
  return events.length;
 });
}
export async function syntheticReminderBridge(input:{mode:'synthetic';store:IntentStore;businessId:string;requestId:string;actorId:string;intervalMinutes:number;now:number}){
 if(input.mode!=='synthetic')throw Error('INTENT_DISABLED');
 return input.store.transaction(async tx=>{
  if(!await tx.authorizeCurrentOwner(input.businessId,input.actorId))throw Error('OWNER_REQUIRED');
  const state=await tx.reminderState(input.businessId,input.requestId);
  if(!state||state.businessId!==input.businessId||state.requestId!==input.requestId)throw Error('REQUEST_MISMATCH');
  const due=pendingReminder(state,input.intervalMinutes,input.now);if(!due)return false;
  await tx.enqueueOnce({businessId:state.businessId,requestId:state.requestId,event:due.event,audience:'internal',channel:'in-app',recipient:'workspace-owners',idempotencyKey:due.key,scheduledFor:new Date(input.now).toISOString(),consentReference:null,template:due.event,parameters:{}});return true;
 });
}
