const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();let checks=0;const check=(v)=>{assert.ok(v);checks++};
try{
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE trimax_scheduling_web;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.business_users(business_id uuid,user_id uuid,role text);GRANT SELECT ON public.business_users TO authenticated;
CREATE TABLE public.public_service_request_types(id uuid,business_id uuid,public_label text);
CREATE TABLE public.public_service_requests(id uuid primary key,business_id uuid,request_type_id uuid,customer_name text,submitted_at timestamptz default now(),unique(business_id,id));`);
await db.exec(fs.readFileSync('supabase/migrations/20261017_scheduling_owner_notifications.sql','utf8'));
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
for(let n=1;n<=4;n++)await db.query('INSERT INTO auth.users VALUES($1)',[uid(n)]);
await db.query(`INSERT INTO business_users VALUES($1,$2,'owner'),($1,$3,'admin'),($1,$4,'manager'),($5,$6,'owner')`,[uid(10),uid(1),uid(2),uid(3),uid(20),uid(4)]);
await db.query('INSERT INTO public_service_request_types VALUES($1,$2,$3)',[uid(11),uid(10),'Synthetic repair']);
async function insert(n){return db.query('INSERT INTO public_service_requests(id,business_id,request_type_id,customer_name) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[uid(n),uid(10),uid(11),'Synthetic Customer']);}
await insert(30);await insert(30);check((await db.query('SELECT * FROM scheduling_owner_notifications')).rows.length===2);
await db.exec('BEGIN');await insert(31);await db.exec('ROLLBACK');check((await db.query('SELECT * FROM scheduling_owner_notifications')).rows.length===2);
async function as(n,sql){await db.exec(`SET ROLE authenticated; SET test.uid='${uid(n)}'`);try{return await db.query(sql);}finally{await db.exec('RESET ROLE');}}
check((await as(1,'SELECT * FROM scheduling_owner_notifications')).rows.length===1);
check((await as(2,'SELECT * FROM scheduling_owner_notifications')).rows.length===1);
check((await as(3,'SELECT * FROM scheduling_owner_notifications')).rows.length===0);
check((await as(4,'SELECT * FROM scheduling_owner_notifications')).rows.length===0);
await as(1,'UPDATE scheduling_owner_notifications SET read_at=now()');
check((await as(1,'SELECT * FROM scheduling_owner_notifications WHERE read_at IS NULL')).rows.length===0);
check((await as(2,'SELECT * FROM scheduling_owner_notifications WHERE read_at IS NULL')).rows.length===1);
// New caller/session sees the durable read state.
check((await as(1,'SELECT read_at FROM scheduling_owner_notifications')).rows[0].read_at!==null);
for(const sql of ["UPDATE scheduling_owner_notifications SET recipient_id='"+uid(3)+"'",'DELETE FROM scheduling_owner_notifications',"INSERT INTO scheduling_owner_notifications(id) VALUES('"+uid(50)+"')"]){await assert.rejects(()=>as(1,sql));checks++;}
await db.query('DELETE FROM business_users WHERE user_id=$1',[uid(1)]);check((await as(1,'SELECT * FROM scheduling_owner_notifications')).rows.length===0);
for(const role of ['anon','trimax_scheduling_web','service_role']){check(!(await db.query(`SELECT has_table_privilege($1,'public.scheduling_owner_notifications','SELECT') ok`,[role])).rows[0].ok);}
for(const role of ['anon','authenticated','service_role','trimax_scheduling_web']){check(!(await db.query(`SELECT has_function_privilege($1,'public.trimax_notify_scheduling_owner()','EXECUTE') ok`,[role])).rows[0].ok);}
check((await db.query("SELECT relrowsecurity AND relforcerowsecurity ok FROM pg_class WHERE oid='public.scheduling_owner_notifications'::regclass")).rows[0].ok);
// Unexpected creator defaults must abort the entire migration, not be silently accepted.
const setup=fs.readFileSync(__filename,'utf8').split(String.fromCharCode(96))[1];
for(const grant of ['GRANT SELECT ON TABLES','GRANT EXECUTE ON FUNCTIONS']){
 const hostile=new PGlite();try{await hostile.exec(setup);await hostile.exec('CREATE ROLE unexpected_reader; ALTER DEFAULT PRIVILEGES '+grant+' TO unexpected_reader');await assert.rejects(()=>hostile.exec(fs.readFileSync('supabase/migrations/20261017_scheduling_owner_notifications.sql','utf8')),/Unexpected/);await hostile.exec('ROLLBACK');check((await hostile.query("SELECT to_regclass('public.scheduling_owner_notifications') value")).rows[0].value===null);}finally{await hostile.close();}
}
console.log(JSON.stringify({result:'PASS',checks,scope:'isolated local PostgreSQL engine; no hosted changes'}));
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
