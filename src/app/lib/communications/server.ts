import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
export function isolatedSmsTestDatabase(){
 const expected=process.env.SMS_TEST_SUPABASE_URL,url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!expected||url!==expected)return false;
 try{return !new URL(url).hostname.startsWith('gqknefosisnsjuzmhvts.');}catch{return false;}
}
export function communicationsDb(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('communications_unavailable');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function authorizedCron(request:Request){
 const expected=process.env.CRON_SECRET,value=request.headers.get('authorization')||'';
 return !!expected&&Buffer.byteLength(value)===Buffer.byteLength(`Bearer ${expected}`)&&timingSafeEqual(Buffer.from(value),Buffer.from(`Bearer ${expected}`));
}
export async function communicationsOwner(request:Request){
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)throw Error('owner_required');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:user,error}=await db.auth.getUser(token);if(error||!user.user)throw Error('owner_required');
 const slug=new URL(request.url).searchParams.get('business');
 const {data:s}=await db.from('public_scheduling_settings').select('business_id').eq('public_slug',slug).maybeSingle();if(!s)throw Error('owner_required');
 const {data:members}=await db.from('business_users').select('role').eq('business_id',s.business_id).eq('user_id',user.user.id).in('role',['owner','admin']);if(!members?.length)throw Error('owner_required');
 return {db,businessId:s.business_id};
}
