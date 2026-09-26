import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
/** Only authenticated, workspace-scoped retained optical evidence; never an arbitrary URL. */
export async function readCanonicalCapture(request:Request,reference:unknown,expectedHash:unknown,businessId:unknown) {
 if(typeof reference!=='string'||!/^[0-9a-f-]{36}$/i.test(reference)||typeof expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedHash)||typeof businessId!=='string')throw Error('Invalid canonical reference');
 const authorization=request.headers.get('authorization');
 if(!authorization)throw Error('Canonical capture requires authentication');
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:attempt,error:attemptError}=await client.from('ocr_attempts').select('id').eq('id',reference).eq('business_id',businessId).maybeSingle();
 if(attemptError||!attempt)throw Error('Canonical capture not authorized');
 const {data,error}=await client.from('ocr_attempt_optical').select('evidence').eq('attempt_id',reference).maybeSingle();
 if(error||!data)throw Error('Canonical capture unavailable or expired');
 const image=data.evidence.images?.find((i:{sha256?:string;base64?:string})=>i.sha256===expectedHash || (i.base64 && createHash('sha256').update(Buffer.from(i.base64,'base64')).digest('hex')===expectedHash));
 if(!image||!['image/jpeg','image/png','image/webp'].includes(image.mime))throw Error('Canonical capture unavailable');
 let bytes:Buffer;
 if(image.storageBucket==='trimax-ocr-captures'&&typeof image.objectPath==='string'){
  const object=await client.storage.from(image.storageBucket).download(image.objectPath);
  if(object.error||!object.data)throw Error('Canonical object unavailable');
  bytes=Buffer.from(await object.data.arrayBuffer());
 }else if(image.base64)bytes=Buffer.from(image.base64,'base64');
 else throw Error('Canonical capture unavailable');
 if(createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('Canonical image hash mismatch');
 return 'data:'+image.mime+';base64,'+bytes.toString('base64');
}
