-- Candidate only; preserve existing intake validation/privileges.
begin;
alter table public.public_service_requests drop constraint public_service_requests_urgency_check;
alter table public.public_service_requests add constraint public_service_requests_urgency_check check(urgency in ('routine','soon','time_sensitive','urgent'));
create or replace function public.trimax_submit_public_service_request(p_slug text,p_payload jsonb,p_idempotency_hash text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare settings public.public_scheduling_settings; kind public.public_service_request_types; saved public.public_service_requests; payload_hash_value text; requested date; k text;
begin
 if jsonb_typeof(p_payload)<>'object' or p_idempotency_hash !~ '^[a-f0-9]{64}$' or p_capability_hash !~ '^[a-f0-9]{64}$' or p_idempotency_hash is null or p_capability_hash is null then raise exception 'Invalid request identity'; end if;
 for k in select jsonb_object_keys(p_payload) loop if k<>all(array['requestTypeId','customerName','phone','email','preferredContact','address','description','preferredDate','timeWindowId','flexibility','urgency','notes','consent']) then raise exception 'Unexpected request field'; end if; end loop;
 select * into settings from public.public_scheduling_settings where public_slug=p_slug and enabled and owner_approval_required and mode='request-only' for share;
 if not found then raise exception 'Public scheduling unavailable'; end if;
 select * into kind from public.public_service_request_types where business_id=settings.business_id and public_key=p_payload->>'requestTypeId' and active for share;
 if not found then raise exception 'Service unavailable'; end if;
 for k in select unnest(array['requestTypeId','customerName','phone','email','preferredContact','address','description','preferredDate','timeWindowId','flexibility','urgency','notes']) loop if jsonb_typeof(p_payload->k) is distinct from 'string' then raise exception 'Invalid field type'; end if; end loop;
 if (p_payload->'consent') is distinct from 'true'::jsonb or length(btrim(p_payload->>'customerName')) not between 1 and 120 or length(btrim(p_payload->>'address')) not between 1 and 500 or length(btrim(p_payload->>'description')) not between 1 and 3000 or length(p_payload->>'notes')>2000 or length(p_payload->>'phone')>40 or length(p_payload->>'email')>254 then raise exception 'Invalid request fields'; end if;
 if p_payload->>'preferredContact' not in ('phone','sms','email') or p_payload->>'flexibility' not in ('fixed','preferred','flexible') or p_payload->>'urgency' not in ('routine','soon','time_sensitive','urgent') then raise exception 'Invalid request values'; end if;
 if p_payload->>'email'<>'' and p_payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 if p_payload->>'preferredContact'='email' and p_payload->>'email'='' then raise exception 'Email required'; end if;
 if (p_payload->>'phone'<>'' or p_payload->>'preferredContact' in ('phone','sms')) and (p_payload->>'phone' !~ '^\+?[0-9 ().-]{7,40}$' or length(regexp_replace(p_payload->>'phone','[^0-9]','','g'))<7) then raise exception 'Invalid phone'; end if;
 if p_payload->>'timeWindowId'<>'' and not exists(select 1 from jsonb_array_elements(settings.appointment_windows) w where w->>'id'=p_payload->>'timeWindowId') then raise exception 'Invalid time window'; end if;
 if p_payload->>'preferredDate'<>'' then
  if p_payload->>'preferredDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date'; end if;
  requested=(p_payload->>'preferredDate')::date;
  if requested<(now() at time zone settings.time_zone)::date then raise exception 'Choose today or a future date'; end if;
 elsif p_payload->>'flexibility'='fixed' then raise exception 'Date required'; end if;
 payload_hash_value=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 -- Serialize only identical tenant/key submissions; no unrelated business lock.
 perform pg_advisory_xact_lock(hashtextextended(settings.business_id::text||p_idempotency_hash,0));
 select * into saved from public.public_service_requests where business_id=settings.business_id and idempotency_hash=p_idempotency_hash;
 if found then
  if saved.payload_hash<>payload_hash_value or saved.status_capability_hash<>p_capability_hash then raise exception 'Idempotency conflict'; end if;
 else
  insert into public.public_service_requests(business_id,request_type_id,public_reference,idempotency_hash,payload_hash,customer_name,phone,email,preferred_contact,service_address,description,preferred_date,time_window_id,flexibility,urgency,customer_notes,contact_consent_at,status_capability_hash,capability_expires_at)
  values(settings.business_id,kind.id,'REQ-'||replace(gen_random_uuid()::text,'-',''),p_idempotency_hash,payload_hash_value,btrim(p_payload->>'customerName'),p_payload->>'phone',lower(p_payload->>'email'),p_payload->>'preferredContact',btrim(p_payload->>'address'),btrim(p_payload->>'description'),requested,nullif(p_payload->>'timeWindowId',''),p_payload->>'flexibility',p_payload->>'urgency',p_payload->>'notes',now(),p_capability_hash,now()+interval '90 days') returning * into saved;
  insert into public.public_request_activity(business_id,request_id,event_type,details) values(settings.business_id,saved.id,'request_received','{}');
  insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,idempotency_key)
  values(settings.business_id,saved.id,'new_request','in-app','internal','workspace-owners','public-request-received','received:'||saved.id::text);
 end if;
 return jsonb_build_object('id',saved.id,'reference',saved.public_reference,'status',saved.status,'submittedAt',saved.submitted_at);
end $$;
commit;
