begin;
create function public.trimax_service_request_workflow(p_request_id uuid,p_revision integer,p_mutation_id text,p_action text,p_client_id uuid,p_start timestamptz,p_minutes integer,p_conflict_reason text, p_property_id uuid, p_unit_id uuid, p_property_name text, p_unit_label text, p_no_unit boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests; q public.queue_items; actor uuid:=auth.uid();
 prior jsonb; result jsonb; fingerprint text; chosen uuid; matches integer; zone text; finish timestamptz; original_status text; selected_property public.properties; selected_unit text; apartment_request boolean;
begin
 if actor is null then raise exception 'Not authorized'; end if;
 -- Serialize workflow appointments in this workspace, then lock the source request.
 select * into r from public.public_service_requests where id=p_request_id;
 if not found or not exists(select 1 from public.business_users where business_id=r.business_id and user_id=actor and role in ('owner','admin')) then raise exception 'Not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('service-workflow:'||r.business_id::text,0));
 select * into r from public.public_service_requests where id=p_request_id for update;
 if p_mutation_id is null or p_mutation_id !~ '^[A-Za-z0-9_-]{16,100}$' or p_action is null or p_action not in ('convert','schedule','approve_schedule','cancel_appointment') then raise exception 'Invalid action'; end if;
 fingerprint=encode(sha256(convert_to(jsonb_build_object('revision',p_revision,'action',p_action,'client',p_client_id,'start',p_start,'minutes',p_minutes,'conflictReason',p_conflict_reason,'propertyId',p_property_id,'unitId',p_unit_id,'propertyName',p_property_name,'unitLabel',p_unit_label,'noUnit',p_no_unit)::text,'UTF8')),'hex');
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
  if r.public_reference in ('REQ-1d25b1bbbb034fe898c5d7060cd96e55','REQ-83dbdc11664649cfa759a112ce596493') then
   raise exception 'Synthetic intake requests cannot create Queue work';
  end if;
  if p_property_id is not null and p_property_name is null then
   select * into selected_property from public.properties where id=p_property_id and business_id=r.business_id for share;
  elsif p_property_id is null and length(btrim(p_property_name)) between 2 and 120 and p_property_name !~ '[[:cntrl:]]' then
   insert into public.properties(business_id,name) values(r.business_id,btrim(p_property_name))
    on conflict(business_id,name) do nothing;
   select * into selected_property from public.properties where business_id=r.business_id and name=btrim(p_property_name) for share;
  end if;
  if selected_property.id is null then raise exception 'Select a property in this workspace'; end if;
  select exists(select 1 from public.public_service_request_types where id=r.request_type_id and business_id=r.business_id and public_key='property')
   or nullif(r.integration_references->>'propertyUnit','') is not null into apartment_request;
  if p_unit_id is not null and p_unit_label is null and not coalesce(p_no_unit,false) then
   select unit_label into selected_unit from public.property_units
    where id=p_unit_id and property_id=selected_property.id and business_id=r.business_id for share;
  elsif p_unit_id is null and length(btrim(p_unit_label)) between 1 and 40 and p_unit_label !~ '[[:cntrl:]]' and not coalesce(p_no_unit,false) then
   selected_unit=btrim(p_unit_label);
  elsif p_unit_id is null and p_unit_label is null and p_no_unit and not apartment_request then
   selected_unit='Not applicable';
  end if;
  if selected_unit is null then raise exception 'Choose the unit for this property'; end if;
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
   values(gen_random_uuid()::text,r.business_id,actor,selected_property.name,selected_unit,'Pending Estimate','Normal',
    concat_ws(E'\n',r.description,'Submitted service address: '||r.service_address,'Customer: '||r.customer_name,'Phone: '||r.phone,'Email: '||r.email,'Preferred contact: '||r.preferred_contact,'Requested date (preference): '||coalesce(r.preferred_date::text,'Flexible'),'Requested window: '||coalesce(r.time_window_id,'Any'),'Flexibility: '||r.flexibility,'Urgency: '||r.urgency,'Customer notes: '||r.customer_notes,'Source request: '||r.public_reference),chosen,r.id) returning * into q;
  update public.public_service_requests set client_id=chosen,queue_item_id=q.id where id=r.id;
  insert into public.public_request_activity(business_id,request_id,actor_id,event_type,details)
   values(r.business_id,r.id,actor,case when matches=0 and p_client_id is null then 'client_created' else 'client_matched' end,jsonb_build_object('clientId',chosen,'queueItemId',q.id,'propertyId',selected_property.id,'unitId',p_unit_id,'unit',selected_unit));
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
revoke all on function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text,uuid,uuid,text,text,boolean) from public,anon,service_role;
grant execute on function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text,uuid,uuid,text,text,boolean) to authenticated;
revoke execute on function public.trimax_service_request_workflow(uuid,integer,text,text,uuid,timestamptz,integer,text) from authenticated;
commit;
