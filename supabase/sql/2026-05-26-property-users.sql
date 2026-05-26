create table if not exists property_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  property_name text not null,
  role text not null default 'property_team',
  can_create_queue_items boolean not null default true,
  can_update_queue_items boolean not null default true,
  can_view_reports boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, email, property_name)
);

create index if not exists property_users_user_id_idx
on property_users(user_id);

create index if not exists property_users_email_idx
on property_users(lower(email));

create index if not exists property_users_business_property_idx
on property_users(business_id, lower(property_name));

alter table property_users enable row level security;

drop policy if exists "Allow authenticated property users read" on property_users;
drop policy if exists "Allow authenticated property users manage during development" on property_users;

create policy "Allow authenticated property users read"
on property_users
for select
to authenticated
using (
  auth.uid() = user_id
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "Allow authenticated property users manage during development"
on property_users
for all
to authenticated
using (true)
with check (true);

