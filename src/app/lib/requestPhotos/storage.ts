import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {PHOTO_LIMITS} from './server.ts';
/** Existing app server client only. Never pass this adapter into browser bundles. */
export function photoStorage(client:SupabaseClient){return {async put(bucket:string,key:string,bytes:Uint8Array,type:string){
 if(bucket!=='request-photos-private')throw Error('Photo bucket rejected');
 const uploaded=await client.storage.from(bucket).upload(key,bytes,{contentType:type,upsert:false,cacheControl:'0'});
 if(!uploaded.error)return;
 // A prior upload may have succeeded before its response was lost. Verify exact bytes;
 // never overwrite, and never treat an arbitrary conflict as a successful upload.
 const existing=await client.storage.from(bucket).download(key);
 if(existing.error||!existing.data||existing.data.size>PHOTO_LIMITS.inputBytes)throw Error('Photo storage unavailable');
 const original=Buffer.from(await existing.data.arrayBuffer());
 if(createHash('sha256').update(original).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw Error('Photo storage conflict');
 }};}
