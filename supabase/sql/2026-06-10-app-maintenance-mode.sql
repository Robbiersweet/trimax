-- Maintenance Mode settings for Trimax.
-- This creates a small global settings table and seeds the maintenance flags.

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values
  ('maintenance_mode', 'false'::jsonb),
  (
    'maintenance_message',
    to_jsonb('Trimax is being updated. Please save your work and check back in a few minutes.'::text)
  )
on conflict (key) do nothing;

drop policy if exists "Allow authenticated app settings read" on public.app_settings;
drop policy if exists "Allow owner admin app settings update" on public.app_settings;
drop policy if exists "Allow owner admin app settings insert" on public.app_settings;

create policy "Allow authenticated app settings read"
on public.app_settings
for select
to authenticated
using (true);

create policy "Allow owner admin app settings update"
on public.app_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.business_users bu
    where
      (
        bu.user_id = auth.uid()
        or lower(bu.email) = lower(auth.jwt() ->> 'email')
      )
      and bu.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.business_users bu
    where
      (
        bu.user_id = auth.uid()
        or lower(bu.email) = lower(auth.jwt() ->> 'email')
      )
      and bu.role in ('owner', 'admin')
  )
);

create policy "Allow owner admin app settings insert"
on public.app_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.business_users bu
    where
      (
        bu.user_id = auth.uid()
        or lower(bu.email) = lower(auth.jwt() ->> 'email')
      )
      and bu.role in ('owner', 'admin')
  )
);
