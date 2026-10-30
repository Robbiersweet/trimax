-- Focused Office Apartment Turn contact policy. No tables, grants, existing rows,
-- Queue conversion, photos, ordinary public intake or delivery settings changed.
begin;
-- Private helper uses the same intake validation/idempotency/photo/notice path,
-- allowing absent office contacts only after the Office QR wrapper validates scope.
create function public.trimax_submit_office_turn_request(p_slug text,p_payload jsonb,p_idempotency_hash text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare settings public.public_scheduling_settings; kind public.public_service_request_types; saved public.public_service_requests; payload_hash_value text; requested date; k text;
begin
 if p_payload->'smsConsent'='true'::jsonb or p_payload->>'preferredContact'='sms' then raise exception 'Office follow-up never enrolls an employee for SMS';end if;
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
 if p_payload->>'phone'<>'' and (p_payload->>'phone' !~ '^\+?[0-9 ().-]{7,40}$' or length(regexp_replace(p_payload->>'phone','[^0-9]','','g'))<7) then raise exception 'Invalid phone'; end if;
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
revoke all on function public.trimax_submit_office_turn_request(text,jsonb,text,text) from public,anon,authenticated,service_role,trimax_scheduling_web,trimax_scheduling_intake;
create or replace function public.trimax_submit_maintenance_qr(p_label_id uuid,p_payload jsonb,p_key text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare q public.maintenance_qr_labels;s public.public_scheduling_settings;r jsonb;bound_payload jsonb;u text;area text;addr text;turn jsonb;office_phone text='';office_email text='';office_contacts integer;office_source text='unavailable';
begin
 select * into q from public.maintenance_qr_labels where id=p_label_id and active for share;
 if not found then raise exception 'Label unavailable';end if;
 select * into s from public.public_scheduling_settings where business_id=q.business_id and enabled for share;
 if not found or p_key !~ '^[A-Za-z0-9_-]{16,100}$' or p_key is null then raise exception 'Intake unavailable';end if;
 u=q.unit;area='';addr=q.service_address;
 if q.scope='property' then
  if jsonb_typeof(p_payload->'unit') is distinct from 'string' or (p_payload ? 'specificArea' and jsonb_typeof(p_payload->'specificArea') is distinct from 'string') then raise exception 'Enter a unit';end if;
  u=btrim(p_payload->>'unit');area=btrim(coalesce(p_payload->>'specificArea',''));
  select address into addr from public.trimax_qr_property_choices(q.business_id) where lower(btrim(property))=lower(btrim(q.property_name));
  if addr is null then raise exception 'Property unavailable';end if;
 end if;
 if length(coalesce(u,'')) not between 1 and 100 or length(area)>100 or (u||area) ~ '[[:cntrl:]]' then raise exception 'Enter a valid unit and specific area';end if;
 if p_payload ? 'apartmentTurn' then
  if q.scope<>'property' then raise exception 'Apartment turns require an Office QR';end if;
  turn=public.trimax_validate_apartment_turn(p_payload->'apartmentTurn');
 end if;
 bound_payload=(p_payload-'unit'-'specificArea'-'apartmentTurn')||jsonb_build_object('address',addr||', Unit '||u);
 if turn is not null then
  -- Only saved property client records; never tenant records or employee input.
  select count(*),min(phone),min(email) into office_contacts,office_phone,office_email from (
   select distinct
    case when btrim(coalesce(c.phone,'')) ~ '^\+?[0-9 ().-]{7,40}$' and length(regexp_replace(c.phone,'[^0-9]','','g'))>=7 then btrim(c.phone) else '' end phone,
    case when btrim(coalesce(c.email,'')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(btrim(c.email))<=254 then lower(btrim(c.email)) else '' end email
   from public.clients c where c.business_id=q.business_id and (
    lower(btrim(c.name))=lower(btrim(q.property_name)) or exists(select 1 from public.property_users a where a.business_id=q.business_id and not a.is_test_fixture and lower(btrim(a.property_name))=lower(btrim(q.property_name)) and a.request_client_id=c.id)
   )
  ) contacts;
  if office_contacts<>1 then office_phone='';office_email='';end if;
  office_phone=coalesce(office_phone,'');office_email=coalesce(office_email,'');
  if office_phone<>'' or office_email<>'' then office_source='saved-property-office';end if;
  bound_payload=(bound_payload-'smsConsent'-'smsDisclosureVersion')||jsonb_build_object('phone',office_phone,'email',office_email,'preferredContact',case when office_email<>'' then 'email' else 'phone' end);
  r=public.trimax_submit_office_turn_request(s.public_slug,bound_payload,encode(sha256(convert_to('qr:'||q.id::text||':'||p_key,'UTF8')),'hex'),p_capability_hash);
 else
 r=public.trimax_submit_public_service_request(s.public_slug,bound_payload,encode(sha256(convert_to('qr:'||q.id::text||':'||p_key,'UTF8')),'hex'),p_capability_hash);
 end if;
 if exists(select 1 from public.maintenance_qr_requests b join public.public_service_requests x on x.id=b.request_id where b.request_id=(r->>'id')::uuid and coalesce(x.integration_references->>'specificArea','') is distinct from area) then raise exception 'Idempotency conflict';end if;
 if exists(select 1 from public.maintenance_qr_requests b join public.public_service_requests x on x.id=b.request_id where b.request_id=(r->>'id')::uuid and coalesce(x.integration_references->'apartmentTurn','null'::jsonb) is distinct from coalesce(turn,'null'::jsonb)) then raise exception 'Idempotency conflict';end if;
 insert into public.maintenance_qr_requests(request_id,label_id) values((r->>'id')::uuid,q.id) on conflict(request_id) do nothing;
 update public.public_service_requests set integration_references=coalesce(integration_references,'{}'::jsonb)||jsonb_build_object('maintenanceQrId',q.id,'property',q.property_name,'propertyUnit',u,'specificArea',area)||case when turn is not null then jsonb_build_object('apartmentTurn',turn,'submittedBy',btrim(p_payload->>'customerName'),'submitterIdentity','self-reported','followUpContactRole','property-office','followUpContactSource',office_source) else '{}'::jsonb end where id=(r->>'id')::uuid and business_id=q.business_id;
 return r;
end $$;
notify pgrst,'reload schema';
commit;
