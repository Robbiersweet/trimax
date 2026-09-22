import {supabase} from './supabase';
import {imageSha256,type CanonicalCapture} from './ocrCanonical';
import type {enqueueShadow} from './ocrV2/shadow/client';
type OfflineSnapshot=Parameters<typeof enqueueShadow>[0]['snapshot'];
export async function storeCanonicalCapture(input:{attemptId:string;imageDataUrl:string;metadata:Record<string,unknown>;snapshot:OfflineSnapshot|null;captureTimings:unknown}):Promise<CanonicalCapture> {
 const started=performance.now();
 const blob=await (await fetch(input.imageDataUrl)).blob();
 const preparation=Array.isArray(input.metadata.originalPreparation)?input.metadata.originalPreparation:[];
 const original=preparation.map(String).find(line=>line.startsWith('Source image:'))?.match(/Source image: (\d+) x (\d+), (\d+) bytes/);
 const metadata={...input.metadata,originalWidth:original?Number(original[1]):null,originalHeight:original?Number(original[2]):null,originalBytes:original?Number(original[3]):null};
 const hash=await imageSha256(await blob.arrayBuffer());
 const {data,error}=await supabase.rpc('trimax_store_ocr_capture',{p_attempt:input.attemptId,p_hash:hash,p_image:input.metadata.retainedReference?null:input.imageDataUrl,p_metadata:{...metadata,mime:blob.type,storedBytes:blob.size},p_shadow:input.snapshot?crypto.randomUUID():null,p_snapshot:input.snapshot,p_capture:input.captureTimings});
 if(error)throw new CaptureTransportError(error.message,error.code);
 return {...data,uploadDurationMs:Math.round(performance.now()-started)};
}

/** Retriable transport failures never imply recognition failure. No image bytes in errors. */
export class CaptureTransportError extends Error {
 readonly retriable=true;
 constructor(message:string,readonly code?:string){super(message);this.name='CaptureTransportError';}
}
export async function resumeCaptureHandoff(attemptId:string):Promise<{queued:boolean;state:string}> {
 const {data,error}=await supabase.rpc('trimax_resume_ocr_handoff',{p_attempt:attemptId});
 if(error)throw new CaptureTransportError(error.message,error.code);
 return data;
}
