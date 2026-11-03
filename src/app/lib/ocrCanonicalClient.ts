import {supabase} from './supabase';
import {imageSha256,type CanonicalCapture} from './ocrCanonical';
import type {enqueueShadow} from './ocrV2/shadow/client';
import {OCR_IMAGE_BUCKET,canonicalObjectPath,uploadCanonicalObject} from './ocrCanonicalObject';
import type {StillArtifact} from './highResolutionStill';
type OfflineSnapshot=Parameters<typeof enqueueShadow>[0]['snapshot'];
export async function storeCanonicalCapture(input:{attemptId:string;imageDataUrl:string;metadata:Record<string,unknown>;originalStill?:StillArtifact|null;snapshot:OfflineSnapshot|null;captureTimings:unknown;onProgress?:(stage:string)=>void}):Promise<CanonicalCapture> {
 const started=performance.now();
 input.onProgress?.('Preparing photo for upload');
 const blob=await (await fetch(input.imageDataUrl).catch(error=>{throw Object.assign(Error('Captured photo could not be decoded'),{stage:'image-preparation',cause:error});})).blob();
 const preparation=Array.isArray(input.metadata.originalPreparation)?input.metadata.originalPreparation:[];
 const original=preparation.map(String).find(line=>line.startsWith('Source image:'))?.match(/Source image: (\d+) x (\d+), (\d+) bytes/);
 const metadata:Record<string,unknown>={...input.metadata,originalWidth:original?Number(original[1]):null,originalHeight:original?Number(original[2]):null,originalBytes:original?Number(original[3]):null};
 const hash=await imageSha256(await blob.arrayBuffer());
 let objectPath:string|undefined;
 if(!input.metadata.retainedReference){
  input.onProgress?.('Verifying saved scan');
  const attempt=await supabase.from('ocr_attempts').select('business_id').eq('id',input.attemptId).single();
  if(attempt.error||!attempt.data)throw Object.assign(new CaptureTransportError('Saved capture attempt unavailable — Retry',attempt.error?.code),{stage:'capture-lookup',status:attempt.status});
  if(input.originalStill){
   const saved=input.originalStill;
   if(!/^image\/(jpeg|png|webp)$/.test(saved.file.type)||!saved.file.size||saved.file.size>8_000_000)throw Object.assign(Error('Original still cannot be stored within the secure upload contract. Original remains available on this page.'),{stage:'original-upload'});
   input.onProgress?.('Saving original high-resolution still');
   const sha256=await imageSha256(await saved.file.arrayBuffer()),originalPath=canonicalObjectPath(attempt.data.business_id,input.attemptId,sha256);
   try{await uploadCanonicalObject(supabase.storage.from(OCR_IMAGE_BUCKET),originalPath,saved.file,sha256);}catch(error){throw Object.assign(error instanceof Error?error:Error('Original still upload could not be confirmed'),{stage:'original-upload'});}
   metadata.originalCapture={label:'Original high-resolution still',sha256,objectPath:originalPath,storageBucket:OCR_IMAGE_BUCKET,mime:saved.file.type,storedBytes:saved.file.size,width:saved.width,height:saved.height,exifOrientation:saved.orientation,rotation:0,source:saved.method,transformation:'Untouched original; OCR uses the separately reviewed crop',crop:saved.crop,guide:saved.guide,videoWidth:saved.videoWidth,videoHeight:saved.videoHeight};
  }
  objectPath=canonicalObjectPath(attempt.data.business_id,input.attemptId,hash);
  input.onProgress?.('Uploading photo');
  await uploadCanonicalObject(supabase.storage.from(OCR_IMAGE_BUCKET),objectPath,blob,hash);
 }
 input.onProgress?.('Confirming saved photo');
 const {data,error,status}=await supabase.rpc('trimax_store_ocr_capture',{p_attempt:input.attemptId,p_hash:hash,p_image:null,p_metadata:{...metadata,objectPath,storageBucket:OCR_IMAGE_BUCKET,mime:blob.type,storedBytes:blob.size},p_shadow:null,p_snapshot:null,p_capture:{}});
 if(error)throw Object.assign(new CaptureTransportError(error.message,error.code),{stage:'canonical-registration',status});
 return {...data,uploadDurationMs:Math.round(performance.now()-started)};
}

/** Retriable transport failures never imply recognition failure. No image bytes in errors. */
export class CaptureTransportError extends Error {
 readonly retriable=true;
 constructor(message:string,readonly code?:string){super(message);this.name='CaptureTransportError';}
}
export async function resumeCaptureHandoff(attemptId:string,snapshot?:OfflineSnapshot|null,captureTimings?:unknown):Promise<{queued:boolean;state:string}> {
 if(snapshot){
  const prepared=await supabase.rpc('trimax_prepare_ocr_handoff',{p_attempt:attemptId,p_snapshot:snapshot,p_capture:captureTimings??{}});
  if(prepared.error)throw new CaptureTransportError(prepared.error.message,prepared.error.code);
 }
 const {data,error}=await supabase.rpc('trimax_resume_ocr_handoff',{p_attempt:attemptId});
 if(error)throw new CaptureTransportError(error.message,error.code);
 return data;
}
