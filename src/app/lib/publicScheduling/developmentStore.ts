import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,rename,unlink} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import type {PublicBusiness,PublicServiceRequest,ServiceRequestInput} from './domain';
export function devStoreDirectory(env:NodeJS.ProcessEnv=process.env){
 if(env.NODE_ENV==='production'||env.PUBLIC_SCHEDULING_DEV_ADAPTER!=='enabled')throw new Error('Public scheduling submission is not configured.');
 const configured=env.PUBLIC_SCHEDULING_DEV_DIRECTORY;
 if(configured&&!isAbsolute(configured))throw new Error('Development storage requires an absolute directory.');
 return resolve(configured||join(tmpdir(),'trimax-public-scheduling-dev'));
}
export async function submitDevelopmentRequest(business:PublicBusiness,input:ServiceRequestInput,key:string,directory=devStoreDirectory()){
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw new Error('Invalid idempotency key.');
 await mkdir(directory,{recursive:true,mode:0o700});
 const identity=createHash('sha256').update(`${business.businessId}:${key}`).digest('hex');
 const file=join(directory,identity+'.json'),lock=file+'.lock';
 const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const existing=async()=>{try{const saved=JSON.parse(await readFile(file,'utf8')) as {fingerprint:string;request:PublicServiceRequest};if(saved.fingerprint!==fingerprint)throw new Error('Idempotency key already used for different request.');return saved.request;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}};
 const prior=await existing();if(prior)return prior;
 // Exclusive lock prevents concurrent submissions from creating multiple records.
 // A crash leaves a recoverable lock; no partially written record is acknowledged.
 try{await writeFile(lock,'pending',{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST'){const completed=await existing();if(completed)return completed;throw new Error('Request is already being saved. Retry shortly.');}throw error;}
 try{
  const raced=await existing();if(raced)return raced;
  const request:PublicServiceRequest={...input,id:randomUUID(),businessId:business.businessId,businessSlug:business.slug,reference:'REQ-'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),status:'pending_confirmation',submittedAt:new Date().toISOString(),source:'public-web',internalNotes:'',confirmationStatus:'unconfirmed',notificationStatus:'not_configured'};
  const temporary=file+'.tmp-'+randomUUID();await writeFile(temporary,JSON.stringify({fingerprint,request}),{flag:'wx',mode:0o600});await rename(temporary,file);return request;
 }finally{await unlink(lock);}
}
export async function listDevelopmentRequests(businessId:string,directory=devStoreDirectory()){
 await mkdir(directory,{recursive:true,mode:0o700});const requests:PublicServiceRequest[]=[];
 for(const name of await readdir(directory)){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;const record=JSON.parse(await readFile(join(directory,name),'utf8'));if(record.request.businessId===businessId)requests.push(record.request);}
 return requests.sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
}
