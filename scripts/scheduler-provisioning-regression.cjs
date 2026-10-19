/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {provision}=require('./provision-request-scheduler.cjs');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
(async()=>{
 const env={TRIMAX_PROVISION_REQUEST_SCHEDULER:'approved-once',VERCEL:'1',VERCEL_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://gqknefosisnsjuzmhvts.supabase.co',CRON_SECRET:'synthetic-credential-never-production',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role'};
 let calls=[];
 const send=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>calls.length===1?'ready':'stored'};};
 assert.equal(await provision({},send),'disabled');assert.equal(calls.length,0);
 for(const patch of [{VERCEL_ENV:'preview'},{VERCEL:'0'},{NEXT_PUBLIC_SUPABASE_URL:'https://other.example'},{CRON_SECRET:''},{SUPABASE_SERVICE_ROLE_KEY:''}])await assert.rejects(()=>provision({...env,...patch},send));
 assert.equal(calls.length,0);
 assert.equal(await provision(env,send),'verified');assert.equal(calls.length,2);
 assert.equal(JSON.parse(calls[0].options.body).p_secret,null);
 assert.equal(JSON.parse(calls[1].options.body).p_secret,env.CRON_SECRET);
 assert(calls.every(c=>c.options.redirect==='error'&&c.url==='https://gqknefosisnsjuzmhvts.supabase.co/rest/v1/rpc/trimax_provision_request_scheduler'));
 for(const failure of ['logging_configuration_rejected','conflict','failed']){
  let n=0;await assert.rejects(()=>provision(env,async()=>({ok:true,json:async()=>++n===1&&failure!=='logging_configuration_rejected'?'ready':failure})),/Scheduler provisioning failed/);
 }
 await assert.rejects(()=>provision(env,async()=>{throw Error(env.CRON_SECRET)}),e=>!e.message.includes(env.CRON_SECRET));
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema vault;
   create table vault.secrets(id uuid default gen_random_uuid(),name text unique,decrypted_secret text);
   create view vault.decrypted_secrets as select * from vault.secrets;
   create function vault.create_secret(text,text,text) returns uuid language sql as 'insert into vault.secrets(decrypted_secret,name) values($1,$2) returning id';`);
  await db.exec(fs.readFileSync('supabase/sql/2026-10-19-scheduler-provisioning-install.sql','utf8'));
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select public.trimax_provision_request_scheduler(null)'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');
  await assert.rejects(()=>db.query('select * from vault.decrypted_secrets'),/permission denied/);
  const call=async(secret)=>(await db.query('select public.trimax_provision_request_scheduler($1) as status',[secret])).rows[0].status;
  assert.equal(await call(null),'ready');assert.equal(await call(env.CRON_SECRET),'stored');assert.equal(await call(env.CRON_SECRET),'matched');assert.equal(await call('different-synthetic-credential'),'conflict');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,1);
  assert.equal((await db.query('select decrypted_secret from vault.secrets')).rows[0].decrypted_secret,env.CRON_SECRET);
  await db.exec("set log_statement='ddl'");assert.equal(await call(null),'ready');
  await db.exec("set log_statement='all'");assert.equal(await call(null),'logging_configuration_rejected');await db.exec("set log_statement='none'");
  await db.exec(fs.readFileSync('supabase/sql/2026-10-19-scheduler-provisioning-remove.sql','utf8'));
  assert.equal((await db.query("select to_regprocedure('public.trimax_provision_request_scheduler(text)') as helper")).rows[0].helper,null);
  assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,1);
 }finally{await db.close();}
 console.log('PASS scheduler provisioning: disabled/preview isolation, fixed destination, logging preflight, sanitized failures, SQL ACLs, create-only verification, idempotency, collision preservation and helper removal. Vault encryption itself requires real extension acceptance.');
})().catch(()=>{console.error('Scheduler provisioning regression failed (synthetic-only fixtures)');process.exitCode=1;});
