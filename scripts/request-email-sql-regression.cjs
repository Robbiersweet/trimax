/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
try{
 const source=fs.readFileSync('scripts/service-workflow-sql-regression.cjs','utf8');await db.exec(source.split('`')[1]);
 for(const name of ['20261009_public_scheduling_foundation.sql','20261010_public_scheduling_phase2.sql','20261017_scheduling_owner_notifications.sql','20261018_service_request_workflow.sql','20261018_service_request_delivery.sql','20261018_request_urgency.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec(`create table estimates(id uuid,business_id uuid,client_id uuid,status text,estimate_amount numeric);create table invoices(id uuid,business_id uuid,client_id uuid,status text,amount_paid numeric);create table activity_logs(id uuid default gen_random_uuid(),business_id uuid,entity_id uuid,action text,details jsonb);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261025_communications.sql','utf8'));
 const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,b=uid(1),other=uid(2),owner=uid(3),outsider=uid(4),request=uid(5),type=uid(6),phone='+14255550100';
 await db.query('insert into businesses values($1),($2)',[b,other]);await db.query('insert into auth.users values($1),($2)',[owner,outsider]);await db.query("insert into business_users values($1,$2,'owner'),($3,$4,'owner')",[b,owner,other,outsider]);
 await db.query("insert into public_scheduling_settings(business_id,public_slug,display_name) values($1,'test','Synthetic')",[b]);await db.query("insert into public_service_request_types(id,business_id,public_key,public_label,internal_label) values($1,$2,'repair','Repair','Repair')",[type,b]);
 await db.query(`insert into public_service_requests(id,business_id,request_type_id,public_reference,idempotency_hash,payload_hash,customer_name,phone,email,preferred_contact,service_address,description,flexibility,urgency,contact_consent_at,sms_consent_at,sms_consent_version,sms_consent_source) values($1,$2,$3,'REQ-test',repeat('a',64),repeat('b',64),'Synthetic',$4,'x@example.invalid','sms','Synthetic','Repair','flexible','routine',now(),now(),'transactional-sms-2026-10-25','public-web')`,[request,b,type,phone]);


 await db.exec(fs.readFileSync('supabase/migrations/20261025_request_email_acceptance.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261025_request_email_webhooks.sql','utf8'));
 await db.query("insert into public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,consent_reference,idempotency_key) values($1,$2,'request_received','email','customer','synthetic@example.invalid','request_received','{}','synthetic','email-synthetic')",[b,request]);
 const m=(await db.query("select * from trimax_claim_request_email()")).rows[0];assert.ok(m);checks++;
 eq((await db.query("select trimax_finish_request_email($1,$2,null,'email_obsolete') ok",[m.id,uid(99)])).rows[0].ok,false);
 eq((await db.query("select trimax_finish_request_email($1,$2,null,'email_obsolete') ok",[m.id,m.lease_token])).rows[0].ok,true);
 eq((await db.query('select status from public_scheduling_outbox where id=$1',[m.id])).rows[0].status,'dead_letter');
 eq((await db.query("select * from trimax_claim_request_email()")).rows.length,0);
 for(const role of ['anon','authenticated','trimax_scheduling_web','trimax_scheduling_intake'])eq((await db.query("select has_function_privilege($1,'trimax_finish_request_email(uuid,uuid,text,text)','execute') yes",[role])).rows[0].yes,false);
 await db.query("insert into public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,consent_reference,idempotency_key) values($1,$2,'request_received','email','customer','synthetic@example.invalid','request_received','{}','synthetic','email-synthetic-2')",[b,request]);
 const retry=(await db.query("select * from trimax_claim_request_email()")).rows[0];
 eq((await db.query("select trimax_finish_request_email($1,$2,null,'email_rate_limited') ok",[retry.id,retry.lease_token])).rows[0].ok,true);eq((await db.query('select status from public_scheduling_outbox where id=$1',[retry.id])).rows[0].status,'retry');
 await db.query("update public_scheduling_outbox set email_first_attempt_at=now()-interval '24 hours',next_attempt_at=now() where id=$1",[retry.id]);eq((await db.query('select * from trimax_claim_request_email()')).rows.length,0);eq((await db.query('select last_error_code from public_scheduling_outbox where id=$1',[retry.id])).rows[0].last_error_code,'email_idempotency_window_expired');
 const queue=uid(80);await db.query("insert into queue_items(id,business_id,property,unit,appointment_start,appointment_end) values($1,$2,'Synthetic','1',now()+interval '3 days',now()+interval '3 days 1 hour')",[queue,b]);await db.query('update public_service_requests set queue_item_id=$1 where id=$2',[queue,request]);
 await db.query("insert into public_request_activity(business_id,request_id,event_type,details) values($1,$2,'appointment_scheduled','{}')",[b,request]);eq((await db.query("select count(*)::int n from public_scheduling_outbox where channel='email' and event_type like 'reminder_%' and status='pending'")).rows[0].n,2);
 await db.query("update queue_items set appointment_start=null,appointment_end=null where id=$1",[queue]);await db.query("insert into public_request_activity(business_id,request_id,event_type,details) values($1,$2,'appointment_cancelled','{}')",[b,request]);eq((await db.query("select count(*)::int n from public_scheduling_outbox where channel='email' and event_type like 'reminder_%' and status='pending'")).rows[0].n,0);
 await db.query("update public_scheduling_outbox set provider_message_id='provider-test',status='delivered' where id=$1",[m.id]);
 const status=async(event,state,business=b,recipient='synthetic@example.invalid')=>db.query('select trimax_request_email_status($1,$2,$3,$4,$5) ok',[business,event,'provider-test',recipient,state]);
 eq((await status('evt1','email.delivered')).rows[0].ok,true);eq((await status('evt1','email.delivered')).rows[0].ok,false);
 await assert.rejects(()=>status('evt2','email.bounced',other));checks++;await assert.rejects(()=>status('evt2','email.bounced',b,'wrong@example.invalid'));checks++;
 eq((await status('evt2','email.bounced')).rows[0].ok,true);await status('evt3','email.delivered');eq((await db.query('select email_delivery_status from public_scheduling_outbox where id=$1',[m.id])).rows[0].email_delivery_status,'email.bounced');eq((await db.query('select count(*)::int n from request_email_suppressions')).rows[0].n,1);
 console.log(JSON.stringify({status:'PASS',checks,scope:'isolated email lease CAS, stale suppression and retries; no messages'}));
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
