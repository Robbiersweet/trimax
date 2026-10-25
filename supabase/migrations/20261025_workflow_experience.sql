-- Candidate only.
begin;
alter table public.queue_items add column appointment_buffer_before integer not null default 0 check(appointment_buffer_before between 0 and 240);
alter table public.queue_items add column appointment_buffer_after integer not null default 0 check(appointment_buffer_after between 0 and 240);
alter table public.queue_items add column appointment_kind text not null default 'job' check(appointment_kind in ('job','site_visit'));
create table public.scheduling_time_blocks(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),starts_at timestamptz not null,ends_at timestamptz not null,label text not null check(length(label) between 1 and 120),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),check(ends_at>starts_at));
alter table public.scheduling_time_blocks enable row level security;
revoke all on public.scheduling_time_blocks from public,anon,authenticated,service_role;
grant select on public.scheduling_time_blocks to authenticated;
create policy scheduling_blocks_owner_read on public.scheduling_time_blocks for select to authenticated using(exists(select 1 from public.business_users b where b.business_id=scheduling_time_blocks.business_id and b.user_id=auth.uid() and b.role in ('owner','admin')));
create function public.trimax_schedule_block(p_business_id uuid,p_start timestamptz,p_end timestamptz,p_label text,p_remove_id uuid default null) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare block_id uuid; zone text;
begin
 if not exists(select 1 from public.business_users where business_id=p_business_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('service-workflow:'||p_business_id::text,0));
 select time_zone into zone from public.public_scheduling_settings where business_id=p_business_id;
 if zone is null then raise exception 'Workspace timezone unavailable';end if;
 if p_remove_id is not null then delete from public.scheduling_time_blocks where id=p_remove_id and business_id=p_business_id returning id into block_id;return block_id;end if;
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start or p_end-p_start>interval '366 days' or length(btrim(p_label)) not between 1 and 120 then raise exception 'Invalid block';end if;
 if exists(select 1 from public.queue_items where business_id=p_business_id and completed_date is null and ((appointment_start-make_interval(mins=>appointment_buffer_before)<p_end and appointment_end+make_interval(mins=>appointment_buffer_after)>p_start) or (appointment_start is null and scheduled_date between (p_start at time zone zone)::date and ((p_end-interval '1 second') at time zone zone)::date))) then raise exception 'Block overlaps scheduled work; move or cancel it first';end if;
 insert into public.scheduling_time_blocks(business_id,starts_at,ends_at,label,created_by) values(p_business_id,p_start,p_end,btrim(p_label),auth.uid()) returning id into block_id;return block_id;
end $$;
revoke all on function public.trimax_schedule_block(uuid,timestamptz,timestamptz,text,uuid) from public,anon,service_role;
grant execute on function public.trimax_schedule_block(uuid,timestamptz,timestamptz,text,uuid) to authenticated;
drop function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text);
create function public.trimax_service_request_workflow(p_request_id uuid,p_revision integer,p_mutation_id text,p_action text,p_client_id uuid default null,p_start timestamptz default null,p_minutes integer default null,p_conflict_reason text default null,p_buffer_before integer default 0,p_buffer_after integer default 0,p_kind text default 'job')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests; q public.queue_items; actor uuid:=auth.uid();
 prior jsonb; result jsonb; fingerprint text; chosen uuid; matches integer; zone text; finish timestamptz; original_status text;
begin
 if actor is null then raise exception 'Not authorized'; end if;
 -- Serialize workflow appointments in this workspace, then lock the source request.
 select * into r from public.public_service_requests where id=p_request_id;
 if not found or not exists(select 1 from public.business_users where business_id=r.business_id and user_id=actor and role in ('owner','admin')) then raise exception 'Not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('service-workflow:'||r.business_id::text,0));
 select * into r from public.public_service_requests where id=p_request_id for update;
 if p_mutation_id is null or p_mutation_id !~ '^[A-Za-z0-9_-]{16,100}$' or p_action is null or p_action not in ('convert','approve_queue','schedule','approve_schedule','cancel_appointment') then raise exception 'Invalid action'; end if;
 fingerprint=encode(sha256(convert_to(jsonb_build_object('revision',p_revision,'action',p_action,'client',p_client_id,'start',p_start,'minutes',p_minutes,'conflictReason',p_conflict_reason)::text,'UTF8')),'hex');
 if p_buffer_before<>0 or p_buffer_after<>0 or p_kind<>'job' then fingerprint=encode(sha256(convert_to(fingerprint||jsonb_build_object('bufferBefore',p_buffer_before,'bufferAfter',p_buffer_after,'kind',p_kind)::text,'UTF8')),'hex');end if;
 select details into prior from public.public_request_activity where request_id=r.id and business_id=r.business_id and mutation_id=p_mutation_id;
 if found then
  if prior->>'hash' is distinct from fingerprint then raise exception 'Mutation conflict'; end if;
  return prior->'result';
 end if;
 original_status=r.status;
 if p_revision is null or r.revision<>p_revision then raise exception 'Stale revision'; end if;
 if r.status in ('rejected','cancelled') then raise exception 'Terminal request'; end if;
 if p_action not in ('approve_schedule','approve_queue') and r.status<>'approved' then raise exception 'Approve the request first'; end if;
 if p_action='cancel_appointment' and r.queue_item_id is null then raise exception 'No appointment'; end if;
 if p_action in ('schedule','approve_schedule') then
  if p_start is null or not isfinite(p_start) or p_start<=now() or p_minutes is null or p_minutes<15 or p_minutes>10080 then raise exception 'Choose a future start and duration of 15 to 10080 minutes'; end if;
  if p_buffer_before is null or p_buffer_after is null or p_buffer_before not between 0 and 240 or p_buffer_after not between 0 and 240 or p_kind is null or p_kind not in ('job','site_visit') then raise exception 'Invalid buffers or appointment kind'; end if;
  select time_zone into zone from public.public_scheduling_settings where business_id=r.business_id;
  finish=p_start+make_interval(mins=>p_minutes);
  if p_conflict_reason is not null and length(btrim(p_conflict_reason)) not between 5 and 500 then raise exception 'Provide a conflict override reason of 5 to 500 characters'; end if;
  if exists(select 1 from public.public_scheduling_settings s, unnest(s.blocked_dates) d where s.business_id=r.business_id and d between (p_start at time zone zone)::date and ((finish-interval '1 second') at time zone zone)::date) and p_conflict_reason is null then raise exception 'Blocked date: choose another date or provide an override reason'; end if;
  if exists(select 1 from public.scheduling_time_blocks b where b.business_id=r.business_id and b.starts_at<finish+make_interval(mins=>p_buffer_after) and b.ends_at>p_start-make_interval(mins=>p_buffer_before)) then raise exception 'Blocked time: remove the block or choose another time';end if;
  -- Existing date-only work is a conflict requiring review rather than a guessed free slot.
  if exists(select 1 from public.queue_items x where x.business_id=r.business_id and x.id is distinct from r.queue_item_id and x.completed_date is null and (
    (x.appointment_start is not null and x.appointment_start-make_interval(mins=>x.appointment_buffer_before)<finish+make_interval(mins=>p_buffer_after) and x.appointment_end+make_interval(mins=>x.appointment_buffer_after)>p_start-make_interval(mins=>p_buffer_before)) or
    (x.appointment_start is null and x.scheduled_date between (p_start at time zone zone)::date and ((finish-interval '1 second') at time zone zone)::date))) and p_conflict_reason is null then raise exception 'Schedule conflict: review existing work, choose another time, or provide an override reason'; end if;
 end if;
 if r.queue_item_id is null then
  if p_client_id is not null or (r.source='property-manager' and r.client_id is not null) then
   select id into chosen from public.clients where id=coalesce(p_client_id,r.client_id) and business_id=r.business_id for share;
   if not found then raise exception 'Client is not in this workspace'; end if;
  else
   select count(*),(array_agg(id))[1] into matches,chosen from public.clients where business_id=r.business_id and
    ((nullif(r.email,'') is not null and lower(btrim(email))=lower(btrim(r.email))) or
     (length(regexp_replace(coalesce(r.phone,''),'[^0-9]','','g'))>=7 and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(r.phone,'[^0-9]','','g')));
   if matches>1 then raise exception 'Multiple matching clients: select the correct client'; end if;
   if matches=0 then
    insert into public.clients(business_id,created_by_user_id,name,contact_name,email,phone,service_address)
     values(r.business_id,actor,r.customer_name,r.customer_name,nullif(r.email,''),nullif(r.phone,''),r.service_address) returning id into chosen;
   end if;
  end if;
  insert into public.queue_items(id,business_id,created_by_user_id,property,unit,status,priority,notes,request_client_id,source_request_id)
   values(gen_random_uuid()::text,r.business_id,actor,r.service_address,case when r.source='property-manager' then coalesce(r.integration_references->>'propertyUnit','') else '' end,'Pending Estimate','Normal',
    concat_ws(E'\n',r.description,'Customer: '||r.customer_name,'Phone: '||r.phone,'Email: '||r.email,'Preferred contact: '||r.preferred_contact,'Requested date (preference): '||coalesce(r.preferred_date::text,'Flexible'),'Requested window: '||coalesce(r.time_window_id,'Any'),'Flexibility: '||r.flexibility,'Urgency: '||r.urgency,'Customer notes: '||r.customer_notes,'Source request: '||r.public_reference),chosen,r.id) returning * into q;
  update public.public_service_requests set client_id=chosen,queue_item_id=q.id where id=r.id;
  insert into public.public_request_activity(business_id,request_id,actor_id,event_type,details)
   values(r.business_id,r.id,actor,case when matches=0 and p_client_id is null then 'client_created' else 'client_matched' end,jsonb_build_object('clientId',chosen,'queueItemId',q.id));
 else
  select * into q from public.queue_items where id=r.queue_item_id and business_id=r.business_id and source_request_id=r.id for update;
  if not found or q.request_client_id is distinct from r.client_id or (p_client_id is not null and p_client_id is distinct from r.client_id) then raise exception 'Existing conversion does not match'; end if;
  if q.completed_date is not null then raise exception 'Completed work cannot be scheduled'; end if;
 end if;
 if p_action in ('schedule','approve_schedule') then
  update public.queue_items set appointment_buffer_before=p_buffer_before,appointment_buffer_after=p_buffer_after,appointment_kind=p_kind,appointment_time_zone=zone,appointment_start=p_start,appointment_end=finish,scheduled_date=(p_start at time zone zone)::date where id=q.id;
 elsif p_action='cancel_appointment' then
  if q.appointment_start is null then raise exception 'No appointment'; end if;
  update public.queue_items set appointment_start=null,appointment_end=null,scheduled_date=null where id=q.id;
 end if;
 update public.public_service_requests set status='approved',revision=revision+1 where id=r.id returning * into r;
 result=jsonb_build_object('requestId',r.id,'clientId',r.client_id,'queueItemId',r.queue_item_id,'revision',r.revision);
 insert into public.public_request_activity(business_id,request_id,actor_id,event_type,mutation_id,details)
 values(r.business_id,r.id,actor,case when p_action='cancel_appointment' then 'appointment_cancelled' when p_action in ('schedule','approve_schedule') then case when q.appointment_start is null then 'appointment_scheduled' else 'appointment_rescheduled' end else 'queue_converted' end,p_mutation_id,
 jsonb_build_object('hash',fingerprint,'result',result,'action',p_action,'previousStart',q.appointment_start,'start',p_start,'minutes',p_minutes,'conflictReason',p_conflict_reason,'bufferBefore',p_buffer_before,'bufferAfter',p_buffer_after,'kind',p_kind,'fromStatus',original_status,'toStatus','approved'));
 return result;
end $$;
revoke all on function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text,integer,integer,text) from public,anon,service_role;
grant execute on function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text,integer,integer,text) to authenticated;

alter table public.queue_items add column appointment_revision integer not null default 0;
alter table public.queue_items add column appointment_status text not null default 'none' check (appointment_status in ('none','confirmed','cancelled'));
alter table public.queue_items add column appointment_previous_start timestamptz;
alter table public.queue_items add column appointment_previous_end timestamptz;
alter table public.queue_items add column appointment_changed_at timestamptz;
update public.queue_items set appointment_revision=1,appointment_status='confirmed',appointment_changed_at=now() where appointment_start is not null;
create function public.trimax_appointment_revision() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.appointment_start is distinct from old.appointment_start or new.appointment_end is distinct from old.appointment_end then
  new.appointment_revision=old.appointment_revision+1;
  new.appointment_changed_at=now();
  new.appointment_previous_start=coalesce(old.appointment_start,old.appointment_previous_start);
  new.appointment_previous_end=coalesce(old.appointment_end,old.appointment_previous_end);
  new.appointment_status=case when new.appointment_start is null then 'cancelled' else 'confirmed' end;
 else
  new.appointment_revision=old.appointment_revision;new.appointment_changed_at=old.appointment_changed_at;new.appointment_previous_start=old.appointment_previous_start;new.appointment_previous_end=old.appointment_previous_end;new.appointment_status=old.appointment_status;
 end if;
 return new;
end $$;
revoke all on function public.trimax_appointment_revision() from public,anon,authenticated,service_role;
create trigger zz_appointment_revision before update on public.queue_items for each row execute function public.trimax_appointment_revision();
commit;
