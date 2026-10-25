-- Apply after communications consent columns. Candidate only.
begin;
alter table public.public_service_requests add column upload_capability_hash text check(upload_capability_hash ~ '^[a-f0-9]{64}$'), add column upload_capability_expires_at timestamptz;
create or replace function public.trimax_submit_public_service_request(p_slug text,p_payload jsonb,p_idempotency_hash text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare settings public.public_scheduling_settings; kind public.public_service_request_types; saved public.public_service_requests; payload_hash_value text; requested date; k text;
begin
 if jsonb_typeof(p_payload)<>'object' or p_idempotency_hash !~ '^[a-f0-9]{64}$' or p_capability_hash !~ '^[a-f0-9]{64}$' or p_idempotency_hash is null or p_capability_hash is null then raise exception 'Invalid request identity'; end if;
 for k in select jsonb_object_keys(p_payload) loop if k<>all(array['requestTypeId','customerName','phone','email','preferredContact','address','description','preferredDate','timeWindowId','flexibility','urgency','notes','consent','smsConsent','smsDisclosureVersion','uploadCapabilityHash']) then raise exception 'Unexpected request field'; end if; end loop;
 if p_payload ? 'smsConsent' and jsonb_typeof(p_payload->'smsConsent')<>'boolean' then raise exception 'Invalid SMS consent'; end if;
 if p_payload->'smsConsent'='true'::jsonb and p_payload->>'smsDisclosureVersion' is distinct from 'transactional-sms-2026-10-25' then raise exception 'Invalid SMS disclosure'; end if;
 if p_payload ? 'uploadCapabilityHash' and (jsonb_typeof(p_payload->'uploadCapabilityHash') is distinct from 'string' or p_payload->>'uploadCapabilityHash' !~ '^[a-f0-9]{64}$') then raise exception 'Invalid photo capability'; end if;
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
  insert into public.public_service_requests(business_id,request_type_id,public_reference,idempotency_hash,payload_hash,customer_name,phone,email,preferred_contact,service_address,description,preferred_date,time_window_id,flexibility,urgency,customer_notes,contact_consent_at,sms_consent_at,sms_consent_version,sms_consent_source,status_capability_hash,capability_expires_at)
  values(settings.business_id,kind.id,'REQ-'||replace(gen_random_uuid()::text,'-',''),p_idempotency_hash,payload_hash_value,btrim(p_payload->>'customerName'),p_payload->>'phone',lower(p_payload->>'email'),p_payload->>'preferredContact',btrim(p_payload->>'address'),btrim(p_payload->>'description'),requested,nullif(p_payload->>'timeWindowId',''),p_payload->>'flexibility',p_payload->>'urgency',p_payload->>'notes',now(),case when p_payload->'smsConsent'='true'::jsonb then now() end,case when p_payload->'smsConsent'='true'::jsonb then p_payload->>'smsDisclosureVersion' end,case when p_payload->'smsConsent'='true'::jsonb then 'public-web' end,p_capability_hash,now()+interval '90 days') returning * into saved;
  if p_payload ? 'uploadCapabilityHash' then update public.public_service_requests set upload_capability_hash=p_payload->>'uploadCapabilityHash',upload_capability_expires_at=now()+interval '30 minutes' where id=saved.id; end if;
  insert into public.public_request_activity(business_id,request_id,event_type,details) values(settings.business_id,saved.id,'request_received','{}');
  insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,idempotency_key)
  values(settings.business_id,saved.id,'new_request','in-app','internal','workspace-owners','public-request-received','received:'||saved.id::text);
 end if;
 return jsonb_build_object('id',saved.id,'reference',saved.public_reference,'status',saved.status,'submittedAt',saved.submitted_at);
end $$;
-- REVIEW ONLY. New private bucket must be provisioned separately; no storage changes here.
create table public.request_photos(
 id uuid primary key, request_id uuid not null, business_id uuid not null,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'), input_bytes integer not null check(input_bytes between 1 and 5242880),
 state text not null default 'reserved' check(state in ('reserved','complete')), created_at timestamptz not null default now(),
 object_key text not null unique, output_hash text, width integer, height integer,
 foreign key(business_id,request_id) references public.public_service_requests(business_id,id),
 check((state='reserved' and output_hash is null and width is null and height is null) or (state='complete' and output_hash is not null and width is not null and height is not null and output_hash ~ '^[a-f0-9]{64}$' and width>0 and height>0))
);
alter table public.request_photos enable row level security;
alter table public.request_photos force row level security;
revoke all on public.request_photos from public,anon,authenticated,trimax_scheduling_web,service_role;
grant select on public.request_photos to service_role;
-- Server-only entrypoints. Website role retains its existing two RPCs; no photo grants.
create function public.trimax_reserve_request_photo(p_request uuid,p_hash text,p_upload uuid,p_input_hash text,p_bytes integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.public_service_requests; saved public.request_photos; n integer; bytes bigint;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or p_upload is null or p_bytes is null or p_bytes not between 1 and 5242880 then raise exception 'Photo rejected'; end if;
 select * into r from public.public_service_requests where id=p_request for update;
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
create function public.trimax_complete_request_photo(p_request uuid,p_hash text,p_upload uuid,p_output_hash text,p_width integer,p_height integer) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.public_service_requests; saved public.request_photos;
begin
 select * into r from public.public_service_requests where id=p_request for update;
 if not found or r.upload_capability_hash is distinct from p_hash or p_hash is null or r.upload_capability_expires_at<=now() or r.upload_capability_expires_at is null then raise exception 'Photo rejected';end if;
 if p_output_hash is null or p_output_hash !~ '^[a-f0-9]{64}$' or p_width is null or p_height is null or p_width<1 or p_height<1 or p_width::bigint*p_height>24000000 then raise exception 'Photo rejected';end if;
 select * into saved from public.request_photos where id=p_upload and request_id=r.id and business_id=r.business_id for update;
 if not found then raise exception 'Photo rejected';end if;
 if saved.state='complete' and (saved.output_hash<>p_output_hash or saved.width<>p_width or saved.height<>p_height) then raise exception 'Photo rejected';end if;
 update public.request_photos set state='complete',output_hash=p_output_hash,width=p_width,height=p_height where id=saved.id;
end $$;
revoke all on function public.trimax_reserve_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_request_photo(uuid,text,uuid,text,integer,integer) from public,anon,authenticated,trimax_scheduling_web;
grant execute on function public.trimax_reserve_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_request_photo(uuid,text,uuid,text,integer,integer) to service_role;

commit;
