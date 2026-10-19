-- Candidate only. Install only after a separately approved production rollout.
begin;
alter table public.queue_items add column request_client_id uuid references public.clients(id);
alter table public.queue_items add column source_request_id uuid unique references public.public_service_requests(id);
alter table public.queue_items add column appointment_time_zone text;
alter table public.queue_items add column appointment_start timestamptz;
alter table public.queue_items add column appointment_end timestamptz;
alter table public.queue_items add constraint request_appointment_interval check
 ((appointment_start is null and appointment_end is null) or
  (appointment_start is not null and appointment_end is not null and appointment_end > appointment_start));
alter table public.public_service_requests add column client_id uuid references public.clients(id);
alter table public.public_service_requests add column queue_item_id text unique references public.queue_items(id);
alter table public.scheduling_owner_notifications add column requested_date date;
update public.scheduling_owner_notifications n set requested_date=r.preferred_date
 from public.public_service_requests r where r.id=n.request_id;

-- Snapshot the requested date without changing recipient resolution or read state.
create function public.trimax_notice_requested_date() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 select preferred_date into new.requested_date from public.public_service_requests where id=new.request_id;
 return new;
end $$;
revoke all on function public.trimax_notice_requested_date() from public,anon,authenticated,service_role;
create trigger scheduling_notice_requested_date before insert on public.scheduling_owner_notifications
 for each row execute function public.trimax_notice_requested_date();

-- One atomic owner action. Existing Queue completion/invoice lifecycle is untouched.
create function public.trimax_service_request_workflow(p_request_id uuid,p_revision integer,p_mutation_id text,p_action text,p_client_id uuid default null,p_start timestamptz default null,p_minutes integer default null,p_conflict_reason text default null)
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
 if p_mutation_id is null or p_mutation_id !~ '^[A-Za-z0-9_-]{16,100}$' or p_action is null or p_action not in ('convert','schedule','approve_schedule','cancel_appointment') then raise exception 'Invalid action'; end if;
 fingerprint=encode(sha256(convert_to(jsonb_build_object('revision',p_revision,'action',p_action,'client',p_client_id,'start',p_start,'minutes',p_minutes,'conflictReason',p_conflict_reason)::text,'UTF8')),'hex');
 select details into prior from public.public_request_activity where request_id=r.id and business_id=r.business_id and mutation_id=p_mutation_id;
 if found then
  if prior->>'hash' is distinct from fingerprint then raise exception 'Mutation conflict'; end if;
  return prior->'result';
 end if;
 original_status=r.status;
 if p_revision is null or r.revision<>p_revision then raise exception 'Stale revision'; end if;
 if r.status in ('rejected','cancelled') then raise exception 'Terminal request'; end if;
 if p_action<>'approve_schedule' and r.status<>'approved' then raise exception 'Approve the request first'; end if;
 if p_action='cancel_appointment' and r.queue_item_id is null then raise exception 'No appointment'; end if;
 if p_action in ('schedule','approve_schedule') then
  if p_start is null or not isfinite(p_start) or p_start<=now() or p_minutes is null or p_minutes<15 or p_minutes>720 then raise exception 'Choose a future start and duration of 15 to 720 minutes'; end if;
  select time_zone into zone from public.public_scheduling_settings where business_id=r.business_id;
  finish=p_start+make_interval(mins=>p_minutes);
  if p_conflict_reason is not null and length(btrim(p_conflict_reason)) not between 5 and 500 then raise exception 'Provide a conflict override reason of 5 to 500 characters'; end if;
  -- Existing date-only work is a conflict requiring review rather than a guessed free slot.
  if exists(select 1 from public.queue_items x where x.business_id=r.business_id and x.id is distinct from r.queue_item_id and x.completed_date is null and (
    (x.appointment_start is not null and x.appointment_start<finish and x.appointment_end>p_start) or
    (x.appointment_start is null and x.scheduled_date between (p_start at time zone zone)::date and ((finish-interval '1 second') at time zone zone)::date))) and p_conflict_reason is null then raise exception 'Schedule conflict: review existing work, choose another time, or provide an override reason'; end if;
 end if;
 if r.queue_item_id is null then
  if p_client_id is not null then
   select id into chosen from public.clients where id=p_client_id and business_id=r.business_id for share;
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
   values(gen_random_uuid()::text,r.business_id,actor,r.service_address,'','Pending Estimate','Normal',
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
  update public.queue_items set appointment_time_zone=zone,appointment_start=p_start,appointment_end=finish,scheduled_date=(p_start at time zone zone)::date where id=q.id;
 elsif p_action='cancel_appointment' then
  if q.appointment_start is null then raise exception 'No appointment'; end if;
  update public.queue_items set appointment_start=null,appointment_end=null,scheduled_date=null where id=q.id;
 end if;
 update public.public_service_requests set status='approved',revision=revision+1 where id=r.id returning * into r;
 result=jsonb_build_object('requestId',r.id,'clientId',r.client_id,'queueItemId',r.queue_item_id,'revision',r.revision);
 insert into public.public_request_activity(business_id,request_id,actor_id,event_type,mutation_id,details)
 values(r.business_id,r.id,actor,case when p_action='cancel_appointment' then 'appointment_cancelled' when p_action in ('schedule','approve_schedule') then case when q.appointment_start is null then 'appointment_scheduled' else 'appointment_rescheduled' end else 'queue_converted' end,p_mutation_id,
 jsonb_build_object('hash',fingerprint,'result',result,'action',p_action,'previousStart',q.appointment_start,'start',p_start,'minutes',p_minutes,'conflictReason',p_conflict_reason,'fromStatus',original_status,'toStatus','approved'));
 return result;
end $$;
revoke all on function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text) from public,anon,service_role;
grant execute on function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text) to authenticated;

-- Existing date-only Queue edits must never leave a contradictory timed appointment.
create function public.trimax_request_queue_date_change() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.source_request_id is not null and old.appointment_start is not null
 and new.appointment_start is not distinct from old.appointment_start
 and new.scheduled_date is distinct from (old.appointment_start at time zone coalesce(old.appointment_time_zone,'UTC'))::date then
  new.appointment_start=null;new.appointment_end=null;
  insert into public.public_request_activity(business_id,request_id,actor_id,event_type,details)
  values(new.business_id,new.source_request_id,auth.uid(),'appointment_time_cleared',jsonb_build_object('previousStart',old.appointment_start,'date',new.scheduled_date,'note','Queue date changed; choose a new appointment time.'));
 end if;
 return new;
end $$;
revoke all on function public.trimax_request_queue_date_change() from public,anon,authenticated,service_role;
create trigger request_queue_date_change before update of scheduled_date on public.queue_items for each row execute function public.trimax_request_queue_date_change();
-- A booked request must use the explicit appointment cancellation action first.
create function public.trimax_request_review_booking_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.status in ('rejected','cancelled') and exists(select 1 from public.queue_items where source_request_id=old.id and business_id=old.business_id and appointment_start is not null and completed_date is null) then
  raise exception 'Cancel the appointment before closing this request';
 end if;
 return new;
end $$;
revoke all on function public.trimax_request_review_booking_guard() from public,anon,authenticated,service_role;
create trigger request_review_booking_guard before update of status on public.public_service_requests for each row execute function public.trimax_request_review_booking_guard();

-- Fail closed on inherited grants to unexpected runtime roles.
do $acl$
begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where n.nspname='public' and p.proname in ('trimax_notice_requested_date','trimax_service_request_workflow','trimax_request_queue_date_change','trimax_request_review_booking_guard') and a.grantee<>p.proowner
 and not (p.proname='trimax_service_request_workflow' and a.grantee='authenticated'::regrole)
 and not (p.proname in ('trimax_claim_request_delivery','trimax_finish_request_delivery') and a.grantee='service_role'::regrole)) then raise exception 'Unexpected workflow function grant'; end if;
end $acl$;
commit;
