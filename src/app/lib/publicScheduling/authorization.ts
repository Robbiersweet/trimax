import {isIntakeRole} from './domain.ts';
export interface IntakeAuthVerifier {
 getUser(token:string):Promise<{id:string}|null>;
 getMembershipRoles(workspace:string,userId:string):Promise<unknown[]>;
}
export type IntakeAuthEnvironment=Record<string, string | undefined>;
export type IntakeAuthVerifierFactory=(input:{url:string;key:string;token:string})=>Promise<IntakeAuthVerifier>;
const supabaseVerifier:IntakeAuthVerifierFactory=async({url,key,token})=>{
 const {createClient}=await import('@supabase/supabase-js');
 const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 return {
  async getUser(accessToken){const {data,error}=await client.auth.getUser(accessToken);return error||!data.user?null:{id:data.user.id};},
  async getMembershipRoles(workspace,userId){const {data,error}=await client.from('business_users').select('role').eq('business_id',workspace).eq('user_id',userId);if(error)throw new Error('Membership verification unavailable');return (data??[]).map(m=>m.role);}
 };
};
/** Existing verified-user + business_users authorization, with a testable verifier
 * boundary. Request data can never select the verifier or workspace binding. */
export async function authorizeIntake(request:Request,slug:string,environment:IntakeAuthEnvironment=process.env,verifierFactory:IntakeAuthVerifierFactory=supabaseVerifier){
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)return false;
 const url=environment.NEXT_PUBLIC_SUPABASE_URL,key=environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,bindings=environment.PUBLIC_SCHEDULING_DEV_WORKSPACE_BINDINGS;
 if(!url||!key||!bindings)return false;
 let mapping:Record<string,string>;try{mapping=JSON.parse(bindings);}catch{return false;}
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))return false;
 const workspace=mapping[slug];if(typeof workspace!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(workspace))return false;
 try{
  const verifier=await verifierFactory({url,key,token});
  const user=await verifier.getUser(token);if(!user)return false;
  return (await verifier.getMembershipRoles(workspace,user.id)).some(isIntakeRole);
 }catch{return false;}
}
