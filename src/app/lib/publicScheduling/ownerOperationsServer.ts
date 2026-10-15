// Server adapter contract only; no credentials, network or runtime instantiation.
import type {OwnerOperationsProps} from '../../admin/service-requests/components/OwnerOperationsPanel';
type Preferences=OwnerOperationsProps['preferences'];type Reminder=OwnerOperationsProps['reminder'];
/** Implement with the existing owner session, never the public intake credential.
 * transaction must recheck membership and request ownership atomically with writes. */
export interface OwnerOperationsStore {
 transaction<T>(work:(tx:{authorize(actor:string,business:string,request:string):Promise<boolean>;preferences(actor:string,business:string,revision:number,value:Omit<Preferences,'revision'>):Promise<Preferences>;reminder(business:string,request:string,revision:number,action:'acknowledge'|'snooze',until:number|null):Promise<Reminder>})=>Promise<T>):Promise<T>;
}
/** Trusted scope comes from server authentication, not a submitted actor/business ID. */
export function bindOwnerOperations(store:OwnerOperationsStore,scope:{actorId:string;businessId:string;requestId:string},now=Date.now){
 if(!scope.actorId||!scope.businessId||!scope.requestId)throw Error('OWNER_REQUIRED');
 const transact=async<T>(revision:number,work:(tx:Parameters<Parameters<OwnerOperationsStore['transaction']>[0]>[0])=>Promise<T>)=>{
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('INVALID_REVISION');
  return store.transaction(async tx=>{if(!await tx.authorize(scope.actorId,scope.businessId,scope.requestId))throw Error('OWNER_REQUIRED');return work(tx);});
 };
 return {savePreferences:async(revision:number,value:Omit<Preferences,'revision'>)=>{
  if(!value||Object.keys(value).sort().join(',')!=='email,inApp,push,reminderMinutes'||!['inApp','email','push'].every(k=>typeof value[k as keyof typeof value]==='boolean')||!Number.isSafeInteger(value.reminderMinutes)||value.reminderMinutes<15||value.reminderMinutes>10080)throw Error('INVALID_PREFERENCES');
  return transact(revision,tx=>tx.preferences(scope.actorId,scope.businessId,revision,value));
 },saveReminder:async(revision:number,action:'acknowledge'|'snooze',until:number|null)=>{
  if(!['acknowledge','snooze'].includes(action)||(action==='acknowledge'&&until!==null)||(action==='snooze'&&(!Number.isSafeInteger(until)||until!<=now()||until!>now()+7*86400000)))throw Error('INVALID_REMINDER');
  return transact(revision,tx=>tx.reminder(scope.businessId,scope.requestId,revision,action,until));
 }};
}

