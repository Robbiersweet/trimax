-- Editable job sessions and temporary crew.
-- Adds person-hour support without rewriting historical elapsed-time records.

create or replace function public.trimax_has_business_role(
  target_business_id uuid,
  allowed_roles text[]
)
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
      and lower(coalesce(bu.role, '')) = any(allowed_roles)
  );
$$;

alter table public.job_sessions
  add column if not exists crew_mode text not null default 'simple',
  add column if not exists crew_count integer not null default 1,
  add column if not exists crew_confirmed boolean not null default false,
  add column if not exists crew_details jsonb not null default '[]'::jsonb,
  add column if not exists labor_minutes integer;

alter table public.job_sessions
  drop constraint if exists job_sessions_crew_mode_check,
  add constraint job_sessions_crew_mode_check
    check (crew_mode in ('simple', 'detailed'));

alter table public.job_sessions
  drop constraint if exists job_sessions_crew_count_check,
  add constraint job_sessions_crew_count_check
    check (crew_count between 1 and 50);

alter table public.job_sessions
  drop constraint if exists job_sessions_labor_minutes_check,
  add constraint job_sessions_labor_minutes_check
    check (labor_minutes is null or labor_minutes >= 0);

alter table public.job_session_breakdowns
  drop constraint if exists job_session_breakdowns_work_type_check,
  add constraint job_session_breakdowns_work_type_check
    check (
      work_type in (
        'Prep',
        'Sprayer Repair',
        'Primer',
        'Cabinet Primer',
        'Door / Trim Primer',
        'Wall Spot Primer',
        'Baseboard Heater Primer',
        'Paint',
        'Cabinets',
        'Cabinet Paint',
        'Door / Trim Paint',
        'Cleaning',
        'Material Run',
        'Inspection',
        'Admin',
        'Touch Ups',
        'Other'
      )
    );

update public.job_sessions
set
  crew_mode = coalesce(crew_mode, 'simple'),
  crew_count = greatest(coalesce(crew_count, 1), 1),
  crew_confirmed = coalesce(crew_confirmed, false),
  crew_details = coalesce(crew_details, '[]'::jsonb),
  labor_minutes = coalesce(labor_minutes, total_minutes)
where true;

create or replace function public.set_job_session_totals()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.crew_count = greatest(coalesce(new.crew_count, 1), 1);
  new.crew_mode = coalesce(new.crew_mode, 'simple');
  new.crew_details = coalesce(new.crew_details, '[]'::jsonb);
  new.crew_confirmed = coalesce(new.crew_confirmed, false);

  if new.ended_at is null then
    new.total_minutes = null;
    new.labor_minutes = null;
  else
    new.total_minutes = greatest(
      0,
      round(extract(epoch from (new.ended_at - new.started_at)) / 60)::integer
    );

    if new.labor_minutes is null then
      new.labor_minutes = new.total_minutes * new.crew_count;
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists "Allow business job session update"
  on public.job_sessions;

create policy "Allow business job session update"
on public.job_sessions
for update
to authenticated
using (
  public.trimax_has_business_access(business_id)
  and (
    user_id = auth.uid()
    or public.trimax_has_business_role(business_id, array['owner', 'admin'])
  )
)
with check (
  public.trimax_has_business_access(business_id)
  and (
    user_id = auth.uid()
    or public.trimax_has_business_role(business_id, array['owner', 'admin'])
  )
);

drop policy if exists "Allow business job breakdown update"
  on public.job_session_breakdowns;
drop policy if exists "Allow business job breakdown delete"
  on public.job_session_breakdowns;

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
      and (
        js.user_id = auth.uid()
        or public.trimax_has_business_role(js.business_id, array['owner', 'admin'])
      )
  )
)
with check (
  public.trimax_has_business_access(business_id)
  and exists (
    select 1
    from public.job_sessions js
    where js.id = job_session_breakdowns.job_session_id
      and js.business_id = job_session_breakdowns.business_id
      and (
        js.user_id = auth.uid()
        or public.trimax_has_business_role(js.business_id, array['owner', 'admin'])
      )
  )
);

create policy "Allow business job breakdown delete"
on public.job_session_breakdowns
for delete
to authenticated
using (
  public.trimax_has_business_access(business_id)
  and exists (
    select 1
    from public.job_sessions js
    where js.id = job_session_breakdowns.job_session_id
      and js.business_id = job_session_breakdowns.business_id
      and (
        js.user_id = auth.uid()
        or public.trimax_has_business_role(js.business_id, array['owner', 'admin'])
      )
  )
);
