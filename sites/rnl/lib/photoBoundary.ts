/** Independent off-default gate. Preview submissions remain blocked. */
export function requestPhotosEnabled(env:Record<string,string|undefined>=process.env){return env.VERCEL_ENV==='production'&&env.PUBLIC_SCHEDULING_PHOTOS_ENABLED==='enabled';}
import type {SubmissionRuntime} from '../.shared/lib/publicScheduling/productionHandler.ts';
export function withPhotoBoundary(runtime:SubmissionRuntime,enabled:boolean):SubmissionRuntime{return {...runtime,client:{async rpc(name,args){if(name==='trimax_submit_public_service_request'&&!enabled&&args.p_payload&&typeof args.p_payload==='object'&&Object.hasOwn(args.p_payload,'uploadCapabilityHash'))return {data:null,error:{message:'Photo uploads are not enabled'}};return runtime.client.rpc(name,args);}}};}
