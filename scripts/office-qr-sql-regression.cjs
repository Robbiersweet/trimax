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
 await db.exec(fs.readFileSync('supabase/migrations/20261028_property_office_qr.sql','utf8'));
 await db.exec(`alter table queue_items add column paint_type text,add column unit_layout text,add column wall_paint_color text,add column flooring text,add column smoked_in boolean,add column primer_requested boolean,add column prior_renovation boolean,add column prior_renovation_details text,add column renovation_needed boolean,add column renovation_needed_details text,add column move_out_date date,add column ready_date date,add column priority_order integer;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261029_office_qr_apartment_turn.sql','utf8'));
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

 await db.query('update property_users set user_id=$1 where id=$2',[manager,assignment]);
 await db.query("update clients set service_address='Saved property address' where id=$1",[client]);
 await db.query("insert into property_users(id,business_id,user_id,property_name,email,can_create_queue_items,request_client_id) values($1,$2,$3,' assigned PROPERTY ','duplicate@example.invalid',false,$4)",[uid(20),business,manager,client]);
 const officeManage=(action='create',id=null,bid=business,aid=assignment)=>db.query('select trimax_manage_property_maintenance_qr($1,$2,$3,$4) r',[bid,aid,action,id]);
 await fail(()=>as(manager,()=>officeManage()),/Not authorized/);
 await fail(()=>as(outsider,()=>officeManage()),/Not authorized/);
 await fail(()=>as(owner,()=>officeManage('create',null,otherBusiness)),/Not authorized/);
 const officeData=(await as(owner,()=>officeManage())).rows[0].r;
 eq(officeData.properties.length,1);eq(officeData.properties[0].address,'Saved property address');
 const office=officeData.labels.find(x=>x.scope==='property');eq(office.unit,null);
 eq((await as(owner,()=>officeManage())).rows[0].r.labels.find(x=>x.scope==='property').id,office.id);
 const submitOffice=(key='office-synthetic-0001',payload={...publicPayload,unit:'Z07',specificArea:'Kitchen'})=>db.query('select trimax_submit_maintenance_qr($1,$2,$3,$4) r',[office.id,JSON.stringify(payload),key,require('node:crypto').createHash('sha256').update(key).digest('hex')]);
 await db.exec('set role service_role');
 await fail(()=>submitOffice('office-missing-unit-01',{...publicPayload}),/Enter a unit/);
 await fail(()=>submitOffice('office-blank-unit-001',{...publicPayload,unit:'  '}),/valid unit/);
 const officeResult=(await submitOffice()).rows[0].r;
 eq((await submitOffice()).rows[0].r,officeResult);
 await fail(()=>submitOffice('office-synthetic-0001',{...publicPayload,unit:'Z07',specificArea:'Bathroom'}),/Idempotency/);
 await fail(()=>submitOffice('office-synthetic-0001',{...publicPayload,unit:'Z08',specificArea:'Kitchen'}),/Idempotency/);
 await db.exec('reset role');
 const officeRow=(await db.query('select * from public_service_requests where id=$1',[officeResult.id])).rows[0];
 eq(officeRow.service_address,'Saved property address, Unit Z07');eq(officeRow.integration_references.propertyUnit,'Z07');eq(officeRow.integration_references.specificArea,'Kitchen');eq(officeRow.status,'pending_confirmation');
 eq((await db.query('select count(*)::int n from queue_items where source_request_id=$1',[officeResult.id])).rows[0].n,0);
 eq((await db.query('select count(*)::int n from scheduling_owner_notifications where request_id=$1',[officeResult.id])).rows[0].n,1);
 // Existing owner workflow, not possession of the QR, authorizes work.
 await db.query("update public_service_requests set status='approved' where id=$1",[officeResult.id]);
 const approved=(await as(owner,()=>db.query("select trimax_service_request_workflow($1,$2,$3,'convert',$4,null,null,null) r",[officeResult.id,officeRow.revision,'office-approve-00001',client]))).rows[0].r;
 const officeQueue=(await db.query('select property,unit,business_id from queue_items where source_request_id=$1',[officeResult.id])).rows[0];
 eq(officeQueue.property,office.property);eq(officeQueue.unit,'Z07');eq(officeQueue.business_id,business);assert.ok(approved);checks++;
 const managerOffice=(await as(manager,()=>db.query('select trimax_submit_manager_maintenance_qr($1,$2,$3,$4) r',[office.id,assignment,'office-manager-00001',JSON.stringify({...managerPayload,unit:'Z09'})]))).rows[0].r;
 eq((await db.query('select unit from queue_items where id=$1',[managerOffice.queueItemId])).rows[0].unit,'Z09');

 const turn={building:'Z',unitLayout:'2x2 - 2 Bed / 2 Bath',carpet:'Replace',vinyl:'Keep',paintType:'Color Change',paintingScope:'Walls, ceiling, trim and doors',specialRequirements:'Synthetic smoke/odor treatment only',smokedIn:true,primerRequested:true,wallPaintColor:'Roman Column',paintCode:'SW 7562',priority:'High',priorRenovation:true,priorRenovationDetails:'Prior cabinet renovation',renovationNeeded:true,renovationNeededDetails:'Repair damaged trim',moveOutDate:'2099-01-01'};
 const turnPayload={...publicPayload,unit:'Z07',specificArea:'Apartment turn',preferredDate:'2099-01-03',notes:'Synthetic access instructions',apartmentTurn:turn};
 await db.exec('set role service_role');
 const turnResult=(await submitOffice('turn-synthetic-request-01',turnPayload)).rows[0].r;
 eq((await submitOffice('turn-synthetic-request-01',turnPayload)).rows[0].r,turnResult);
 for(const changed of [{...turn,carpet:'Keep'},{...turn,priority:'Urgent'}])await fail(()=>submitOffice('turn-synthetic-request-01',{...turnPayload,apartmentTurn:changed}),/Idempotency/);
 for(const invalid of [{...turn,smokedIn:'true'},{...turn,extra:'unauthorized'},{...turn,paintType:'Unreviewed'},{...turn,paintCode:'arbitrary'},{...turn,moveOutDate:'2099-02-31'},{...turn,building:'Bad\nBuilding'}])await fail(()=>submitOffice('turn-invalid-request-001',{...turnPayload,apartmentTurn:invalid}),/turn|paint|date|range|text|option|field|boolean/i);
 await db.exec('reset role');await db.query('update maintenance_qr_labels set active=true where id=$1',[label]);await db.exec('set role service_role');
 await fail(()=>publicSubmit('turn-fixed-unit-denied',{...publicPayload,apartmentTurn:turn}),/Office QR/);
 await db.exec('reset role');await db.query('update maintenance_qr_labels set active=false where id=$1',[label]);
 const turnRow=(await db.query('select * from public_service_requests where id=$1',[turnResult.id])).rows[0];
 eq(turnRow.integration_references.apartmentTurn,turn);eq(turnRow.status,'pending_confirmation');eq(turnRow.upload_capability_hash,'a'.repeat(64));eq(turnRow.customer_notes,'Synthetic access instructions');eq(turnRow.integration_references.propertyUnit,'Z07');
 eq((await db.query('select count(*)::int n from queue_items where source_request_id=$1',[turnResult.id])).rows[0].n,0);
 eq((await db.query('select count(*)::int n from scheduling_owner_notifications where request_id=$1',[turnResult.id])).rows[0].n,1);
 await fail(()=>as(manager,()=>db.query("select trimax_service_request_workflow($1,0,'turn-denied-manager-01','convert',$2,null,null,null)",[turnResult.id,client])),/Not authorized/);
 await fail(()=>as(owner,()=>db.query("select trimax_service_request_workflow($1,$2,'turn-unapproved-denied','convert',$3,null,null,null)",[turnResult.id,turnRow.revision,client])),/Approve/);
 const beforeQueue=(await db.query('select jsonb_agg(to_jsonb(q) order by id) v from queue_items q')).rows[0].v;
 await as(owner,()=>db.query("select trimax_review_public_service_request($1,$2,'approved','','turn-review-owner-001')",[turnResult.id,turnRow.revision]));
 const convertArgs=[turnResult.id,turnRow.revision+1,'turn-convert-owner-001',client];
 const converted=(await as(owner,()=>db.query("select trimax_service_request_workflow($1,$2,$3,'convert',$4,null,null,null) r",convertArgs))).rows[0].r;
 eq((await as(owner,()=>db.query("select trimax_service_request_workflow($1,$2,$3,'convert',$4,null,null,null) r",convertArgs))).rows[0].r,converted);
 eq((await db.query('select jsonb_agg(to_jsonb(q) order by id) v from queue_items q where source_request_id is distinct from $1',[turnResult.id])).rows[0].v,beforeQueue);
 const tq=(await db.query('select * from queue_items where source_request_id=$1',[turnResult.id])).rows;
 eq(tq.length,1);eq(tq[0].apartment_turn,turn);eq(tq[0].paint_type,'Color Change');eq(tq[0].flooring,'Keep Vinyl & Replace Carpet');eq(tq[0].wall_paint_color,'Roman Column SW 7562');eq(tq[0].smoked_in,true);eq(tq[0].primer_requested,true);eq(tq[0].ready_date.toISOString().slice(0,10),'2099-01-03');eq(tq[0].move_out_date.toISOString().slice(0,10),'2099-01-01');eq(tq[0].priority,'High');eq(tq[0].priority_order,null);eq(tq[0].scheduled_date,null);eq(tq[0].property,office.property);eq(tq[0].unit,'Z07');eq(tq[0].prior_renovation_details,'Prior cabinet renovation');eq(tq[0].renovation_needed_details,'Repair damaged trim');
 for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await fail(()=>db.query('select trimax_validate_apartment_turn($1)',[JSON.stringify(turn)]),/permission/);await db.exec('reset role');}
 const replaced=(await as(owner,()=>officeManage('replace',office.id))).rows[0].r.labels.find(x=>x.scope==='property'&&x.active);
 assert.notEqual(replaced.id,office.id);checks++;
 await fail(()=>as(owner,()=>officeManage('replace',office.id)),/QR changed/);
 await db.exec('set role service_role');eq((await db.query('select trimax_maintenance_qr_context($1) r',[office.id])).rows[0].r,null);await fail(()=>submitOffice('old-office-invalid-01'),/Label unavailable/);await db.exec('reset role');
 eq((await db.query('select count(*)::int n from maintenance_qr_requests where request_id=$1',[officeResult.id])).rows[0].n,1);
 // Conflicting saved addresses fail closed without touching existing history.
 await db.query("insert into clients(id,business_id,name,service_address) values($1,$2,'Assigned property','Conflicting address')",[uid(21),business]);
 await fail(()=>as(owner,()=>officeManage()),/Review the saved/);
 await db.exec('set role service_role');eq((await db.query('select trimax_maintenance_qr_context($1) r',[replaced.id])).rows[0].r,null);await db.exec('reset role');
 await db.query('update property_users set is_test_fixture=true where business_id=$1',[business]);
 const hidden=(await as(owner,()=>db.query('select trimax_manage_maintenance_qr($1) r',[business]))).rows[0].r;eq(hidden.properties.length,0);eq(hidden.labels.length,0);
 eq((await db.query('select count(*)::int n from maintenance_qr_labels')).rows[0].n,3);
 for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await fail(()=>db.query('select * from trimax_qr_property_choices($1)',[business]),/permission/);await db.exec('reset role');}
 console.log('PASS '+checks+' office and fixed-unit QR SQL checks: saved address, grouped assignments, owner gates, unit/area validation, replay rejection, notification, approval-only Queue location, manager permissions, replacement, fixture hiding, private helpers. Synthetic local database only.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

