import {createClient} from '@supabase/supabase-js';

export const runtime='nodejs';
/** Existing server-only credential performs retention. Neither OCR worker gains deletion access. */
export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const expired=await client.rpc('trimax_expired_ocr_objects');
 if(expired.error)return Response.json({error:'Retention listing failed'},{status:503});
 const paths=(expired.data??[]) as string[];
 if(paths.length){
  const deleted=await client.storage.from('trimax-ocr-captures').remove(paths);
  if(deleted.error)return Response.json({error:'Object retention will retry'},{status:503});
 }
 return Response.json({removed:paths.length});
}
