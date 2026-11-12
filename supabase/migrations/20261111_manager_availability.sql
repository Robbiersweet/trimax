begin;

create function public.trimax_manager_availability(p_assignment_id uuid, p_day date, p_window text default null)
returns table(property text, state text, starts_at timestamptz, ends_at timestamptz, conflicts boolean)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare workspace uuid; zone text; windows jsonb; day_start timestamptz; day_end timestamptz; proposed_start timestamptz; proposed_end timestamptz;
begin
  select a.business_id,s.time_zone,s.appointment_windows into workspace,zone,windows
  from public.property_users a
  join public.business_users m on m.business_id=a.business_id and m.user_id=a.user_id
  join public.public_scheduling_settings s on s.business_id=a.business_id
  where a.id=p_assignment_id and a.user_id=auth.uid()
    and m.role in ('property_manager','owner','admin');
  if workspace is null then raise exception 'Not authorized'; end if;
  if p_day is null or not isfinite(p_day)
    or abs(p_day - (now() at time zone zone)::date) > 366 then
    raise exception 'Choose a date within one year';
  end if;
  day_start=p_day::timestamp at time zone zone;
  day_end=(p_day+1)::timestamp at time zone zone;

  select (p_day+(j.value->>'start')::time) at time zone zone,
         (p_day+(j.value->>'end')::time) at time zone zone
    into proposed_start,proposed_end
  from jsonb_array_elements(windows) j
  where j.value->>'id'=p_window
    and j.value->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and j.value->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and j.value->>'start' < j.value->>'end'
  limit 1;

  return query
  select slots.*, coalesce(slots.start_at < proposed_end and slots.end_at > proposed_start,false)
  from (
    select distinct coalesce(p.name,a.property_name,'Workspace commitment') as label,
      case when q.appointment_start is null then 'date_only' else 'confirmed' end as status,
      q.appointment_start as start_at,q.appointment_end as end_at
    from public.queue_items q
    left join public.properties p on p.business_id=q.business_id and p.name=q.property
    left join lateral (
      select pu.property_name from public.property_users pu
      where pu.business_id=q.business_id and pu.property_name=q.property limit 1
    ) a on true
    where q.business_id=workspace and q.completed_date is null
      and ((q.appointment_start<day_end and q.appointment_end>day_start)
        or (q.appointment_start is null and q.scheduled_date=p_day))
    union
    select distinct coalesce(a.property_name,'Workspace request'),
      case when w.start_time is null or w.end_time is null then 'pending_date' else 'pending' end,
      case when w.end_time is not null then (p_day+w.start_time) at time zone zone end,
      case when w.start_time is not null then (p_day+w.end_time) at time zone zone end
    from public.public_service_requests r
    left join public.property_users a on a.id=r.property_assignment_id and a.business_id=r.business_id
    left join lateral (
      select (j.value->>'start')::time as start_time,(j.value->>'end')::time as end_time
      from jsonb_array_elements(windows) j
      where j.value->>'id'=r.time_window_id
        and j.value->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and j.value->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and j.value->>'start' < j.value->>'end'
      limit 1
    ) w on true
    where r.business_id=workspace and r.preferred_date=p_day
      and r.status in ('pending_confirmation','reviewing','needs_information')
      and r.public_reference not in ('REQ-1d25b1bbbb034fe898c5d7060cd96e55','REQ-83dbdc11664649cfa759a112ce596493')
  ) slots
  order by slots.start_at nulls last, slots.label, slots.status;
end;
$$;

revoke all on function public.trimax_manager_availability(uuid,date,text) from public,anon,service_role;
grant execute on function public.trimax_manager_availability(uuid,date,text) to authenticated;

commit;
