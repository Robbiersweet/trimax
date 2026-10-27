-- Candidate only; apply after20261026_request_photo_candidate.sql.
begin;
create or replace function public.trimax_submit_property_request(p_assignment_id uuid,p_key text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a public.property_users; r public.public_service_requests; t public.public_service_request_types;
 actor uuid:=auth.uid(); digest text; key_hash text; queue_id text; direct boolean;
 customer text; contact_email text; unit_name text; description text; preferred date;
begin
 if actor is null then raise exception 'Not authorized'; end if;
 select * into a from public.property_users where id=p_assignment_id and user_id=actor for share;
 if not found then raise exception 'Not authorized'; end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9_-]{16,100}$' or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid request'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('requestTypeId','unit','description','preferredDate','directQueue','uploadCapabilityHash')) then raise exception 'Unexpected request field'; end if;
 if p_payload ? 'uploadCapabilityHash' and (jsonb_typeof(p_payload->'uploadCapabilityHash') is distinct from 'string' or p_payload->>'uploadCapabilityHash' !~ '^[a-f0-9]{64}$') then raise exception 'Invalid photo capability';end if;
 unit_name=btrim(coalesce(p_payload->>'unit',''));description=btrim(coalesce(p_payload->>'description',''));
 if length(unit_name) not between 1 and 100 or length(description) not between 1 and 3000 then raise exception 'Enter a unit and work description'; end if;
 select * into t from public.public_service_request_types where id=(p_payload->>'requestTypeId')::uuid and business_id=a.business_id and active;
 if not found then raise exception 'Choose an available service'; end if;
 preferred=nullif(p_payload->>'preferredDate','')::date;
 if preferred is not null and preferred < (now() at time zone coalesce((select time_zone from public.public_scheduling_settings where business_id=a.business_id),'UTC'))::date then raise exception 'Choose today or a future preference'; end if;
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
 insert into public.public_service_requests(business_id,request_type_id,public_reference,idempotency_hash,payload_hash,customer_name,email,preferred_contact,service_address,description,preferred_date,flexibility,urgency,contact_consent_at,status,source,submitted_by_user_id,property_assignment_id)
 values(a.business_id,t.id,'REQ-'||replace(gen_random_uuid()::text,'-',''),key_hash,digest,customer,contact_email,'email',a.property_name,left('Unit: '||unit_name||E'\n'||description,3000),preferred,'preferred','routine',now(),case when direct then 'approved' else 'pending_confirmation' end,'property-manager',actor,a.id) returning * into r;
 if p_payload ? 'uploadCapabilityHash' then update public.public_service_requests set upload_capability_hash=p_payload->>'uploadCapabilityHash',upload_capability_expires_at=now()+interval '30 minutes' where id=r.id;end if;
 update public.public_service_requests set integration_references=jsonb_build_object('propertyUnit',unit_name),client_id=(select id from public.clients where id=a.request_client_id and business_id=a.business_id) where id=r.id;
 if direct then
  queue_id=gen_random_uuid()::text;
  insert into public.queue_items(id,business_id,created_by_user_id,property,unit,status,priority,notes,request_client_id,source_request_id)
  values(queue_id,a.business_id,actor,a.property_name,unit_name,'Pending Estimate','Normal',description,a.request_client_id,r.id);
  update public.public_service_requests set client_id=a.request_client_id,queue_item_id=queue_id where id=r.id;
 end if;
 insert into public.public_request_activity(business_id,request_id,actor_id,event_type,details)
 values(a.business_id,r.id,actor,'property_request_submitted',jsonb_build_object('assignmentId',a.id,'unit',unit_name,'directQueue',direct,'queueItemId',queue_id));
 return jsonb_build_object('id',r.id,'reference',r.public_reference,'status',r.status,'queueItemId',queue_id);
end $$;
revoke all on function public.trimax_property_request_context() from public,anon,service_role;
revoke all on function public.trimax_submit_property_request(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.trimax_property_request_context(),public.trimax_submit_property_request(uuid,text,jsonb) to authenticated;

create or replace function public.trimax_reserve_request_photo(p_request uuid,p_hash text,p_upload uuid,p_input_hash text,p_bytes integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.public_service_requests; saved public.request_photos; n integer; bytes bigint;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or p_upload is null or p_bytes is null or p_bytes not between 1 and 5242880 then raise exception 'Photo rejected'; end if;
 select * into r from public.public_service_requests where id=p_request for update;
 if r.source='property-manager' and (auth.uid() is null or r.submitted_by_user_id is distinct from auth.uid() or not exists(select 1 from public.property_users p where p.id=r.property_assignment_id and p.business_id=r.business_id and p.user_id=auth.uid())) then raise exception 'Photo rejected';end if;
 if not found or r.upload_capability_hash is distinct from p_hash or r.upload_capability_expires_at is null or r.upload_capability_expires_at<=now() then raise exception 'Photo rejected'; end if;
 select * into saved from public.request_photos where id=p_upload;
 if found then
  if saved.request_id<>r.id or saved.business_id<>r.business_id or saved.input_hash<>p_input_hash or saved.input_bytes<>p_bytes then raise exception 'Photo rejected';end if;
 else
  select count(*),coalesce(sum(input_bytes),0) into n,bytes from public.request_photos where request_id=r.id;
  if n>=4 or bytes+p_bytes>12582912 then raise exception 'Photo limit reached';end if;
  insert into public.request_photos(id,request_id,business_id,input_hash,input_bytes,object_key) values(p_upload,r.id,r.business_id,p_input_hash,p_bytes,r.business_id::text||'/'||r.id::text||'/'||p_upload::text||'.jpg') returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'objectKey',saved.object_key,'state',saved.state);
end $$;
create or replace function public.trimax_complete_request_photo(p_request uuid,p_hash text,p_upload uuid,p_output_hash text,p_width integer,p_height integer) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.public_service_requests; saved public.request_photos;
begin
 select * into r from public.public_service_requests where id=p_request for update;
 if r.source='property-manager' and (auth.uid() is null or r.submitted_by_user_id is distinct from auth.uid() or not exists(select 1 from public.property_users p where p.id=r.property_assignment_id and p.business_id=r.business_id and p.user_id=auth.uid())) then raise exception 'Photo rejected';end if;
 if not found or r.upload_capability_hash is distinct from p_hash or p_hash is null or r.upload_capability_expires_at<=now() or r.upload_capability_expires_at is null then raise exception 'Photo rejected';end if;
 if p_output_hash is null or p_output_hash !~ '^[a-f0-9]{64}$' or p_width is null or p_height is null or p_width<1 or p_height<1 or p_width::bigint*p_height>24000000 then raise exception 'Photo rejected';end if;
 select * into saved from public.request_photos where id=p_upload and request_id=r.id and business_id=r.business_id for update;
 if not found then raise exception 'Photo rejected';end if;
 if saved.state='complete' and (saved.output_hash<>p_output_hash or saved.width<>p_width or saved.height<>p_height) then raise exception 'Photo rejected';end if;
 update public.request_photos set state='complete',output_hash=p_output_hash,width=p_width,height=p_height where id=saved.id;
end $$;
revoke all on function public.trimax_reserve_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_request_photo(uuid,text,uuid,text,integer,integer) from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake;
grant execute on function public.trimax_reserve_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_request_photo(uuid,text,uuid,text,integer,integer) to service_role;

-- Authenticated wrappers reject public-web requests and current assignment changes.
create function public.trimax_reserve_property_request_photo(p_request uuid,p_hash text,p_upload uuid,p_input_hash text,p_bytes integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests;
begin
 select * into r from public.public_service_requests where id=p_request for update;
 if auth.uid() is null or r.id is null or r.source<>'property-manager' or r.submitted_by_user_id is distinct from auth.uid() then raise exception 'Photo rejected';end if;
 perform 1 from public.property_users p where p.id=r.property_assignment_id and p.business_id=r.business_id and p.user_id=auth.uid() for share;
 if not found then raise exception 'Photo rejected';end if;
 return public.trimax_reserve_request_photo(p_request,p_hash,p_upload,p_input_hash,p_bytes);
end $$;
create function public.trimax_complete_property_request_photo(p_request uuid,p_hash text,p_upload uuid,p_output_hash text,p_width integer,p_height integer) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests;
begin
 select * into r from public.public_service_requests where id=p_request for update;
 if auth.uid() is null or r.id is null or r.source<>'property-manager' or r.submitted_by_user_id is distinct from auth.uid() then raise exception 'Photo rejected';end if;
 perform 1 from public.property_users p where p.id=r.property_assignment_id and p.business_id=r.business_id and p.user_id=auth.uid() for share;
 if not found then raise exception 'Photo rejected';end if;
 perform public.trimax_complete_request_photo(p_request,p_hash,p_upload,p_output_hash,p_width,p_height);
end $$;
revoke all on function public.trimax_reserve_property_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_property_request_photo(uuid,text,uuid,text,integer,integer) from public,anon,service_role,trimax_scheduling_web,trimax_scheduling_intake;
grant execute on function public.trimax_reserve_property_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_property_request_photo(uuid,text,uuid,text,integer,integer) to authenticated;
commit;
