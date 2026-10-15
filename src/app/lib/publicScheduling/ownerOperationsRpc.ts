import type {OwnerOperationsStore} from './ownerOperationsServer.ts';
import type {OwnerOperationsProps} from '../../admin/service-requests/components/OwnerOperationsPanel';
export interface OwnerOperationsRpc {rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>}
/** Disabled adapter: caller supplies existing authenticated owner client; never intake.
 * Each mutation RPC independently reauthorizes and performs its CAS atomically. */
export function reviewedOwnerOperationsStore(client:OwnerOperationsRpc,verifiedActorId:string):OwnerOperationsStore{
 return {async transaction(work){let scope:{actor:string;business:string;request:string}|undefined;
 const invoke=async(action:string,revision:number,value:unknown)=>{if(!scope)throw Error('OWNER_REQUIRED');const result=await client.rpc('trimax_owner_request_operations',{p_business:scope.business,p_request:scope.request,p_action:action,p_revision:revision,p_value:value});if(result.error||!result.data)throw Error('OWNER_OPERATION_REJECTED');return result.data;};
 return work({async authorize(actor,business,request){if(!verifiedActorId||actor!==verifiedActorId)return false;scope={actor,business,request};try{await invoke('read',0,{});return true;}catch{scope=undefined;return false;}},async preferences(actor,business,revision,value){if(scope?.actor!==actor||scope.business!==business)throw Error('OWNER_REQUIRED');return await invoke('preferences',revision,value) as OwnerOperationsProps['preferences'];},async reminder(business,request,revision,action,until){if(scope?.business!==business||scope.request!==request)throw Error('OWNER_REQUIRED');return await invoke(action,revision,action==='snooze'?{until}:{}) as OwnerOperationsProps['reminder'];}});
 }};
}
