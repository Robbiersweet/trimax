/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest/node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table business_users(business_id uuid,user_id uuid,role text);create table clients(id uuid,business_id uuid);create table property_users(id uuid,business_id uuid,user_id uuid,request_client_id uuid,can_create_queue_items boolean);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261025_property_request_access.sql','utf8'));
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.query("insert into business_users values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'property_manager')",[id(1),id(2),id(3),id(4),id(5)]);
 await db.query('insert into clients values($1,$2),($3,$4)',[id(6),id(1),id(7),id(3)]);
 await db.query('insert into property_users values($1,$2,$3,null,false)',[id(8),id(1),id(5)]);
 async function call(actor,client,direct){await db.exec(`set role authenticated;set test.uid='${actor}'`);try{return await db.query('select trimax_set_property_request_access($1,$2,$3)',[id(8),client,direct]);}finally{await db.exec('reset role');}}
 await assert.rejects(()=>call(id(5),id(6),true),/Not authorized/);
 await assert.rejects(()=>call(id(4),id(6),true),/Not authorized/);
 await assert.rejects(()=>call(id(2),id(7),true),/same workspace/);
 await assert.rejects(()=>call(id(2),null,true),/requires a mapped client/);
 await call(id(2),id(6),true);
 assert.deepEqual((await db.query('select request_client_id,can_create_queue_items,user_id from property_users')).rows[0],{request_client_id:id(6),can_create_queue_items:true,user_id:id(5)});
 await call(id(2),id(6),false);
 assert.equal((await db.query('select can_create_queue_items from property_users')).rows[0].can_create_queue_items,false);
 await call(id(2),null,false);
 assert.equal((await db.query('select request_client_id from property_users')).rows[0].request_client_id,null);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select trimax_set_property_request_access($1,$2,true)',[id(8),id(6)]),/permission denied/);
 console.log('PASS 8 property request-access checks: owner scope, cross-business client denial, request-only, direct Queue, no account rebinding, anonymous denial');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
