-- Local candidate only. Reuses existing request preference columns; no new grants or schema.
begin;
create or replace function public.trimax_property_request_context() returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id,'businessId',p.business_id,'property',p.property_name,
  'windows',coalesce((select appointment_windows from public.public_scheduling_settings where business_id=p.business_id),'[]'::jsonb),
  'directQueue',p.can_create_queue_items is true and exists(select 1 from public.clients c where c.id=p.request_client_id and c.business_id=p.business_id),
  'types',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'label',t.public_label) order by t.display_order),'[]'::jsonb) from public.public_service_request_types t where t.business_id=p.business_id and t.active)))
 from public.property_users p where p.user_id=auth.uid()),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reference',r.public_reference,'status',r.status,'property',p.property_name,'description',r.description,'preferredDate',r.preferred_date,'timeWindowId',r.time_window_id,'flexibility',r.flexibility,'urgency',r.urgency,'queueItemId',r.queue_item_id,'appointmentStart',q.appointment_start,'appointmentEnd',q.appointment_end) order by r.submitted_at desc)
 from public.public_service_requests r join public.property_users p on p.id=r.property_assignment_id and p.business_id=r.business_id and p.user_id=auth.uid()
 left join public.queue_items q on q.id=r.queue_item_id and q.business_id=r.business_id
 where r.submitted_by_user_id=auth.uid()),'[]'::jsonb));
$$;

create or replace function public.trimax_submit_property_request(p_assignment_id uuid,p_key text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a public.property_users; r public.public_service_requests; t public.public_service_request_types;
 actor uuid:=auth.uid(); digest text; key_hash text; queue_id text; direct boolean;
 customer text; contact_email text; unit_name text; description text; preferred date; timing text; requested_urgency text; window_id text;
begin
 if actor is null then raise exception 'Not authorized'; end if;
 select * into a from public.property_users where id=p_assignment_id and user_id=actor for share;
 if not found then raise exception 'Not authorized'; end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9_-]{16,100}$' or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid request'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('requestTypeId','unit','description','preferredDate','directQueue','uploadCapabilityHash','urgency','flexibility','timeWindowId')) then raise exception 'Unexpected request field'; end if;
 if p_payload ? 'uploadCapabilityHash' and (jsonb_typeof(p_payload->'uploadCapabilityHash') is distinct from 'string' or p_payload->>'uploadCapabilityHash' !~ '^[a-f0-9]{64}$') then raise exception 'Invalid photo capability';end if;
 unit_name=btrim(coalesce(p_payload->>'unit',''));description=btrim(coalesce(p_payload->>'description',''));
 if length(unit_name) not between 1 and 100 or length(description) not between 1 and 3000 then raise exception 'Enter a unit and work description'; end if;
 select * into t from public.public_service_request_types where id=(p_payload->>'requestTypeId')::uuid and business_id=a.business_id and active;
 if not found then raise exception 'Choose an available service'; end if;
 preferred=nullif(p_payload->>'preferredDate','')::date;
 if preferred is not null and preferred < (now() at time zone coalesce((select time_zone from public.public_scheduling_settings where business_id=a.business_id),'UTC'))::date then raise exception 'Choose today or a future preference'; end if;
 if exists(select 1 from unnest(array['urgency','flexibility','timeWindowId']) field where p_payload ? field and jsonb_typeof(p_payload->field) is distinct from 'string') then raise exception 'Invalid timing field';end if;
 requested_urgency=coalesce(p_payload->>'urgency','routine');timing=coalesce(p_payload->>'flexibility','preferred');window_id=nullif(p_payload->>'timeWindowId','');
 if requested_urgency not in ('routine','soon','time_sensitive','urgent') or timing not in ('flexible','preferred','fixed') then raise exception 'Invalid timing or urgency';end if;
 if timing='fixed' and preferred is null then raise exception 'Date required';end if;
 if window_id is not null and (length(window_id)>40 or not exists(select 1 from public.public_scheduling_settings s cross join lateral jsonb_array_elements(s.appointment_windows) w where s.business_id=a.business_id and w->>'id'=window_id)) then raise exception 'Invalid time window';end if;
 direct=coalesce((p_payload->>'directQueue')::boolean,false);
 if direct and (a.can_create_queue_items is not true or a.request_client_id is null or not exists(select 1 from public.clients where id=a.request_client_id and business_id=a.business_id)) then raise exception 'Direct Queue submission is not enabled for this assignment'; end if;
 digest=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 key_hash=encode(sha256(convert_to('manager:'||actor::text||':'||a.id::text||':'||p_key,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('property-request:'||key_hash,0));
 select * into r from public.public_service_requests where business_id=a.business_id and idempotency_hash=key_hash;
 if found then
  if r.payload_hash<>digest then raise exception 'Idempotency conflict'; end if;
  return jsonb_build_object('id',r.id,'reference',r.public_reference,'status',r.status,'queueItemId',r.queue_item_id);
 end if;
 -- Contact comes from the assigned account, never a submitted identity or tenant.
 contact_email=coalesce(a.email,'');customer=left(a.property_name||' manager',120);
 insert into public.public_service_requests(business_id,request_type_id,public_reference,idempotency_hash,payload_hash,customer_name,email,preferred_contact,service_address,description,preferred_date,time_window_id,flexibility,urgency,contact_consent_at,status,source,submitted_by_user_id,property_assignment_id)
 values(a.business_id,t.id,'REQ-'||replace(gen_random_uuid()::text,'-',''),key_hash,digest,customer,contact_email,'email',a.property_name,left('Unit: '||unit_name||E'\n'||description,3000),preferred,window_id,timing,requested_urgency,now(),case when direct then 'approved' else 'pending_confirmation' end,'property-manager',actor,a.id) returning * into r;
 if p_payload ? 'uploadCapabilityHash' then update public.public_service_requests set upload_capability_hash=p_payload->>'uploadCapabilityHash',upload_capability_expires_at=now()+interval '30 minutes' where id=r.id;end if;
 update public.public_service_requests set integration_references=jsonb_build_object('propertyUnit',unit_name),client_id=(select id from public.clients where id=a.request_client_id and business_id=a.business_id) where id=r.id;
 if direct then
  queue_id=gen_random_uuid()::text;
  insert into public.queue_items(id,business_id,created_by_user_id,property,unit,status,priority,notes,request_client_id,source_request_id)
  values(queue_id,a.business_id,actor,a.property_name,unit_name,'Pending Estimate','Normal',description,a.request_client_id,r.id);
  update public.public_service_requests set client_id=a.request_client_id,queue_item_id=queue_id where id=r.id;
 end if;
 insert into public.public_request_activity(business_id,request_id,actor_id,event_type,details)
 values(a.business_id,r.id,actor,'property_request_submitted',jsonb_build_object('assignmentId',a.id,'unit',unit_name,'directQueue',direct,'queueItemId',queue_id,'urgency',requested_urgency,'preferredDate',preferred,'timeWindowId',window_id,'flexibility',timing));
 return jsonb_build_object('id',r.id,'reference',r.public_reference,'status',r.status,'queueItemId',queue_id);
end $$;
revoke all on function public.trimax_property_request_context() from public,anon,service_role;
revoke all on function public.trimax_submit_property_request(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.trimax_property_request_context(),public.trimax_submit_property_request(uuid,text,jsonb) to authenticated;

commit;
