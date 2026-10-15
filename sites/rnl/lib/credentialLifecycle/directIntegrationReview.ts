import 'server-only';
import type {SchedulingRpc} from '../../../../src/app/lib/publicScheduling/productionAdapter.ts';
// Review-only integration. No route imports, environment reads, network driver or activation switch.
export const directProductionEnabled=false;
interface Client {query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;release(destroy?:boolean):void}
interface Pool {connect():Promise<Client>;end():Promise<void>;on(event:'error',handler:()=>void):void}
interface Driver {Pool:new(options:Record<string,unknown>)=>Pool}
export type ReviewedDirectConfig={mode:'offline-review';project:'gqknefosisnsjuzmhvts';host:string;verifiedHost:string;port:5432|6543;role:'trimax_scheduling_web';database:'postgres';password:string;ca:string};
export const scopeSql=`SELECT current_user AS role,session_user AS session_role,
 (SELECT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND (rolvaliduntil IS NULL OR rolvaliduntil>now()) FROM pg_roles WHERE rolname=current_user) AS safe_role,
 NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS no_memberships,
 has_function_privilege(current_user,'public.trimax_public_scheduling_config(text)','EXECUTE') AND has_function_privilege(current_user,'public.trimax_submit_public_service_request(text,jsonb,text,text)','EXECUTE') AS required_rpcs,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND has_schema_privilege(current_user,n.oid,'USAGE') AND has_function_privilege(current_user,p.oid,'EXECUTE') AND p.oid NOT IN ('public.trimax_public_scheduling_config(text)'::regprocedure,'public.trimax_submit_public_service_request(text,jsonb,text,text)'::regprocedure)) AS no_other_rpcs,
 NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','v','m','f') AND has_schema_privilege(current_user,n.oid,'USAGE') AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) AS no_tables, NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND has_schema_privilege(current_user,oid,'CREATE')) AS no_create`;
/** Driver injection permits local acceptance without touching production. Project host
 * must come from separately verified provider configuration; no production role exists yet. */
export function createReviewedDirectIntegration(driver:Driver,config:ReviewedDirectConfig,diagnostic:(code:string)=>void=()=>{}){
 if(config.mode!=='offline-review'||config.project!=='gqknefosisnsjuzmhvts'||config.role!=='trimax_scheduling_web'||config.database!=='postgres'||config.host!=='aws-1-us-west-2.pooler.supabase.com'||config.port!==6543||config.host!==config.verifiedHost||!/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(config.host)||![5432,6543].includes(config.port)||!config.ca||config.password.length<24)throw Error('DIRECT_CONFIGURATION_REJECTED');
 const pool=new driver.Pool({host:config.host,port:config.port,user:config.role+'.'+config.project,database:config.database,password:config.password,ssl:{rejectUnauthorized:true,ca:config.ca},max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,maxLifetimeSeconds:60,query_timeout:10000,allowExitOnIdle:true,application_name:'trimax-scheduling-reviewed'});
 let stopped=false,inFlight=0;const report=(code:string)=>{try{diagnostic(code);}catch{/* diagnostics cannot replace cleanup */}};
 pool.on('error',()=>report('DIRECT_POOL_UNAVAILABLE'));
 const unavailable=()=>({data:null,error:{message:'Scheduling unavailable'}});
 const rpc:SchedulingRpc={async rpc(name,args){
  if(stopped||inFlight>=2)return unavailable();
  const configCall=name==='trimax_public_scheduling_config';if(!configCall&&name!=='trimax_submit_public_service_request')throw Error('RPC_NOT_ALLOWED');
  const keys=configCall?['p_slug']:['p_slug','p_payload','p_idempotency_hash','p_capability_hash'];
  if(Object.keys(args).length!==keys.length||Object.keys(args).some(k=>!keys.includes(k))||typeof args.p_slug!=='string'||!/^[-a-z0-9]{1,60}$/.test(args.p_slug))throw Error('INVALID_ARGUMENTS');
  if(!configCall&&(!args.p_payload||typeof args.p_payload!=='object'||Array.isArray(args.p_payload)||![args.p_idempotency_hash,args.p_capability_hash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))))throw Error('INVALID_ARGUMENTS');
  inFlight++;let client:Client|undefined,failed=false;
  try{client=await pool.connect();if(stopped)throw Error('STOPPED');await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='8s'");
   const health=(await client.query(scopeSql)).rows[0];if(health?.role!==config.role||health.session_role!==config.role||!['safe_role','no_memberships','required_rpcs','no_other_rpcs','no_tables','no_create'].every(k=>health[k]===true))throw Error('SCOPE_MISMATCH');
   if(stopped)throw Error('STOPPED');
   const sql=configCall?'SELECT public.trimax_public_scheduling_config($1::text) result':'SELECT public.trimax_submit_public_service_request($1::text,$2::jsonb,$3::text,$4::text) result';
   const result=await client.query(sql,keys.map(k=>k==='p_payload'?JSON.stringify(args[k]):args[k]));if(result.rows.length!==1||!Object.hasOwn(result.rows[0],'result'))throw Error('INVALID_RESULT');await client.query('COMMIT');return {data:result.rows[0].result,error:null};
  }catch(error){failed=true;report('DIRECT_REQUEST_FAILED');if(client)await client.query('ROLLBACK').catch(()=>{});return {data:null,error:{message:error instanceof Error&&error.message==='Idempotency conflict'?'Idempotency conflict':'Scheduling unavailable'}};}
  finally{try{client?.release(failed);}finally{inFlight--;}}
 }};
 // Stops new work immediately; already executing SQL may finish. DB revocation/
 // scoped backend containment is the independent emergency boundary.
 return {rpc,status:()=>({stopped,inFlight,productionEnabled:false}),async stop(){stopped=true;await pool.end();}};
}

