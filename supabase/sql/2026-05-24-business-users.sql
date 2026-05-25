create table if not exists business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id),
  unique (business_id, email)
);

create index if not exists business_users_user_id_idx
on business_users(user_id);

create index if not exists business_users_email_idx
on business_users(lower(email));

alter table business_users enable row level security;

drop policy if exists "Allow authenticated business users read" on business_users;
drop policy if exists "Allow authenticated business users manage during development" on business_users;

create policy "Allow authenticated business users read"
on business_users
for select
to authenticated
using (auth.uid() = user_id);

create policy "Allow authenticated business users manage during development"
on business_users
for all
to authenticated
using (true)
with check (true);

