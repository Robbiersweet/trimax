/* eslint-disable @typescript-eslint/no-require-imports -- Disposable catalog projection; no production credentials or writes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
module.exports=async function projectUpgrade(db,parts,base){
 const baseline='885d01f18b1811de7f2be8fe33ec9d8858056d20';
 const historical=file=>execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8',maxBuffer:20*1024*1024});
 const fingerprints=async()=>{const rows=(await db.query(parts+' select * from parts')).rows;return Object.fromEntries(Object.entries(Object.groupBy(rows,r=>r.kind)).map(([kind,items])=>{items.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));return [kind,{entries:items.length,sha256:crypto.createHash('sha256').update(items.map(x=>x.name+'='+x.value).join('\r\n')).digest('hex')}];}));};
 // Reproduce the already deployed OCR lifecycle migration, not a candidate substitute.
 await db.exec(historical('supabase/sql/2026-10-23-ocr-job-lifecycle.sql').replace(/\r?\n/g,'\r\n'));
 const before=await fingerprints(),expected=JSON.parse(historical('release/trimax-release-manifest.json')).database.fingerprints;
 const directory=path.join(base,'workflow-upgrade-20261025');fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'baseline.json'),JSON.stringify({baseline,before,expected},null,2));
 assert.deepEqual(before,expected,'Exact current production 885d01f database must reproduce before candidate migrations');
 console.log('PASS exact 885d01f production schema fingerprints');
 const anonymousBefore={rpc:(await db.query("select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE') order by 1")).rows.map(r=>r.name),tables:(await db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v') and has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') order by 1")).rows.map(r=>r.relname)};
 const migrations=['20261025_workflow_experience.sql','20261025_property_request_intake.sql','20261025_property_request_access.sql','20261025_communications.sql','20261025_service_request_consent_intake.sql','20261025_sms_queue.sql','20261025_customer_reply.sql'];
 const receipts=[];
 for(const name of migrations){const file=name==='20261025_communications.sql'&&process.env.TRIMAX_COMMUNICATIONS_CANDIDATE?process.env.TRIMAX_COMMUNICATIONS_CANDIDATE:path.join('supabase/migrations',name);const text=fs.readFileSync(file,'utf8').replace(/\r?\n/g,'\r\n');await db.exec(text);receipts.push({name,sha256:crypto.createHash('sha256').update(text).digest('hex')});}
 const scope={};
 for(const role of ['trimax_scheduling_web','trimax_scheduling_intake','anon']){
  const rpc=(await db.query("select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege($1,p.oid,'EXECUTE') order by 1",[role])).rows.map(r=>r.name);
  const tables=(await db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v') and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') order by 1",[role])).rows.map(r=>r.relname);
  scope[role]={rpc,tables};
  if(role==='trimax_scheduling_web')assert.deepEqual(rpc,['trimax_public_scheduling_config(text)','trimax_submit_public_service_request(text,jsonb,text,text)'],'Restricted website receives only existing two RPCs');
  if(role==='trimax_scheduling_intake')assert.deepEqual(rpc,['trimax_public_request_status(text,text)','trimax_public_scheduling_config(text)','trimax_submit_public_service_request(text,jsonb,text,text)'],'Legacy intake scope unchanged');
  if(role!=='anon')assert.deepEqual(tables,[],'Restricted website/intake cannot access tables');
  if(role==='anon')assert.deepEqual({rpc,tables},anonymousBefore,'Anonymous effective RPC and table scope must remain exactly unchanged');
 }
 // Invoke candidate triggers against the exact production table constraints, then roll back all fixtures.
 await db.exec('begin');
 try{
  const id=n=>`99999999-9999-4999-8999-${String(n).padStart(12,'0')}`;
  await db.query("insert into businesses(id,name,slug) values($1,'Synthetic catalog verification','catalog-verification')",[id(1)]);
  await db.query('insert into auth.users(id) values($1)',[id(2)]);
  await db.query("insert into business_users(business_id,user_id,role,email) values($1,$2,'owner','catalog@example.invalid')",[id(1),id(2)]);
  await db.query("insert into public_scheduling_settings(business_id,public_slug,display_name,enabled) values($1,'catalog-verification','Synthetic catalog verification',true)",[id(1)]);
  await db.query("insert into public_service_request_types(business_id,public_key,public_label,internal_label) values($1,'repair','Repair','Repair')",[id(1)]);
  const payload={requestTypeId:'repair',customerName:'Synthetic catalog customer',phone:'+14255550149',email:'catalog@example.invalid',preferredContact:'sms',address:'Synthetic address',description:'Catalog validation only',preferredDate:'',timeWindowId:'',flexibility:'flexible',urgency:'routine',notes:'',consent:true,smsConsent:true,smsDisclosureVersion:'transactional-sms-2026-10-25'};
  await db.exec('set role trimax_scheduling_web');
  const receipt=(await db.query('select trimax_submit_public_service_request($1,$2,$3,$4) r',['catalog-verification',JSON.stringify(payload),'1'.repeat(64),'2'.repeat(64)])).rows[0].r;
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from communication_consent where business_id=$1',[id(1)])).rows[0].n,1,'Actual intake trigger records consent');
  await db.exec(`set role authenticated;set test.uid='${id(2)}'`);
  const linked=(await db.query("select trimax_service_request_workflow($1,1,'catalog-conversion-0001','approve_queue') r",[receipt.id])).rows[0].r;
  await db.exec('reset role');
  await db.query("insert into invoices(id,business_id,client_id,status,amount_paid) values($1,$2,$3,'sent',10)",[id(3),id(1),linked.clientId]);
  await db.query("insert into activity_logs(business_id,action,entity_type,entity_id,details) values($1,'invoice.email_sent','invoice',$2,$3)",[id(1),id(3),JSON.stringify({delivery_status:'sent'})]);
  await db.query("insert into activity_logs(business_id,action,entity_type,entity_id,details) values($1,'invoice.batch_payment_applied','invoice',$2,$3)",[id(1),id(3),JSON.stringify({amountApplied:10,resultingAmountPaid:10})]);
  const events=(await db.query('select event_type from communication_messages where business_id=$1',[id(1)])).rows.map(r=>r.event_type);
  assert.ok(events.includes('invoice_sent'),'Real invoice audit trigger creates milestone');assert.ok(events.includes('payment_received'),'Real recorded-payment audit creates milestone');
  await db.query('update queue_items set source_request_id=null where business_id=$1 and id=$2',[id(1),linked.queueItemId]);
  await db.query("update queue_items set appointment_start=now()+interval '3 days',appointment_end=now()+interval '3 days 1 hour' where business_id=$1 and id=$2",[id(1),linked.queueItemId]);
  assert.equal((await db.query("select count(*)::int n from communication_messages where business_id=$1 and queue_id=$2 and request_id is null and event_type='appointment_scheduled'",[id(1),linked.queueItemId])).rows[0].n,1,'Actual Queue schema and consent mapping enqueue exactly one appointment milestone');
  await db.query("update public_service_requests set status='needs_information' where id=$1",[receipt.id]);
  await db.query("insert into public_request_activity(business_id,request_id,event_type,details) values($1,$2,'review_updated',$3)",[id(1),receipt.id,JSON.stringify({fromStatus:'approved',toStatus:'needs_information'})]);
  const information=(await db.query("select id from communication_messages where business_id=$1 and request_id=$2 and event_type='needs_information'",[id(1),receipt.id])).rows;
  assert.equal(information.length,1,'Actual request activity produces information request');
  const capability='a'.repeat(64),replyKey='b'.repeat(64);
  await db.query("insert into communication_links(token_hash,business_id,message_id,expires_at) values($1,$2,$3,now()+interval '1 hour')",[capability,id(1),information[0].id]);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.trimax_customer_link_reply(text,text,text)','EXECUTE') allowed")).rows[0].allowed,false,'Customer capability RPC is not available to browser roles');
  await db.exec('set role service_role');
  const reply=async()=>(await db.query('select trimax_customer_link_reply($1,$2,$3) id',[capability,replyKey,'Synthetic additional information'])).rows[0].id;
  const replyId=await reply();assert.equal(await reply(),replyId,'Capability retry returns the exact original reply');
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from communication_owner_alerts where business_id=$1 and message_id=$2 and kind='customer_reply'",[id(1),replyId])).rows[0].n,1,'Exactly one reply owner alert');
  assert.equal((await db.query('select status from public_service_requests where id=$1',[receipt.id])).rows[0].status,'needs_information','Customer reply cannot approve or schedule');
  console.log('PASS actual-catalog opt-in, atomic conversion, document/Queue events and capability reply with idempotent owner alert; synthetic rows rolled back');
 }finally{await db.exec('reset role;rollback');}
 const candidate=await fingerprints();fs.writeFileSync(path.join(directory,'candidate.json'),JSON.stringify({baseline,transport:'CRLF',migrations:receipts,fingerprints:candidate,scope},null,2));
 console.log('PASS full-catalog candidate migrations and restricted role scope; projection saved privately');
};
if(require.main===module){
 process.argv.push('--workflow','--workflow-upgrade');
 require('./public-function-catalog-replay.cjs');
}
