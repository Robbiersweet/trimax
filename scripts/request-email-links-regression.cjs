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

 await db.exec(fs.readFileSync('supabase/migrations/20261025_request_email_links.sql','utf8'));
 await db.exec("update public_service_requests set status='needs_information',sms_consent_at=null,sms_consent_source=null,sms_consent_version=null;delete from communication_consent");
 await db.query("insert into public_request_activity(business_id,request_id,event_type,details) values($1,$2,'review_updated','{\"fromStatus\":\"reviewing\",\"toStatus\":\"needs_information\"}')",[b,request]);
 const m=(await db.query("select id from public_scheduling_outbox where event_type='needs_information' and channel='email'")).rows[0];assert.ok(m);checks++;
 const hash='a'.repeat(64),key='b'.repeat(64);await db.query("insert into request_email_links(token_hash,business_id,outbox_id,recipient,expires_at) values($1,$2,$3,'x@example.invalid',now()+interval '1 day')",[hash,b,m.id]);
 const reply=async(h=hash,k=key)=>db.query("select trimax_request_email_reply($1,$2,'Synthetic email-only reply') id",[h,k]);
 const first=(await reply()).rows[0].id;eq((await reply()).rows[0].id,first);eq((await db.query("select details->>'note' note from public_request_activity where id=$1",[first])).rows[0].note,'Synthetic email-only reply');eq((await db.query('select count(*)::int n from communication_consent')).rows[0].n,0);
 await assert.rejects(()=>reply(null));checks++;await assert.rejects(()=>reply(hash,null));checks++;
 await db.query('update request_email_links set business_id=$1',[other]);await assert.rejects(()=>reply());checks++;await db.query('update request_email_links set business_id=$1',[b]);
 await db.exec("update public_service_requests set email='changed@example.invalid'");await assert.rejects(()=>reply());checks++;await db.exec("update public_service_requests set email='x@example.invalid'");
 await db.exec("update request_email_links set revoked_at=now()");await assert.rejects(()=>reply());checks++;await db.exec("update request_email_links set revoked_at=null,expires_at=now()-interval '1 day'");await assert.rejects(()=>reply());checks++;await db.exec("update request_email_links set expires_at=now()+interval '1 day'");
 for(let i=0;i<4;i++)await reply(hash,String(i).repeat(64));await assert.rejects(()=>reply(hash,'f'.repeat(64)));checks++;
 await db.exec("update public_service_requests set status='approved'");await assert.rejects(()=>reply());checks++;
 for(const role of ['anon','authenticated','trimax_scheduling_web','trimax_scheduling_intake']){eq((await db.query("select has_function_privilege($1,'trimax_request_email_reply(text,text,text)','execute') yes",[role])).rows[0].yes,false);eq((await db.query("select has_table_privilege($1,'request_email_links','SELECT') yes",[role])).rows[0].yes,false);}
 console.log(JSON.stringify({status:'PASS',checks,scope:'isolated email-only capabilities/replies without SMS consent'}));
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
