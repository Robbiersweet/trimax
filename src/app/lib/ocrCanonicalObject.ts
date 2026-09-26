import {imageSha256} from './ocrCanonical';

export const OCR_IMAGE_BUCKET='trimax-ocr-captures';
export function canonicalObjectPath(businessId:string,attemptId:string,hash:string) {
 if(![businessId,attemptId].every(id=>/^[0-9a-f-]{36}$/i.test(id))||!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid canonical object identity');
 return `${businessId}/${attemptId}/${hash}`;
}
/** A lost acknowledgement is accepted only after reading and hashing the same private object. */
export async function uploadCanonicalObject(
 storage:{upload:(path:string,body:Blob,options:{contentType:string;upsert:boolean})=>Promise<{error:unknown}>;download:(path:string)=>Promise<{data:Blob|null;error:unknown}>},
 path:string,blob:Blob,hash:string,
) {
 const uploaded=await storage.upload(path,blob,{contentType:blob.type,upsert:false}).catch(error=>({error}));
 if(!uploaded.error)return;
 const existing=await storage.download(path);
 if(existing.error||!existing.data)throw Error('Photo captured, upload interrupted — Retry');
 if(existing.data.size!==blob.size||await imageSha256(await existing.data.arrayBuffer())!==hash)throw Error('Canonical object integrity mismatch');
}
