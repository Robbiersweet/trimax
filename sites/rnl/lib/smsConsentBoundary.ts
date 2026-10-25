import type {SubmissionRuntime} from '../.shared/lib/publicScheduling/productionHandler.ts';
/** Collection is independent of sending and requires the reviewed intake migration. */
export const smsConsentCollectionEnabled=(env:Record<string,string|undefined>=process.env)=>env.PUBLIC_SCHEDULING_SMS_CONSENT_ENABLED==='enabled';
export function withSmsConsentBoundary(runtime:SubmissionRuntime,enabled:boolean):SubmissionRuntime{return {...runtime,client:{async rpc(name:string,args:Record<string,unknown>){
 if(name==='trimax_submit_public_service_request'&&!enabled){const payload=args.p_payload as Record<string,unknown>|undefined;if(payload&&(Object.hasOwn(payload,'smsConsent')||Object.hasOwn(payload,'smsDisclosureVersion')))return {data:null,error:{message:'SMS consent collection is not enabled'}};}
 return runtime.client.rpc(name,args);
}}};}
