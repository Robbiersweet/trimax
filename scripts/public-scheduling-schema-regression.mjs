import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const loadModule = createRequire(import.meta.url);
// Optional isolated test dependency; never loads credentials or a database URL.
const { PGlite } = loadModule(process.env.TRIMAX_PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid', true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.businesses(id uuid primary key);
      create table public.business_users(business_id uuid,user_id uuid,role text);
      grant select on public.business_users to authenticated;
      insert into businesses values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
      insert into business_users values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner'),('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','admin'),('11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','member');`);
    await db.exec(fs.readFileSync('supabase/migrations/20261009_public_scheduling_foundation.sql','utf8'));
    await db.exec(`insert into public_scheduling_settings(business_id,public_slug,display_name) values ('11111111-1111-1111-1111-111111111111','one','One'),('22222222-2222-2222-2222-222222222222','two','Two');
      insert into public_service_request_types(id,business_id,public_key,public_label,internal_label) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','repair','Repair','Repair');
      insert into public_service_requests(business_id,request_type_id,public_reference,idempotency_hash,payload_hash,customer_name,preferred_contact,service_address,description,flexibility,urgency,contact_consent_at) values ('11111111-1111-1111-1111-111111111111','dddddddd-dddd-dddd-dddd-dddddddddddd','TEST-1','key','payload','Test','email','Test address','Test request','flexible','routine',now());`);
    await db.exec('set role anon');
    for(const table of ['public_scheduling_settings','public_service_request_types','public_service_requests','public_request_activity']) await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    await assert.rejects(db.query("insert into public_scheduling_settings(business_id,public_slug,display_name) values(gen_random_uuid(),'bad','Bad')"),/permission denied/);
    await db.exec("reset role; set role authenticated; set test.uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'");
    assert.equal((await db.query('select * from public_scheduling_settings')).rows.length,1);
    assert.equal((await db.query('select * from public_service_requests')).rows.length,1);
    await assert.rejects(db.query("update public_service_requests set status='approved'"),/permission denied/);
    await db.exec("set test.uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'");
    assert.equal((await db.query('select * from public_scheduling_settings')).rows.length,1);
    assert.equal((await db.query('select * from public_service_requests')).rows.length,0);
    await db.exec("set test.uid='cccccccc-cccc-cccc-cccc-cccccccccccc'");
    assert.equal((await db.query('select * from public_scheduling_settings')).rows.length,0);
    assert.equal((await db.query('select * from public_service_requests')).rows.length,0);
    console.log('Public scheduling local SQL/RLS regression PASS');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
