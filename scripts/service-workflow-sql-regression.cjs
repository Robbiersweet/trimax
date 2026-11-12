/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role trimax_scheduling_web;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table businesses(id uuid primary key);create table business_users(business_id uuid,user_id uuid,role text);grant select on business_users to authenticated;
 create table clients(id uuid primary key default gen_random_uuid(),business_id uuid,created_by_user_id uuid,name text not null,contact_name text,email text,phone text,service_address text);
 create table push_subscriptions(id uuid primary key,business_id uuid,user_id uuid,status text);
 create table properties(id uuid primary key default gen_random_uuid(),business_id uuid,name text,unique(business_id,name));
 create table property_units(id uuid primary key,business_id uuid,property_id uuid,unit_label text);
 create table queue_items(id text primary key,business_id uuid,created_by_user_id uuid,property text not null,unit text not null,status text,priority text,notes text,scheduled_date date,completed_date date);`);
 for(const name of ['20261009_public_scheduling_foundation.sql','20261010_public_scheduling_phase2.sql','20261017_scheduling_owner_notifications.sql','20261018_service_request_workflow.sql','20261018_service_request_delivery.sql','20261018_request_urgency.sql','20261111_structured_service_request_conversion.sql','20261112_customer_schedule_email.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,business=uid(1),owner=uid(2),outsider=uid(3);
 await db.query('insert into businesses values($1),($2)',[business,uid(4)]);
 await db.query('insert into auth.users values($1),($2)',[owner,outsider]);
 await db.query("insert into business_users values($1,$2,'owner'),($3,$4,'owner')",[business,owner,uid(4),outsider]);
 await db.query("insert into public_scheduling_settings(business_id,public_slug,display_name,enabled) values($1,'test','Synthetic',true)",[business]);
 await db.query("insert into public_service_request_types(business_id,public_key,public_label,internal_label) values($1,'repair','Repair','Repair')",[business]);
 await db.query("insert into push_subscriptions values($1,$2,$3,'active'),($4,$5,$6,'active')",[uid(70),business,owner,uid(71),uid(4),outsider]);
 const payload={requestTypeId:'repair',customerName:'Synthetic Customer',phone:'5555550100',email:'synthetic@example.invalid',preferredContact:'email',address:'Synthetic address',description:'Synthetic repair',preferredDate:'',timeWindowId:'',flexibility:'flexible',urgency:'time_sensitive',notes:'Access note',consent:true};
 async function submit(n,extra={}){return (await db.query('select trimax_submit_public_service_request($1,$2,$3,$4) r',['test',JSON.stringify({...payload,...extra}),String(n).padStart(64,'0'),String(n+100).padStart(64,'0')])).rows[0].r;}
 await db.exec("create table property_users(id uuid primary key,business_id uuid,user_id uuid,property_name text); alter table public_service_requests add column property_assignment_id uuid;");
 await db.exec(fs.readFileSync('supabase/migrations/20261111_manager_availability.sql','utf8'));
 const first=await submit(1);eq((await submit(1)).id,first.id);eq((await db.query('select count(*)::int n from scheduling_owner_notifications')).rows[0].n,1);
 async function as(user,fn){await db.exec(`set role authenticated;set test.uid='${user}'`);try{return await fn();}finally{await db.exec('reset role');}}
 const manager=uid(90), otherManager=uid(91), managerAssignment=uid(92), otherAssignment=uid(93);
 await db.query("insert into business_users values($1,$2,'property_manager'),($1,$3,'property_manager')",[business,manager,otherManager]);
 await db.query("insert into property_users values($1,$2,$3,'Synthetic North'),($4,$2,$5,'Synthetic Glen')",[managerAssignment,business,manager,otherAssignment,otherManager]);
 await db.query("update public_scheduling_settings set appointment_windows=$2 where business_id=$1",[business,JSON.stringify([{id:'morning',start:'08:00',end:'12:00'}])]);
 await db.query("update public_service_requests set property_assignment_id=$2,preferred_date=current_date,time_window_id='morning' where id=$1",[first.id,otherAssignment]);
 const availability=(assignment)=>db.query("select * from trimax_manager_availability($1,current_date,'morning')",[assignment]);
 const pendingSlots=(await as(manager,()=>availability(managerAssignment))).rows;
 eq(pendingSlots.length,1);
 eq(pendingSlots[0].property,'Synthetic Glen');
 eq(pendingSlots[0].state,'pending');
 eq(pendingSlots[0].conflicts,true);
 await db.query("insert into queue_items(id,business_id,property,unit,notes,scheduled_date,appointment_start,appointment_end) values('calendar-test',$1,'Synthetic Glen','PRIVATE','PRIVATE',current_date,current_date+interval '17 hours',current_date+interval '18 hours'),('calendar-other',$2,'Other tenant','PRIVATE','PRIVATE',current_date,null,null)",[business,uid(4)]);
 const sharedSlots=(await as(manager,()=>availability(managerAssignment))).rows;
 eq(sharedSlots.map(row=>row.state).sort(),['confirmed','pending']);
 assert.doesNotMatch(JSON.stringify(sharedSlots),/PRIVATE|Other tenant/);checks++;
 await db.exec("delete from queue_items where id in ('calendar-test','calendar-other')");

 const claimEmail = (excluded = []) => db.query(
  'select * from public.trimax_claim_customer_schedule_email($1,$2::uuid[])',
  [business, excluded]
 );
 await assert.rejects(()=>as(owner,()=>claimEmail()),/permission denied/);checks++;
 await db.exec('set role service_role');
 try { eq((await claimEmail()).rows.length,0); } finally { await db.exec('reset role'); }
 await db.query("insert into trimax_scheduler.customer_email_activation values($1,'2000-01-01')",[business]);
 await db.exec('set role service_role');
 try {
  eq((await claimEmail([first.id])).rows.length,0);
  const claimed=(await claimEmail()).rows;
  eq(claimed.map(row=>row.event_type),['request_received']);
  eq(claimed[0].recipient,'synthetic@example.invalid');
  eq((await claimEmail()).rows.length,0);
 } finally { await db.exec('reset role'); }
 await db.query("update public_scheduling_outbox set status='pending', attempts=0, lease_token=null, lease_expires_at=null where request_id=$1 and channel='email'",[first.id]);
 eq(Object.keys(pendingSlots[0]).sort(),['conflicts','ends_at','property','starts_at','state']);
 await assert.rejects(()=>as(manager,()=>availability(otherAssignment)),/Not authorized/);checks++;
 await assert.rejects(()=>as(outsider,()=>availability(managerAssignment)),/Not authorized/);checks++;
 await db.query("update public_service_requests set preferred_date=null,time_window_id=null,property_assignment_id=null where id=$1",[first.id]);
 const property=uid(71),unit=uid(72),wrongProperty=uid(73),wrongUnit=uid(74);
 await db.query("insert into properties(id,business_id,name) values($1,$2,'Synthetic Glen'),($3,$4,'Other workspace')",[property,business,wrongProperty,uid(4)]);
 await db.query("insert into property_units values($1,$2,$3,'QA-07'),($4,$5,$6,'Other')",[unit,business,property,wrongUnit,uid(4),wrongProperty]);
 const call=(id,revision,action,key,client=null,start=null,minutes=null,reason=null,location=[property,unit,null,null,false])=>db.query('select trimax_service_request_workflow($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r',[id,revision,key,action,client,start,minutes,reason,...location]);
 const fail=async(fn,re)=>{await assert.rejects(fn,re);checks++};
 await fail(()=>as(outsider,()=>call(first.id,1,'convert','outsider-attempt-0001')),/Not authorized/);
 await fail(()=>as(owner,()=>call(first.id,1,'convert','unapproved-attempt-1')),/Approve/);
 await as(owner,()=>db.query('select trimax_review_public_service_request($1,1,$2,$3,$4)',[first.id,'approved','Synthetic internal note','approval-test-000001']));
 eq((await db.query('select count(*)::int n from queue_items')).rows[0].n,0);
 await fail(()=>as(owner,()=>call(first.id,2,'convert','wrong-property-test',null,null,null,null,[wrongProperty,wrongUnit,null,null,false])),/Select a property/);
 await fail(()=>as(owner,()=>call(first.id,2,'convert','wrong-unit-test-001',null,null,null,null,[property,wrongUnit,null,null,false])),/Choose the unit/);
 const conversion=(await as(owner,()=>call(first.id,2,'convert','conversion-test-0001'))).rows[0].r;
 eq((await as(owner,()=>call(first.id,2,'convert','conversion-test-0001'))).rows[0].r,conversion);
 await fail(()=>as(owner,()=>call(first.id,2,'schedule','conversion-test-0001',null,'2030-01-07T17:00:00Z',60)),/Mutation conflict/);
 await as(owner,()=>call(first.id,3,'convert','conversion-repeat-02'));
 eq((await db.query('select count(*)::int n from queue_items')).rows[0].n,1);eq((await db.query('select count(*)::int n from clients')).rows[0].n,1);
 const q=(await db.query('select * from queue_items')).rows[0];eq(q.property,"Synthetic Glen");eq(q.unit,"QA-07");assert.match(q.notes,/Submitted service address: Synthetic address/);checks++;assert.match(q.notes,/Synthetic repair/);assert.match(q.notes,/Preferred contact: email/);assert.match(q.notes,/Urgency: time_sensitive/);checks+=3;
 const second=await submit(2);await as(owner,()=>call(second.id,1,'approve_schedule','schedule-second-0001',null,'2030-01-07T17:00:00Z',60));
 eq((await db.query('select count(*)::int n from clients')).rows[0].n,1);
 await fail(()=>as(owner,()=>call(first.id,4,'schedule','schedule-conflict-01',null,'2030-01-07T17:30:00Z',60)),/Schedule conflict/);
 await as(owner,()=>call(first.id,4,'schedule','schedule-first-00001',null,'2030-01-07T18:00:00Z',60));
 eq((await db.query('select scheduled_date::text d from queue_items where id=$1',[q.id])).rows[0].d,'2030-01-07');
 await as(owner,()=>call(first.id,5,'schedule','reschedule-first-001',null,'2030-01-08T18:00:00Z',90));
 await as(owner,()=>call(first.id,6,'cancel_appointment','cancel-first-0000001'));
 await db.exec('set role service_role');
 try {
  const eligible=(await claimEmail()).rows;
  eq(eligible.filter(row=>row.event_type==='appointment_scheduled').map(row=>row.request_id),[second.id]);
  assert.ok(eligible.every(row=>['request_received','appointment_scheduled'].includes(row.event_type)));checks++;
 } finally { await db.exec('reset role'); }
 const cancelled=(await db.query('select * from queue_items where id=$1',[q.id])).rows[0];eq(cancelled.scheduled_date,null);eq(cancelled.completed_date,null);
 const history=(await db.query('select event_type from public_request_activity where request_id=$1',[first.id])).rows.map(r=>r.event_type);for(const event of ['client_created','queue_converted','appointment_scheduled','appointment_rescheduled','appointment_cancelled']){assert.ok(history.includes(event));checks++;}
 const third=await submit(3,{email:'other@example.invalid',phone:'5555550101'});
 await db.query('insert into clients(id,business_id,name) values($1,$2,$3)',[uid(50),uid(4),'Other workspace']);
 await fail(()=>as(owner,()=>call(third.id,1,'approve_schedule','foreign-client-0001',uid(50),'2030-01-09T18:00:00Z',60)),/Client is not/);
 eq((await db.query('select status from public_service_requests where id=$1',[third.id])).rows[0].status,'pending_confirmation');
 await as(owner,()=>call(third.id,1,'approve_schedule','new-client-00000001',null,'2030-01-09T18:00:00Z',60));
 eq((await db.query('select count(*)::int n from clients where business_id=$1',[business])).rows[0].n,2);
 await db.exec('set role anon');await fail(()=>call(first.id,7,'convert','anonymous-attempt-1'),/permission denied/);await db.exec('reset role');
 eq((await db.query("select count(*)::int n from public_scheduling_outbox where channel='push'")).rows[0].n,3);
 eq((await db.query("select count(*)::int n from public_scheduling_outbox where channel='push' and recipient=$1",[uid(71)])).rows[0].n,0);
 const messages=(await db.query("select * from public_scheduling_outbox where channel='email'")).rows;assert.ok(messages.some(m=>m.event_type==='approved'));assert.ok(messages.some(m=>m.event_type==='appointment_cancelled'));checks+=2;
 for(const m of messages){assert.ok(m.consent_reference);assert.ok(!JSON.stringify(m.parameters).includes('Synthetic internal note'));checks+=2;}
 await db.exec('set role authenticated');await fail(()=>db.query("select * from trimax_claim_request_delivery('push')"),/permission denied/);await db.exec('reset role;set role service_role');
 const batch=(await db.query("select * from trimax_claim_request_delivery('push')")).rows;eq(batch.length,3);eq((await db.query("select * from trimax_claim_request_delivery('push')")).rows.length,0);
 eq((await db.query('select trimax_finish_request_delivery($1,$2,$3,$4) ok',[batch[0].id,uid(99),'wrong-lease',null])).rows[0].ok,false);
 eq((await db.query('select trimax_finish_request_delivery($1,$2,$3,$4) ok',[batch[0].id,batch[0].lease_token,'accepted',null])).rows[0].ok,true);
 await db.query('select trimax_finish_request_delivery($1,$2,$3,$4)',[batch[1].id,batch[1].lease_token,null,'transient']);await db.exec('reset role');
 eq((await db.query('select status from public_scheduling_outbox where id=$1',[batch[1].id])).rows[0].status,'retry');
 eq((await db.query('select count(*)::int n from scheduling_owner_notifications')).rows[0].n,3);
 await fail(()=>as(owner,()=>db.query('select trimax_review_public_service_request($1,2,$2,$3,$4)',[second.id,'rejected','','reject-booked-000001'])),/Cancel the appointment/);
 await db.query("update queue_items set scheduled_date='2030-01-10' where source_request_id=$1",[second.id]);
 eq((await db.query('select appointment_start from queue_items where source_request_id=$1',[second.id])).rows[0].appointment_start,null);
 eq((await db.query("select count(*)::int n from public_request_activity where request_id=$1 and event_type='appointment_time_cleared'",[second.id])).rows[0].n,1);
 eq((await db.query('select jsonb_array_length(delivery_history) n from public_scheduling_outbox where id=$1',[batch[1].id])).rows[0].n,1);
 await db.query("update public_scheduling_outbox set attempts=5,lease_expires_at=now()-interval '1 minute' where id=$1",[batch[2].id]);
 await db.exec("set role service_role;select * from trimax_claim_request_delivery('push');reset role");
 eq((await db.query('select status from public_scheduling_outbox where id=$1',[batch[2].id])).rows[0].status,'dead_letter');
 // Preference dates are not availability promises. These fixtures run after count assertions.
 const today=(await db.query("select (now() at time zone 'America/Los_Angeles')::date::text d")).rows[0].d;
 const future=(await db.query("select ((now() at time zone 'America/Los_Angeles')::date+400)::text d")).rows[0].d;
 for(const [n,date] of [[80,today],[81,future],[82,'2030-01-06']])eq((await submit(n,{preferredDate:date})).status,'pending_confirmation');
 await fail(()=>submit(83,{preferredDate:'2000-01-01'}),/Choose today/);
 const override=await submit(84);
 await as(owner,()=>call(override.id,1,'approve_schedule','override-test-000001',null,'2030-01-07T18:00:00Z',60));
 const overlap=await submit(85);
 await fail(()=>as(owner,()=>call(overlap.id,1,'approve_schedule','override-test-000002',null,'2030-01-07T18:30:00Z',60)),/Schedule conflict/);
 await as(owner,()=>call(overlap.id,1,'approve_schedule','override-test-000003',null,'2030-01-07T18:30:00Z',60,'Separate crew assigned'));
 eq((await db.query("select details->>'conflictReason' reason from public_request_activity where request_id=$1 and details ? 'conflictReason' order by created_at desc limit 1",[overlap.id])).rows[0].reason,'Separate crew assigned');
 const sameDay=await submit(86);
 const start=(await db.query("select now()+interval '1 minute' t")).rows[0].t;
 await as(owner,()=>call(sameDay.id,1,'approve_schedule','same-day-test-000001',null,start,15));
 eq((await db.query('select count(*)::int n from queue_items where source_request_id=$1 and appointment_start is not null',[sameDay.id])).rows[0].n,1);
 // Execute the scheduler SQL against disposable extension stand-ins; no HTTP call is made.
 await db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);insert into vault.decrypted_secrets values('trimax_service_request_cron_secret','synthetic-test-token-not-a-secret');create schema cron;create table cron.job(jobid bigint,jobname text,schedule text,active boolean,command text);create function cron.schedule(text,text,text) returns bigint language plpgsql as $body$begin insert into cron.job values(1,$1,$2,true,$3);return 1;end$body$;create schema net;create table net.calls(url text,headers jsonb);create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $body$begin insert into net.calls values(url,headers);return 1;end$body$;`);
 await db.exec(fs.readFileSync('supabase/sql/2026-10-18-service-request-scheduler.sql','utf8').replace(/^create extension[^\r\n]*[\r\n]*/gm,''));
 const command=(await db.query('select command from cron.job')).rows[0].command;
 await db.exec(command);eq((await db.query('select count(*)::int n from net.calls')).rows[0].n,1);
 await db.exec("update public_scheduling_outbox set status='delivered';truncate net.calls");await db.exec(command);eq((await db.query('select count(*)::int n from net.calls')).rows[0].n,0);
 await db.query("update public_scheduling_outbox set status='leased',lease_expires_at=now()-interval '1 minute' where id=$1",[batch[2].id]);await db.exec(command);eq((await db.query('select count(*)::int n from net.calls')).rows[0].n,1);
 console.log(JSON.stringify({result:'PASS',checks,scope:'isolated PostgreSQL; no production writes'}));
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
