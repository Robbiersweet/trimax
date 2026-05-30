create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  business_slug text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_business_idx
  on public.push_subscriptions (business_id, status);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Allow authenticated push subscription read during development"
  on public.push_subscriptions;

drop policy if exists "Allow authenticated push subscription manage during development"
  on public.push_subscriptions;

create policy "Allow authenticated push subscription read during development"
  on public.push_subscriptions
  for select
  to authenticated
  using (true);

create policy "Allow authenticated push subscription manage during development"
  on public.push_subscriptions
  for all
  to authenticated
  using (true)
  with check (true);
