import 'server-only';
import pg from 'pg';
import type {SubmissionRuntime} from '../.shared/lib/publicScheduling/productionHandler.ts';
import {isolatedLabConfig,labRole} from './isolatedLabBoundary.ts';
import {scopeSql} from './credentialLifecycle/directIntegrationReview.ts';

// Reuse the audited effective table/RPC/CREATE checks. Lab login inherits exactly
// the two-RPC NOLOGIN role; production's separate NOINHERIT login is untouched.
export const labScopeSql=scopeSql.replace('rolconnlimit=1 AND ', '').replace('NOT rolinherit','rolinherit').replace(
 "NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS no_memberships",
 "(SELECT count(*)=1 AND bool_and(r.rolname='trimax_scheduling_web' AND NOT m.admin_option) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS no_memberships");
let runtime:SubmissionRuntime|undefined;
export function isolatedLabRuntime():SubmissionRuntime{
 const config=isolatedLabConfig(); // Check every selection, including after initialization.
 if(runtime)return runtime;
 const db=config.database;
 const pool=new pg.Pool({host:db.hostname,port:5432,user:db.username,password:decodeURIComponent(db.password),database:'postgres',ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,query_timeout:10000,allowExitOnIdle:true,application_name:'trimax-isolated-lab-intake'});
 pool.on('error',()=>{}); // Never log driver objects/connection credentials.
 const attempts=new Map<string,{count:number,until:number}>();
 runtime={config:{origin:config.origin,fingerprintSecret:config.fingerprintSecret,providers:{fingerprintSecret:config.fingerprintSecret,
  // Synthetic provider checks are not evidence of production CAPTCHA/rate-provider delivery.
  challenge:{async verify({token}){return {verified:token==='isolated-lab-synthetic'};}},
  rateLimit:{async consume({key,limit,windowSeconds}){const now=Date.now();let item=attempts.get(key);if(!item||item.until<now){item={count:0,until:now+windowSeconds*1000};attempts.set(key,item);}return {allowed:++item.count<=limit,retryAfterSeconds:windowSeconds};}}
 }},client:{async rpc(name,args){
  const read=name==='trimax_public_scheduling_config';
  if(!read&&name!=='trimax_submit_public_service_request')throw Error('RPC_NOT_ALLOWED');
  const keys=read?['p_slug']:['p_slug','p_payload','p_idempotency_hash','p_capability_hash'];
  if(args.p_slug!==config.slug||Object.keys(args).length!==keys.length||Object.keys(args).some(k=>!keys.includes(k)))throw Error('LAB_ARGUMENTS_REJECTED');
  if(!read){const payload=args.p_payload as Record<string,unknown>;
   if(!payload||!['trimax-acceptance-20261026-customer-a@example.invalid','trimax-acceptance-20261026-customer-b@example.invalid'].includes(String(payload.email))||![args.p_idempotency_hash,args.p_capability_hash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw Error('SYNTHETIC_ONLY');
  }
  const client=await pool.connect();let failed=false;
  try{await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'");
   const health=(await client.query(labScopeSql)).rows[0];
   if(health?.role!==labRole||health.session_role!==labRole||!['safe_role','no_memberships','required_rpcs','no_other_rpcs','no_tables','no_create'].every(k=>health[k]===true))throw Error('LAB_SCOPE_REJECTED');
   const sql=read?'SELECT public.trimax_public_scheduling_config($1::text) result':'SELECT public.trimax_submit_public_service_request($1::text,$2::jsonb,$3::text,$4::text) result';
   const result=await client.query(sql,keys.map(k=>k==='p_payload'?JSON.stringify(args[k]):args[k]));await client.query('COMMIT');return {data:result.rows[0].result,error:null};
  }catch{failed=true;await client.query('ROLLBACK').catch(()=>{});return {data:null,error:{message:'Scheduling unavailable'}};}finally{client.release(failed);}
 }}};
 return runtime;
}
