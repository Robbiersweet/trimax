create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_business_created_idx
  on activity_logs (business_id, created_at desc);

create index if not exists activity_logs_action_idx
  on activity_logs (action);

alter table activity_logs enable row level security;

drop policy if exists "Allow authenticated activity read during development"
  on activity_logs;

drop policy if exists "Allow authenticated activity insert during development"
  on activity_logs;

drop policy if exists "Allow authenticated activity manage during development"
  on activity_logs;

create policy "Allow authenticated activity read during development"
  on activity_logs
  for select
  to authenticated
  using (true);

create policy "Allow authenticated activity insert during development"
  on activity_logs
  for insert
  to authenticated
  with check (true);

create policy "Allow authenticated activity manage during development"
  on activity_logs
  for update
  to authenticated
  using (true)
  with check (true);
