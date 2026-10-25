/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},fail=async(fn,re)=>{await assert.rejects(fn,re);checks++};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role trimax_scheduling_web;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table businesses(id uuid primary key);create table business_users(business_id uuid,user_id uuid,role text);grant select on business_users to authenticated;
 create table clients(id uuid primary key default gen_random_uuid(),business_id uuid,created_by_user_id uuid,name text not null,contact_name text,email text,phone text,service_address text);
 create table property_users(id uuid primary key,business_id uuid,user_id uuid,property_name text,email text,can_create_queue_items boolean);
 create table push_subscriptions(id uuid primary key,business_id uuid,user_id uuid,status text);
 create table queue_items(id text primary key,business_id uuid,created_by_user_id uuid,property text not null,unit text not null,status text,priority text,notes text,scheduled_date date,completed_date date);`);
 for(const name of ['20261009_public_scheduling_foundation.sql','20261010_public_scheduling_phase2.sql','20261017_scheduling_owner_notifications.sql','20261018_service_request_workflow.sql','20261018_service_request_delivery.sql','20261018_request_urgency.sql','20261025_workflow_experience.sql','20261025_property_request_intake.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,business=uid(1),otherBusiness=uid(2),owner=uid(3),manager=uid(4),outsider=uid(5),assignment=uid(6),client=uid(7),type=uid(8);
 await db.query('insert into businesses values($1),($2)',[business,otherBusiness]);
 await db.query('insert into auth.users values($1),($2),($3)',[owner,manager,outsider]);
 await db.query("insert into business_users values($1,$2,'owner')",[business,owner]);
 await db.query("insert into public_scheduling_settings(business_id,public_slug,display_name) values($1,'test','Synthetic')",[business]);
 await db.query("insert into public_service_request_types(id,business_id,public_key,public_label,internal_label) values($1,$2,'repair','Repair','Repair')",[type,business]);
 await db.query("insert into clients(id,business_id,name) values($1,$2,'Assigned client'),($3,$4,'Other client')",[client,business,uid(9),otherBusiness]);
 await db.query("insert into property_users values($1,$2,$3,'Assigned property','manager@example.invalid',false,null)",[assignment,business,manager]);
 async function as(user,fn){await db.exec(`set role authenticated;set test.uid='${user}'`);try{return await fn();}finally{await db.exec('reset role');}}

 await db.exec("alter table public_service_requests add column sms_consent_at timestamptz,add column sms_consent_version text,add column sms_consent_source text;");
 await db.exec(fs.readFileSync('supabase/migrations/20261026_request_photo_candidate.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026_property_request_photos.sql','utf8'));
 const payload={requestTypeId:type,unit:'A-12',description:'Synthetic photo request',preferredDate:'',directQueue:false,uploadCapabilityHash:'a'.repeat(64)};
 const submit=(key,extra={},id=assignment)=>db.query('select trimax_submit_property_request($1,$2,$3) r',[id,key,JSON.stringify({...payload,...extra})]);
 const first=(await as(manager,()=>submit('photo-request-00001'))).rows[0].r;
 eq((await as(manager,()=>submit('photo-request-00001'))).rows[0].r,first);
 await fail(()=>as(manager,()=>submit('photo-request-00001',{uploadCapabilityHash:'b'.repeat(64)})),/Idempotency/);
 const reserve=(request=first.id,hash=payload.uploadCapabilityHash,photo=uid(40))=>db.query('select trimax_reserve_property_request_photo($1,$2,$3,$4,100) r',[request,hash,photo,'c'.repeat(64)]);
 await fail(()=>as(outsider,()=>reserve()),/Photo rejected/);
 await fail(()=>as(owner,()=>reserve()),/Photo rejected/);
 await db.query("update public_service_requests set source='public-web' where id=$1",[first.id]);await fail(()=>as(manager,()=>reserve()),/Photo rejected/);await db.query("update public_service_requests set source='property-manager' where id=$1",[first.id]);
 const reserved=(await as(manager,()=>reserve())).rows[0].r;eq(reserved.objectKey,business+'/'+first.id+'/'+uid(40)+'.jpg');
 eq((await as(manager,()=>reserve())).rows[0].r,reserved);
 await as(manager,()=>db.query('select trimax_complete_property_request_photo($1,$2,$3,$4,8,8)',[first.id,payload.uploadCapabilityHash,uid(40),'d'.repeat(64)]));
 await db.exec("set role service_role;set test.uid=''");await fail(()=>db.query('select trimax_reserve_request_photo($1,$2,$3,$4,100)',[first.id,payload.uploadCapabilityHash,uid(41),'c'.repeat(64)]),/Photo rejected/);await db.exec('reset role');
 await db.query('update property_users set can_create_queue_items=true,request_client_id=$1 where id=$2',[client,assignment]);
 const direct=(await as(manager,()=>submit('photo-direct-00001',{directQueue:true}))).rows[0].r;assert.ok(direct.queueItemId);checks++;
 await as(manager,()=>reserve(direct.id,payload.uploadCapabilityHash,uid(42)));
 eq((await db.query('select q.id from request_photos p join queue_items q on q.source_request_id=p.request_id and q.business_id=p.business_id where p.id=$1',[uid(42)])).rows[0].id,direct.queueItemId);
 await db.query('update property_users set business_id=$1 where id=$2',[otherBusiness,assignment]);await fail(()=>as(manager,()=>reserve()),/Photo rejected/);
 await db.query('update property_users set business_id=$1,user_id=$2 where id=$3',[business,outsider,assignment]);await fail(()=>as(manager,()=>reserve()),/Photo rejected/);await fail(()=>as(outsider,()=>reserve()),/Photo rejected/);
 await db.exec('set role anon');await fail(()=>reserve(),/permission denied/);await db.exec('reset role');
 console.log(JSON.stringify({result:'PASS',checks,scope:'manager photo exact assignment/actor/business, public bypass denial, retry and private Queue linkage'}));
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});

