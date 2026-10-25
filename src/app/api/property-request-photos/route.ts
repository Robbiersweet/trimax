import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {photoRuntime} from '../../lib/requestPhotos/runtime';
import {boundedPhotoBody} from '../../lib/requestPhotos/http';
import {uploadRequestPhoto} from '../../lib/requestPhotos/upload';
import {photoStorage} from '../../lib/requestPhotos/storage';
export const runtime='nodejs';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 try{const config=photoRuntime(process.env);if(!config.origins.has(request.headers.get('origin')??''))return Response.json({error:'Photo unavailable'},{status:403,headers});}catch{return Response.json({error:'Photos are not enabled.'},{status:503,headers});}
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1],secret=request.headers.get('x-photo-capability');if(!token||!secret||!/^[a-f0-9]{64}$/.test(secret))return Response.json({error:'Sign in to add photos.'},{status:401,headers});
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,service=process.env.SUPABASE_SERVICE_ROLE_KEY!;if(!anon||!service)throw Error('Unavailable');
  const actor=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const verified=await actor.auth.getUser(token);if(verified.error||!verified.data.user)return Response.json({error:'Sign in to add photos.'},{status:401,headers});
  const storageClient=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await uploadRequestPhoto({requestId:request.headers.get('x-request-id')??'',uploadId:request.headers.get('x-upload-id')??'',secret,bytes:await boundedPhotoBody(request)},{sharp,storage:photoStorage(storageClient),rpc:{rpc:async(name,args)=>{
   const target=name==='trimax_reserve_request_photo'?'trimax_reserve_property_request_photo':name==='trimax_complete_request_photo'?'trimax_complete_property_request_photo':null;if(!target)throw Error('RPC rejected');return await actor.rpc(target,args);
  }}});return Response.json(result,{headers});
 }catch{return Response.json({error:'Photo could not be added. Your request remains received. Check your property access and retry.'},{status:400,headers});}
}
export async function GET(){try{photoRuntime(process.env);return Response.json({enabled:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({enabled:false},{headers:{'Cache-Control':'no-store'}});}}
