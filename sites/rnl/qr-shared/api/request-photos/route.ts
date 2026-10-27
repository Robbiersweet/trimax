import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {photoRuntime} from '../../lib/requestPhotos/runtime';
import {boundedPhotoBody} from '../../lib/requestPhotos/http';
import {uploadRequestPhoto} from '../../lib/requestPhotos/upload';
import {photoStorage} from '../../lib/requestPhotos/storage';
import {productionOwner} from '../../lib/publicScheduling/productionOwner';
export const runtime='nodejs';
function allowedOrigins(){try{return photoRuntime(process.env).origins;}catch{return new Set<string>();}}
function headers(request:Request){const origin=request.headers.get('origin');return {'Cache-Control':'no-store','Vary':'Origin',...(origin&&allowedOrigins().has(origin)?{'Access-Control-Allow-Origin':origin}:{} )};}
function client(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('Unavailable');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
function enabled(){try{photoRuntime(process.env);return true;}catch{return false;}}
export async function OPTIONS(request:Request){return new Response(null,{status:allowedOrigins().has(request.headers.get('origin')??'')?204:403,headers:{...headers(request),'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Request-ID, X-Upload-ID','Access-Control-Max-Age':'600'}});}
export async function POST(request:Request){
 if(!enabled())return Response.json({error:'Photos unavailable. Your request remains received.'},{status:503,headers:headers(request)});
 if(!allowedOrigins().has(request.headers.get('origin')??''))return new Response(null,{status:403,headers:headers(request)});
 const secret=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!secret)return new Response(null,{status:403,headers:headers(request)});
 try{const db=client(),result=await uploadRequestPhoto({requestId:request.headers.get('x-request-id')??'',uploadId:request.headers.get('x-upload-id')??'',secret,bytes:await boundedPhotoBody(request)},{rpc:{rpc:async(name,args)=>await db.rpc(name,args)},storage:photoStorage(db),sharp});return Response.json(result,{headers:headers(request)});}
 catch{return Response.json({error:'Photo could not be added. Retry this photo; your request remains received.'},{status:400,headers:headers(request)});}
}
export async function GET(request:Request){
 if(!enabled())return Response.json({photos:[]},{headers:headers(request)});
 try{const params=new URL(request.url).searchParams,id=params.get('request')??'',owner=await productionOwner(request,params.get('business')??'');const found=(await owner.list(id)).find(r=>r.id===id);if(!found)throw Error('Denied');const db=client();const {data,error}=await db.from('request_photos').select('id,object_key,width,height').eq('request_id',id).eq('business_id',found.businessId).eq('state','complete');if(error)throw error;const photos=await Promise.all((data??[]).map(async p=>{if(p.object_key!==`${found.businessId}/${id}/${p.id}.jpg`)throw Error('Invalid binding');const signed=await db.storage.from('request-photos-private').createSignedUrl(p.object_key,60);if(signed.error)throw signed.error;return{id:p.id,url:signed.data.signedUrl,width:p.width,height:p.height};}));return Response.json({photos},{headers:headers(request)});}catch{return Response.json({error:'Photos unavailable'},{status:403,headers:headers(request)});}
}
