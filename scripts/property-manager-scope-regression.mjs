import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.TRIMAX_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const business = '11111111-1111-1111-1111-111111111111';
const otherBusiness = '22222222-2222-2222-2222-222222222222';
const manager = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const owner = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('fixture.uid', true), '')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as
      $$select jsonb_build_object('email', current_setting('fixture.email', true))$$;
    create table business_users (business_id uuid, user_id uuid, email text, role text);
    create table property_users (
      business_id uuid, user_id uuid, email text, property_name text,
      can_update_queue_items boolean, can_create_queue_items boolean,
      id uuid default gen_random_uuid()
    );
    create table queue_items (id text primary key, business_id uuid, property text);
    alter table queue_items add column completed_date date, add column scheduled_date date,
      add column appointment_start timestamptz, add column appointment_end timestamptz;
    create table public_scheduling_settings (business_id uuid, time_zone text, appointment_windows jsonb);
    create table properties (business_id uuid, name text);
    create table public_service_requests (
      business_id uuid, property_assignment_id uuid, time_window_id text,
      preferred_date date, status text, public_reference text
    );
    create table private_payment_media (id text, business_id uuid);
    create table push_subscriptions (id text, business_id uuid, user_id uuid);
    create table access_requests (business_id uuid);
    create table import_batches (business_id uuid);
    create table import_rows (business_id uuid);
    create table unit_history (business_id uuid);
    insert into push_subscriptions values ('own', '${business}', '${manager}'), ('owner', '${business}', '${owner}');
    insert into import_rows values ('${business}'), ('${otherBusiness}');
    insert into unit_history values ('${business}');

    insert into business_users values
      ('${business}', '${manager}', 'manager@example.test', 'property_manager'),
      ('${business}', '${owner}', 'owner@example.test', 'owner');
    insert into property_users (business_id,user_id,email,property_name,can_update_queue_items,can_create_queue_items) values
      ('${business}', '${manager}', 'manager@example.test', 'The Glen', false, false);
    insert into queue_items (id,business_id,property) values
      ('glen', '${business}', 'The Glen'),
      ('north', '${business}', 'North Creek Apartments'),
      ('other-workspace', '${otherBusiness}', 'The Glen');
    update queue_items set appointment_start=date_trunc('day', now())+interval '14 hours',
      appointment_end=date_trunc('day', now())+interval '15 hours' where id in ('north','other-workspace');
    insert into properties values ('${business}', 'North Creek Apartments');
    insert into public_scheduling_settings values ('${business}', 'UTC', '[]');
    insert into private_payment_media values ('restricted', '${business}');
  `);
  const baseline = fs.readFileSync('supabase/sql/2026-08-10-tenant-isolation-hardening.sql', 'utf8');
  const start = baseline.indexOf('create or replace function');
  const end = baseline.indexOf('$$;', baseline.indexOf('function public.trimax_can_create_property_queue')) + 3;
  await db.exec(baseline.slice(start, end));
  await db.exec(`
    alter table queue_items enable row level security;
    alter table private_payment_media enable row level security;
    grant select, insert, update on queue_items to authenticated;
    grant select on private_payment_media to authenticated;
    create policy queue_read on queue_items for select to authenticated
      using (trimax_can_access_property(business_id, property));
    create policy queue_insert on queue_items for insert to authenticated
      with check (trimax_can_create_property_queue(business_id, property));
    create policy queue_update on queue_items for update to authenticated
      using (trimax_can_manage_property_queue(business_id, property))
      with check (trimax_can_manage_property_queue(business_id, property));
    create policy media_read on private_payment_media for select to authenticated
      using (trimax_has_business_access(business_id));
  `);
  for (const table of ['push_subscriptions', 'access_requests', 'import_batches', 'import_rows', 'unit_history']) {
    await db.exec(`
      alter table ${table} enable row level security;
      grant select, insert, update, delete on ${table} to authenticated;
      create policy legacy on ${table} for all to authenticated using (true) with check (true);
    `);
  }
  const login = async (id, email) => {
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('fixture.uid', $1, false), set_config('fixture.email', $2, false)", [id, email]);
  };
  const visibleQueue = async () => (await db.query('select id from queue_items order by id')).rows.map(row => row.id);
  await login(manager, 'manager@example.test');
  assert.deepEqual(await visibleQueue(), ['glen', 'north'], 'Reproduce the unscoped legacy role');
  assert.equal((await db.query('select count(*) as n from private_payment_media')).rows[0].n, 1);

  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/migrations/20261112_property_manager_scope.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261111_manager_availability.sql', 'utf8'));
  const assignmentId = (await db.query("select id from property_users where property_name='The Glen'")).rows[0].id;
  await login(manager, 'manager@example.test');
  assert.deepEqual(await visibleQueue(), ['glen']);
  const slots = (await db.query("select * from trimax_manager_availability($1, current_date, null)", [assignmentId])).rows;
  assert.equal(slots.length, 1);
  assert.equal(slots[0].property, 'North Creek Apartments');
  assert.deepEqual(Object.keys(slots[0]).sort(), ['conflicts', 'ends_at', 'property', 'starts_at', 'state']);
  await assert.rejects(db.query("select * from trimax_manager_availability($1, current_date, null)", [otherBusiness]), /Not authorized/);
  assert.equal((await db.query('select count(*) as n from private_payment_media')).rows[0].n, 0);
  assert.deepEqual((await db.query('select id from push_subscriptions')).rows.map(row => row.id), []);
  await assert.rejects(db.query('insert into push_subscriptions values ($1,$2,$3)', ['new', business, manager]), /row-level security/);
  for (const table of ['import_rows', 'unit_history']) {
    assert.equal((await db.query(`select count(*) as n from ${table}`)).rows[0].n, 0);
    await assert.rejects(db.query(`insert into ${table} values ($1)`, [business]), /row-level security/);
  }
  assert.equal((await db.query("update queue_items set property='North Creek Apartments' where id='glen'")).affectedRows, 0);
  await assert.rejects(db.query('insert into queue_items values ($1,$2,$3)', ['new', business, 'The Glen']), /row-level security/);

  await login(owner, 'owner@example.test');
  assert.deepEqual(await visibleQueue(), ['glen', 'north']);
  assert.equal((await db.query('select count(*) as n from private_payment_media')).rows[0].n, 1);
  console.log('PASS property-manager Queue isolation, write flags, private media denial and owner continuity');
} finally {
  await db.close();
}
