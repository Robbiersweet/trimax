import {createHash} from 'node:crypto';
export const PHOTO_LIMITS=Object.freeze({count:4,inputBytes:5*1024*1024,totalBytes:12*1024*1024,pixels:24_000_000,expirySeconds:1800});
export function photoCapabilityHash(secret:string){if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Photo authorization rejected');return createHash('sha256').update(secret).digest('hex');}
/** Dependency injection keeps this review candidate unwired; use the existing sharp package server-side. */
export async function scrubPhoto(input:Uint8Array,sharp:typeof import('sharp').default){
 if(!input.byteLength||input.byteLength>PHOTO_LIMITS.inputBytes)throw Error('Photo size rejected');
 const image=sharp(input,{limitInputPixels:PHOTO_LIMITS.pixels,failOn:'warning'});
 const meta=await image.metadata();
 if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)!==1||!meta.width||!meta.height||meta.width*meta.height>PHOTO_LIMITS.pixels)throw Error('Photo format rejected');
 const {data,info}=await image.rotate().jpeg({quality:85}).toBuffer({resolveWithObject:true});
 if(data.byteLength>PHOTO_LIMITS.inputBytes)throw Error('Photo output size rejected');
 return {bytes:data,sha256:createHash('sha256').update(data).digest('hex'),width:info.width,height:info.height,contentType:'image/jpeg' as const};
}
