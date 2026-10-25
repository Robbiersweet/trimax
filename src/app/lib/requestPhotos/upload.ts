import {createHash} from 'node:crypto';
import {photoCapabilityHash,scrubPhoto} from './server.ts';
export const REQUEST_PHOTO_BUCKET='request-photos-private';
type Rpc={rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>};
type Storage={put(bucket:string,key:string,bytes:Uint8Array,type:string):Promise<void>};
/** Server orchestration behind the disabled-by-default route. The storage adapter must never overwrite an existing object. */
export async function uploadRequestPhoto(input:{requestId:string;uploadId:string;secret:string;bytes:Uint8Array},dependencies:{rpc:Rpc;storage:Storage;sharp:typeof import('sharp').default}){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 if(!uuid.test(input.requestId)||!uuid.test(input.uploadId))throw Error('Photo rejected');
 const hash=photoCapabilityHash(input.secret);
 const reservation=await dependencies.rpc.rpc('trimax_reserve_request_photo',{p_request:input.requestId,p_hash:hash,p_upload:input.uploadId,p_input_hash:createHash('sha256').update(input.bytes).digest('hex'),p_bytes:input.bytes.byteLength});
 if(reservation.error)throw Error('Photo authorization or limit rejected');
 const value=reservation.data as {objectKey:string;state:string};
 if(!value||typeof value.objectKey!=='string'||!new RegExp(`^[a-f0-9-]{36}/${input.requestId}/${input.uploadId}\\.jpg$`).test(value.objectKey))throw Error('Photo storage binding rejected');
 if(value.state==='complete')return {id:input.uploadId,status:'complete'};
 if(value.state!=='reserved')throw Error('Photo state rejected');
 const photo=await scrubPhoto(input.bytes,dependencies.sharp);
 await dependencies.storage.put(REQUEST_PHOTO_BUCKET,value.objectKey,photo.bytes,photo.contentType);
 const complete=await dependencies.rpc.rpc('trimax_complete_request_photo',{p_request:input.requestId,p_hash:hash,p_upload:input.uploadId,p_output_hash:photo.sha256,p_width:photo.width,p_height:photo.height});
 if(complete.error)throw Error('Photo completion pending');
 return {id:input.uploadId,status:'complete'};
}
