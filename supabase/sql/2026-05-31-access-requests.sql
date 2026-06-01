create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  business_slug text not null,
  business_name text,
  requester_name text not null,
  requester_email text not null,
  company_or_property text,
  message text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'approved', 'declined')),
  reviewed_at timestamptz,
  reviewed_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_requests_business_status_idx
  on public.access_requests (business_id, status, created_at desc);

create index if not exists access_requests_email_idx
  on public.access_requests (lower(requester_email));

alter table public.access_requests enable row level security;

drop policy if exists "Allow authenticated access request read during development"
  on public.access_requests;

drop policy if exists "Allow authenticated access request manage during development"
  on public.access_requests;

create policy "Allow authenticated access request read during development"
  on public.access_requests
  for select
  to authenticated
  using (true);

create policy "Allow authenticated access request manage during development"
  on public.access_requests
  for all
  to authenticated
  using (true)
  with check (true);
