/* eslint-disable @typescript-eslint/no-require-imports -- Private schema-only disposable validation; never production SQL. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const base=path.join(process.env.LOCALAPPDATA,'Trimax/scheduling-security-release');
const snapshot=JSON.parse(fs.readFileSync(path.join(base,'production-catalog.json'),'utf8'));
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/scheduling-security-pg17/node_modules/@electric-sql/pglite'));
const quote=x=>'"'+x.replaceAll('"','""')+'"';
(async()=>{const db=new PGlite();let stage='bootstrap';try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator;
create schema auth;create schema extensions;create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
create function extensions.digest(v text,a text) returns bytea language sql immutable as $$select sha256(convert_to(v,'UTF8'))$$;
create function extensions.digest(v bytea,a text) returns bytea language sql immutable as $$select sha256(v)$$;
create function storage.foldername(v text) returns text[] language sql immutable as $$select string_to_array(v,'/')$$;
create table storage.objects(id uuid,bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
grant usage on schema auth,public,storage to anon,authenticated,service_role;
set check_function_bodies=off;`);
stage='tables';
const tables=Object.groupBy(snapshot.columns,c=>c.table);
for(const [name,columns] of Object.entries(tables)){
 columns.sort((a,b)=>a.position-b.position);
 await db.exec('create table public.'+quote(name)+'('+columns.map(c=>quote(c.name)+' '+c.type+(c.default?' default '+c.default:'')+(c.notnull?' not null':'')).join(',')+')');
 if(columns[0].rls)await db.exec('alter table '+quote(name)+' enable row level security');
 if(columns[0].force)await db.exec('alter table '+quote(name)+' force row level security');
}
stage='constraints';
for(const k of snapshot.constraints.filter(k=>k.kind!=='f').concat(snapshot.constraints.filter(k=>k.kind==='f')))await db.exec('alter table '+quote(k.table)+' add constraint '+quote(k.name)+' '+k.definition);
for(const i of snapshot.indexes)if(!snapshot.constraints.some(k=>k.name===i.indexname))await db.exec(i.indexdef);
stage='functions';
for(const f of snapshot.functions){await db.exec(f.definition);await db.exec('revoke all on function '+f.name+' from public,postgres');
 for(const grant of (f.acl||'').slice(1,-1).split(',').filter(Boolean)){const [role,rights]=grant.split('=');if(rights.startsWith('X'))await db.exec('grant execute on function '+f.name+' to '+(role?quote(role):'PUBLIC'));}
}
stage='policies';
for(const p of snapshot.policies){await db.exec('create policy '+quote(p.policyname)+' on '+quote(p.schemaname)+'.'+quote(p.tablename)+' as '+p.permissive+' for '+p.cmd+' to '+p.roles.map(r=>r==='public'?'PUBLIC':quote(r)).join(',')+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':''));}
for(const t of snapshot.triggers)await db.exec(t.definition);
stage='views';
for(const v of snapshot.views)await db.exec('create view public.'+quote(v.name)+(v.options?.length?' with ('+v.options.join(',')+')':'')+' as '+v.definition);
stage='grants';
for(const g of snapshot.grants)await db.exec('grant '+g.privilege_type+' on '+quote(g.table_schema)+'.'+quote(g.table_name)+' to '+quote(g.grantee)+(g.is_grantable==='YES'?' with grant option':''));
stage='fingerprint';
const attestation=fs.readFileSync('supabase/sql/2026-10-01-release-attestation.sql','utf8');
const parts=attestation.slice(attestation.indexOf(' with tables as ('),attestation.indexOf(', hashes as ('));
const rows=(await db.query(parts+' select * from parts')).rows;
fs.writeFileSync(path.join(base,'disposable-catalog-parts.json'),JSON.stringify(rows,null,2));
const hashes=Object.fromEntries(Object.entries(Object.groupBy(rows,r=>r.kind)).map(([kind,items])=>{items.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));return [kind,{entries:items.length,sha256:crypto.createHash('sha256').update(items.map(x=>x.name+'='+x.value).join('\r\n')).digest('hex')}];}));
const expected=JSON.parse(fs.readFileSync('release/evidence/database-rc10-prior.json','utf8')).fingerprints;
fs.writeFileSync(path.join(base,'disposable-baseline.json'),JSON.stringify({stage,hashes,expected},null,2));
assert.deepEqual(hashes,expected,'Disposable production catalog must match pinned baseline before applying migration');
console.log('PASS exact live catalog restored with all five baseline fingerprints');
stage='migrations';
// Live postgres/public defaults, read from pg_default_acl. They affect NEW
// objects and are not represented in catalog-v1's existing-object hashes.
await db.exec(`alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant execute on functions to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;`);
// Rehearse the proven Windows SQL-editor transport bytes, not checkout newline style.
// Catalog-v1 remains byte-exact; do not normalize stored definitions or hashes.
for(const migration of ['20261012_public_function_acl_hardening.sql','20261009_public_scheduling_foundation.sql','20261010_public_scheduling_phase2.sql','20261011_public_scheduling_runtime.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8').replace(/\r?\n/g,'\r\n'));
stage='scope';
const executable=(await db.query("select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('trimax_scheduling_intake',p.oid,'EXECUTE') order by 1")).rows.map(r=>r.name);
const allowed=['trimax_public_request_status(text,text)','trimax_public_scheduling_config(text)','trimax_submit_public_service_request(text,jsonb,text,text)'];
fs.writeFileSync(path.join(base,'disposable-intake-scope.json'),JSON.stringify({executable,allowed},null,2));
assert.deepEqual(executable,allowed,'Intake must execute only three explicitly approved RPCs');
const tableAccess=(await db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v') and (has_table_privilege('trimax_scheduling_intake',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))")).rows;
assert.equal(tableAccess.length,0,'Intake cannot access tables directly');
console.log('PASS restricted intake effective RPC and table scope');
stage='new-fingerprints';
const newRows=(await db.query(parts+' select * from parts')).rows;
const fingerprints=Object.fromEntries(Object.entries(Object.groupBy(newRows,r=>r.kind)).map(([kind,items])=>{items.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));return [kind,{entries:items.length,sha256:crypto.createHash('sha256').update(items.map(x=>x.name+'='+x.value).join('\r\n')).digest('hex')}];}));
fs.writeFileSync(path.join(base,'candidate-database.json'),JSON.stringify({fingerprints},null,2));
assert.deepEqual(fingerprints,JSON.parse(fs.readFileSync('release/evidence/scheduling-database-expected.json','utf8')).fingerprints,'Reviewed post-migration fingerprints must reproduce exactly');
const actualRpc=newRows.filter(r=>r.kind==='rpc').sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name))).map(r=>({name:r.name,sha256:crypto.createHash('sha256').update(r.name+'='+r.value).digest('hex')}));
assert.deepEqual(actualRpc,JSON.parse(fs.readFileSync('release/evidence/rc11-production-rpc-inputs.json','utf8')).entries,'All 41 production RPC inputs must match byte-for-byte');
if(process.argv.includes('--workflow')){stage='service-workflow-projection';await require('./service-workflow-catalog-replay.cjs')(db,parts,base);}
stage='trigger-invocation';
// Transaction-local fixtures exercise the unchanged trigger bodies as a client
// with NO EXECUTE grants; never touch production or retain synthetic rows.
await db.exec(`begin;create schema trigger_test;grant usage on schema trigger_test to authenticated;
create table trigger_test.timestamps(updated_at timestamptz,started_at timestamptz,ended_at timestamptz,total_minutes integer);
create trigger job before insert on trigger_test.timestamps for each row execute function public.set_job_session_totals();
create trigger units before update on trigger_test.timestamps for each row execute function public.set_property_units_updated_at();
create trigger invoices before update on trigger_test.timestamps for each row execute function public.set_updated_at();
create table trigger_test.attempts(summary jsonb);
create trigger pair before update on trigger_test.attempts for each row execute function public.trimax_preserve_capture_pair();
create table trigger_test.diagnostics(payload jsonb);
create trigger handoff before update on trigger_test.diagnostics for each row execute function public.trimax_preserve_capture_handoff();
create table trigger_test.optical(attempt_id uuid,evidence jsonb);
create trigger optical before update on trigger_test.optical for each row execute function public.trimax_preserve_canonical_optical();
grant select,insert,update on all tables in schema trigger_test to authenticated;
insert into businesses(id,name,slug) values('11111111-1111-1111-1111-111111111111','Synthetic ACL test','synthetic-acl-test');
insert into auth.users(id) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into business_users(business_id,user_id,role,email) values('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner','owner@example.test');
select set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
insert into ocr_attempts(id,business_id,original_id,summary) values('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','{"sourceImageHash":"testhash","canonicalReference":"22222222-2222-2222-2222-222222222222"}');
set role authenticated;
insert into trigger_test.timestamps(started_at,ended_at) values('2026-01-01 00:00Z','2026-01-01 01:00Z');
update trigger_test.timestamps set updated_at='2000-01-01';
insert into trigger_test.attempts values('{"canonicalReference":"saved","sourceImageHash":"testhash","captureState":"image_stored"}');
update trigger_test.attempts set summary='{}';
insert into trigger_test.diagnostics values('{"canonicalCapture":"saved","captureHandoff":"queued"}');
update trigger_test.diagnostics set payload='{}';
insert into trigger_test.optical values('22222222-2222-2222-2222-222222222222','{"images":[{"sha256":"testhash","label":"Canonical OCR input"}]}');
update trigger_test.optical set evidence='{"images":[]}';`);
assert.equal((await db.query('select total_minutes from trigger_test.timestamps')).rows[0].total_minutes,60);
assert((await db.query("select updated_at>'2026-01-01' as ok from trigger_test.timestamps")).rows[0].ok);
assert.equal((await db.query('select summary from trigger_test.attempts')).rows[0].summary.canonicalReference,'saved');
assert.equal((await db.query('select payload from trigger_test.diagnostics')).rows[0].payload.captureHandoff,'queued');
assert.equal((await db.query('select evidence from trigger_test.optical')).rows[0].evidence.images[0].sha256,'testhash');
await db.exec('reset role;rollback');
console.log('PASS all six unchanged trigger bodies execute without client EXECUTE');
}catch(e){fs.writeFileSync(path.join(base,'catalog-replay-failure.json'),JSON.stringify({stage,error:e.message},null,2));throw e;}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
