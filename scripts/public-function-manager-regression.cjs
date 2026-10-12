/* eslint-disable @typescript-eslint/no-require-imports -- Disposable SQL with synthetic memberships. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222',U='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create role authenticator;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
grant usage on schema auth to authenticated;
create table businesses(id uuid primary key,name text,slug text);
create table business_users(business_id uuid,user_id uuid,email text,role text);
create table property_users(business_id uuid,user_id uuid,email text,property_name text,can_create_queue_items boolean,can_update_queue_items boolean);
create table properties(id uuid primary key,business_id uuid,name text);
create table property_units(id uuid primary key,business_id uuid,property_id uuid,updated_at timestamptz);
create table queue_items(id uuid default gen_random_uuid(),business_id uuid,property text,notes text);
insert into businesses values ('${A}','One','one'),('${B}','Two','two');
insert into property_users values ('${A}','${U}','manager@example.test','Property One',true,true);
insert into properties values ('${A}','${A}','Property One'),('${B}','${B}','Property Two');
insert into property_units values ('${A}','${A}','${A}',null),('${B}','${B}','${B}',null);
grant select on businesses,business_users,property_users,properties,property_units to authenticated;
grant select,insert,update on queue_items to authenticated;`);
const tenant=fs.readFileSync('supabase/sql/2026-08-10-tenant-isolation-hardening.sql','utf8');
await db.exec(tenant.slice(0,tenant.indexOf('create table if not exists public.business_settings')));
await db.exec(fs.readFileSync('supabase/sql/2026-08-10-businesses-read-policy-hardening.sql','utf8'));
await db.exec(fs.readFileSync('supabase/sql/2026-06-11-storage-health.sql','utf8'));
for(const table of ['businesses','queue_items','properties','property_units']){
 await db.exec('alter table '+table+' enable row level security');
 if(table==='businesses')continue;
 const policies=[...tenant.matchAll(/create policy[\s\S]*?;/gi)].map(m=>m[0]).filter(s=>new RegExp('on public\\.'+table+'\\s').test(s));
 assert(policies.length>0,'Missing source policies '+table);for(const sql of policies)await db.exec(sql);
}
// Targeted helper subset only; complete trigger/full-schema acceptance is a separate gate.
const migration=fs.readFileSync('supabase/migrations/20261012_public_function_acl_hardening.sql','utf8');
await db.exec(migration.slice(migration.indexOf('REVOKE'),migration.indexOf('REVOKE EXECUTE ON FUNCTION public.set_job_session_totals')));
await db.exec(`set role authenticated;set test.uid='${U}';set test.email='manager@example.test'`);
assert.equal((await db.query('select * from properties')).rows.length,1);
assert.equal((await db.query('select * from property_units')).rows.length,1);
assert.equal((await db.query('select * from businesses')).rows.length,1);
await db.query('insert into queue_items(business_id,property,notes) values ($1,$2,$3)',[A,'Property One','Synthetic work request']);
await assert.rejects(db.query('insert into queue_items(business_id,property) values ($1,$2)',[B,'Property Two']),/row-level security/);
await assert.rejects(db.query('insert into queue_items(business_id,property) values ($1,$2)',[A,'Other Property']),/row-level security/);
await db.exec('reset role;set role anon');
await assert.rejects(db.query('select trimax_can_create_property_queue($1,$2)',[A,'Property One']),/permission denied/);
await assert.rejects(db.query('insert into queue_items(business_id,property) values ($1,$2)',[A,'Property One']),/permission denied/);
await db.exec('reset role');
for(const n of ['20261009_public_scheduling_foundation.sql','20261010_public_scheduling_phase2.sql','20261011_public_scheduling_runtime.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+n,'utf8'));
await db.exec('set role trimax_scheduling_intake');
await assert.rejects(db.query('select trimax_can_create_property_queue($1,$2)',[A,'Property One']),/permission denied/);
await assert.rejects(db.query('select * from queue_items'),/permission denied/);
console.log('PASS synthetic property membership: request/Queue insert, property/unit/business read, cross-tenant/property denial, anon/intake denial');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
