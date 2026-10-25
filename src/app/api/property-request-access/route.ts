import {createClient} from '@supabase/supabase-js';
import {readBoundedJson} from '@/app/lib/publicScheduling/httpBody';
export async function POST(request:Request){
 if(process.env.VERCEL_ENV==='preview'||process.env.SERVICE_REQUEST_WORKFLOW_ENABLED!=='enabled')return Response.json({error:'Live access changes are disabled in this environment.'},{status:403});
 try{const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();const value=await readBoundedJson(request,1000) as Record<string,unknown>;const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);if(!value||!uuid(value.assignmentId)||(value.clientId!==null&&!uuid(value.clientId))||typeof value.direct!=='boolean')throw Error();
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});const {data:user,error:authError}=await client.auth.getUser(token);if(authError||!user.user)throw Error();const {error}=await client.rpc('trimax_set_property_request_access',{p_assignment_id:value.assignmentId,p_client_id:value.clientId,p_direct:value.direct});if(error)throw Error();return Response.json({saved:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Access not saved. Verify owner/admin access, migration availability, and a client in the same workspace.'},{status:403});}
}
