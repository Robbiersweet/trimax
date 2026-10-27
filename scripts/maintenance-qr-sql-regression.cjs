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
 for(const name of ['20261009_public_scheduling_foundation.sql','20261010_public_scheduling_phase2.sql','20261017_scheduling_owner_notifications.sql','20261018_service_request_workflow.sql','20261018_service_request_delivery.sql','20261018_request_urgency.sql','20261025_property_request_intake.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,business=uid(1),otherBusiness=uid(2),owner=uid(3),manager=uid(4),outsider=uid(5),assignment=uid(6),client=uid(7),type=uid(8);
 await db.query('insert into businesses values($1),($2)',[business,otherBusiness]);
 await db.query('insert into auth.users values($1),($2),($3)',[owner,manager,outsider]);
 await db.query("insert into business_users values($1,$2,'owner')",[business,owner]);
 await db.query("insert into public_scheduling_settings(business_id,public_slug,display_name) values($1,'test','Synthetic')",[business]);
 await db.query("insert into public_service_request_types(id,business_id,public_key,public_label,internal_label) values($1,$2,'repair','Repair','Repair')",[type,business]);
 await db.query("insert into clients(id,business_id,name) values($1,$2,'Assigned client'),($3,$4,'Other client')",[client,business,uid(9),otherBusiness]);
 await db.query("insert into property_users values($1,$2,$3,'Assigned property','manager@example.invalid',false,null)",[assignment,business,manager]);
 async function as(user,fn){await db.exec(`set role authenticated;set test.uid='${user}'`);try{return await fn();}finally{await db.exec('reset role');}}

 await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261027_qr_photo_compatibility.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026_request_photo_candidate.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026_property_request_photos.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026_property_request_preferences.sql','utf8'));

 await db.exec(fs.readFileSync('supabase/migrations/20261027_maintenance_qr_intake.sql','utf8'));
 await db.query('update public_scheduling_settings set enabled=true where business_id=$1',[business]);
 const manage=(bid=business,aid=assignment,unit='A-12')=>db.query('select trimax_manage_maintenance_qr($1,$2,$3,$4) r',[bid,aid,unit,'Synthetic property address']);
 await fail(()=>as(manager,()=>manage()),/Not authorized/);
 await fail(()=>as(outsider,()=>manage()),/Not authorized/);
 await fail(()=>as(owner,()=>manage(otherBusiness)),/Not authorized/);
 const created=(await as(owner,()=>manage())).rows[0].r;
 eq(created.labels.length,1);const label=created.labels[0].id;
 eq((await as(owner,()=>manage())).rows[0].r.labels[0].id,label);
 const publicPayload={requestTypeId:'repair',customerName:'Synthetic resident',phone:'4255550100',email:'resident@example.test',preferredContact:'email',address:'tampered other property',description:'Synthetic repair only',preferredDate:'',timeWindowId:'',flexibility:'flexible',urgency:'urgent',notes:'Customer note',consent:true,uploadCapabilityHash:'a'.repeat(64)};
 const publicSubmit=(key='synthetic-qr-request-01',payload=publicPayload)=>db.query('select trimax_submit_maintenance_qr($1,$2,$3,$4) r',[label,JSON.stringify(payload),key,'b'.repeat(64)]);
 await db.exec('set role service_role');
 const publicResult=(await publicSubmit()).rows[0].r;
 eq((await publicSubmit()).rows[0].r,publicResult);
 await fail(()=>publicSubmit('synthetic-qr-request-01',{...publicPayload,description:'Changed'}),/Idempotency/);
 await db.exec('reset role');
 const saved=(await db.query('select business_id,service_address,integration_references,urgency,upload_capability_hash from public_service_requests where id=$1',[publicResult.id])).rows[0];
 eq(saved.business_id,business);eq(saved.service_address,'Synthetic property address, Unit A-12');eq(saved.integration_references.propertyUnit,'A-12');eq(saved.urgency,'urgent');eq(saved.upload_capability_hash,'a'.repeat(64));
 eq((await db.query('select count(*)::int n from scheduling_owner_notifications where request_id=$1',[publicResult.id])).rows[0].n,1);
 const managerPayload={requestTypeId:type,unit:'tampered',description:'Synthetic manager repair',preferredDate:'',directQueue:true,urgency:'urgent',uploadCapabilityHash:'a'.repeat(64)};
 const managerSubmit=(key='synthetic-manager-qr-01',aid=assignment)=>db.query('select trimax_submit_manager_maintenance_qr($1,$2,$3,$4) r',[label,aid,key,JSON.stringify(managerPayload)]);
 await fail(()=>as(outsider,()=>managerSubmit()),/Not authorized/);
 await fail(()=>as(manager,()=>managerSubmit()),/not enabled/);
 await db.query('update property_users set can_create_queue_items=true,request_client_id=$1 where id=$2',[client,assignment]);
 const direct=(await as(manager,()=>managerSubmit())).rows[0].r;
 eq((await as(manager,()=>managerSubmit())).rows[0].r,direct);
 const queued=(await db.query('select unit,business_id,source_request_id from queue_items where id=$1',[direct.queueItemId])).rows[0];eq(queued.unit,'A-12');eq(queued.business_id,business);eq(queued.source_request_id,direct.id);
 await db.query('update property_users set user_id=$1 where id=$2',[outsider,assignment]);
 await fail(()=>as(manager,()=>managerSubmit('revoked-manager-qr-01')),/Not authorized/);
 for(const role of ['anon','authenticated','trimax_scheduling_web']){await db.exec('set role '+role);await fail(()=>db.query('select * from maintenance_qr_labels'),/permission/);await fail(()=>publicSubmit('unauthorized-qr-00001'),/permission/);await db.exec('reset role');}
 await db.query('update maintenance_qr_labels set active=false where id=$1',[label]);await db.exec('set role service_role');await fail(()=>publicSubmit('inactive-label-00001'),/Label unavailable/);await db.exec('reset role');
 console.log('PASS '+checks+' QR SQL checks: permanent ID, owner/property isolation, public location override prevention, notification, photo binding, idempotency, permission-gated manager Queue, revocation, denied table/RPC access. Synthetic local database only.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});


