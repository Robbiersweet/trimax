-- Job Sessions Phase 1.
-- Tracks real labor time per property/unit/job with optional same-day breakdowns.
-- No GPS, no AI, no automatic clock-in.

create or replace function public.trimax_current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.trimax_has_business_access(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and (
        bu.user_id = auth.uid()
        or lower(bu.email) = public.trimax_current_user_email()
      )
  );
$$;

create table if not exists public.job_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  property_id uuid references public.properties(id) on delete set null,
  property_name text,
  unit_id uuid references public.property_units(id) on delete set null,
  unit_label text,
  queue_item_id uuid references public.queue_items(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  job_type text not null default 'General',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_minutes integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_sessions_time_order_check
    check (ended_at is null or ended_at >= started_at),
  constraint job_sessions_total_minutes_check
    check (total_minutes is null or total_minutes >= 0)
);

create table if not exists public.job_session_breakdowns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_session_id uuid not null references public.job_sessions(id) on delete cascade,
  work_type text not null check (
    work_type in (
      'Prep',
      'Paint',
      'Cabinets',
      'Cleaning',
      'Material Run',
      'Inspection',
      'Admin',
      'Touch Ups',
      'Other'
    )
  ),
  minutes integer not null check (minutes >= 0),
  percentage numeric,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.set_job_session_totals()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.ended_at is null then
    new.total_minutes = null;
  else
    new.total_minutes = greatest(
      0,
      round(extract(epoch from (new.ended_at - new.started_at)) / 60)::integer
    );
  end if;

  return new;
end;
$$;

drop trigger if exists set_job_sessions_totals on public.job_sessions;

create trigger set_job_sessions_totals
before insert or update on public.job_sessions
for each row
execute function public.set_job_session_totals();

create unique index if not exists job_sessions_one_active_per_user_idx
  on public.job_sessions (business_id, user_id)
  where ended_at is null;

create index if not exists job_sessions_business_started_idx
  on public.job_sessions (business_id, started_at desc);

create index if not exists job_sessions_queue_item_idx
  on public.job_sessions (business_id, queue_item_id, started_at desc);

create index if not exists job_sessions_invoice_idx
  on public.job_sessions (business_id, invoice_id);

create index if not exists job_session_breakdowns_session_idx
  on public.job_session_breakdowns (business_id, job_session_id);

alter table public.job_sessions enable row level security;
alter table public.job_session_breakdowns enable row level security;

drop policy if exists "Allow business job session read"
  on public.job_sessions;
drop policy if exists "Allow business job session insert"
  on public.job_sessions;
drop policy if exists "Allow business job session update"
  on public.job_sessions;

create policy "Allow business job session read"
on public.job_sessions
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business job session insert"
on public.job_sessions
for insert
to authenticated
with check (
  public.trimax_has_business_access(business_id)
  and user_id = auth.uid()
);

create policy "Allow business job session update"
on public.job_sessions
for update
to authenticated
using (
  public.trimax_has_business_access(business_id)
  and user_id = auth.uid()
)
with check (
  public.trimax_has_business_access(business_id)
  and user_id = auth.uid()
);

drop policy if exists "Allow business job breakdown read"
  on public.job_session_breakdowns;
drop policy if exists "Allow business job breakdown insert"
  on public.job_session_breakdowns;
drop policy if exists "Allow business job breakdown update"
  on public.job_session_breakdowns;

create policy "Allow business job breakdown read"
on public.job_session_breakdowns
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business job breakdown insert"
on public.job_session_breakdowns
for insert
to authenticated
with check (
  public.trimax_has_business_access(business_id)
  and exists (
    select 1
    from public.job_sessions js
    where js.id = job_session_breakdowns.job_session_id
      and js.business_id = job_session_breakdowns.business_id
  )
);

create policy "Allow business job breakdown update"
on public.job_session_breakdowns
for update
to authenticated
using (
  public.trimax_has_business_access(business_id)
  and exists (
    select 1
    from public.job_sessions js
    where js.id = job_session_breakdowns.job_session_id
      and js.business_id = job_session_breakdowns.business_id
      and js.user_id = auth.uid()
  )
)
with check (
  public.trimax_has_business_access(business_id)
  and exists (
    select 1
    from public.job_sessions js
    where js.id = job_session_breakdowns.job_session_id
      and js.business_id = job_session_breakdowns.business_id
      and js.user_id = auth.uid()
  )
);
