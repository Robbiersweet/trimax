/* eslint-disable @typescript-eslint/no-require-imports -- Local PostgreSQL candidate invariant tests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();let count=0;const ok=async sql=>{await db.exec(sql);count++;},deny=async sql=>{await assert.rejects(db.exec(sql));count++;};try{
await db.exec(`create role anon;create role authenticated;create role restricted_extra;alter default privileges grant all on tables to anon,restricted_extra;alter default privileges grant execute on functions to restricted_extra;
create table queue_items(id text primary key,business_id uuid not null,status text,completed_date date);
create table job_sessions(id text primary key,business_id uuid not null,queue_item_id text,started_at timestamptz default now(),ended_at timestamptz,notes text);
insert into queue_items values('historical','00000000-0000-0000-0000-000000000001','Completed',current_date);
insert into job_sessions(id,business_id,queue_item_id) values('historical-session','00000000-0000-0000-0000-000000000001','historical');`);
await db.exec(fs.readFileSync('supabase/migrations/20261026_atomic_job_completion.sql','utf8'));
const b="'00000000-0000-0000-0000-000000000001'",other="'00000000-0000-0000-0000-000000000002'";
await ok("update job_sessions set notes='repair note' where id='historical-session'");await ok("update queue_items set status=' Paid ' where id='historical'");await ok("update job_sessions set ended_at=now() where id='historical-session'");await deny("update job_sessions set ended_at=null where id='historical-session'");
await ok(`insert into queue_items values('open',${b},'Open',null),('other',${other},'Open',null)`);
await ok(`insert into job_sessions(id,business_id,queue_item_id) values('active',${b},'open')`);
await deny(`update queue_items set business_id=${other},status='Completed' where id='open'`);
await deny("update queue_items set id='moved' where id='open'");
await deny(`update queue_items set business_id=${other} where id='historical'`);
for(const status of ['Completed',' completed ','INVOICED','paid'])await deny(`update queue_items set status='${status}' where id='open'`);
await deny("update queue_items set completed_date=current_date where id='open'");
await deny(`insert into job_sessions(id,business_id,queue_item_id) values('wrong',${other},'open')`);
await deny("update job_sessions set queue_item_id='historical' where id='active'");
await ok("update job_sessions set ended_at=now() where id='active'");await ok("update queue_items set status=' Completed ' where id='open'");await deny(`insert into job_sessions(id,business_id,queue_item_id) values('late',${b},'open')`);
await ok('alter table queue_items add column progress_stage text');await ok(`insert into queue_items(id,business_id,status,progress_stage) values('optional',${b},'Open','Complete')`);await deny(`insert into job_sessions(id,business_id,queue_item_id) values('optional-session',${b},'optional')`);
await ok(`insert into job_sessions(id,business_id,queue_item_id) values('orphan',${b},'missing')`.replace("'missing'","null"));
// Terminal INSERT checks pre-existing historical orphan sessions without rewriting them.
await db.exec('alter table job_sessions disable trigger trimax_session_start_atomic');await db.exec(`insert into job_sessions(id,business_id,queue_item_id) values('preexisting',${b},'new-terminal')`);await db.exec('alter table job_sessions enable trigger trimax_session_start_atomic');await deny(`insert into queue_items(id,business_id,status) values('new-terminal',${b},'invoiced')`);
await db.exec(`insert into queue_items(id,business_id,status) values('mismatch',${b},'Open');alter table job_sessions disable trigger trimax_session_start_atomic;insert into job_sessions(id,business_id,queue_item_id) values('mismatch-active',${other},'mismatch');alter table job_sessions enable trigger trimax_session_start_atomic`);await deny("update queue_items set status='Completed' where id='mismatch'");
for(const role of ['anon','authenticated','restricted_extra']){const r=(await db.query(`select has_table_privilege($1,'trimax_queue_completion_mutex','SELECT') or has_table_privilege($1,'trimax_queue_completion_mutex','INSERT') or has_function_privilege($1,'trimax_guard_queue_completion_atomic()','EXECUTE') or has_function_privilege($1,'trimax_guard_session_start_atomic()','EXECUTE') leaked`,[role])).rows[0];assert.equal(r.leaked,false);count++;}
const before=(await db.query('select sum(version)::int n from trimax_queue_completion_mutex')).rows[0].n;await db.exec('begin');await db.exec(`insert into queue_items(id,business_id,status) values('rollback',${b},'Completed')`);await db.exec('rollback');assert.equal((await db.query('select sum(version)::int n from trimax_queue_completion_mutex')).rows[0].n,before);count++;
console.log('PASS '+count+' local atomic candidate cases; PGlite single connection does NOT establish concurrency acceptance');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
