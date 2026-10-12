-- Isolated Phase 2 foundation ONLY; never applied by application startup.
begin;
do $$ begin if not exists(select 1 from pg_roles where rolname='trimax_scheduling_intake') then create role trimax_scheduling_intake nologin noinherit; end if; end $$;
grant usage on schema public to trimax_scheduling_intake;
alter table public.public_service_requests drop constraint public_service_requests_status_check;
alter table public.public_service_requests add constraint public_service_requests_status_check check(status in ('pending_confirmation','reviewing','needs_information','approved','rejected','cancelled','converted'));
alter table public.public_service_requests add column revision integer not null default 1;
alter table public.public_service_requests add column status_capability_hash text check(status_capability_hash ~ '^[a-f0-9]{64}$');
alter table public.public_service_requests add column capability_expires_at timestamptz;
alter table public.public_service_requests add column capability_revoked_at timestamptz;
create unique index public_request_capability_unique on public.public_service_requests(status_capability_hash) where status_capability_hash is not null;
alter table public.public_scheduling_settings add column accent_token text not null default 'forest' check(accent_token in ('forest','ocean','clay'));
create table public.public_scheduling_outbox (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,request_id uuid not null,
 event_type text not null,channel text not null check(channel in ('sms','email','in-app')),
 audience text not null check(audience in ('customer','internal')),recipient text not null,
 template text not null,parameters jsonb not null default '{}',consent_reference text,
 idempotency_key text not null,status text not null default 'pending' check(status in ('pending','leased','retry','delivered','dead_letter')),
 scheduled_for timestamptz not null default now(),next_attempt_at timestamptz not null default now(),attempts integer not null default 0 check(attempts>=0),
 lease_expires_at timestamptz,provider_message_id text,last_error_code text,created_at timestamptz not null default now(),
 foreign key(business_id,request_id) references public.public_service_requests(business_id,id),
 unique(business_id,idempotency_key),
 check(channel<>'sms' or consent_reference is not null),check(audience<>'customer' or channel='in-app' or consent_reference is not null)
);
alter table public.public_scheduling_outbox enable row level security;
revoke all on public.public_scheduling_outbox from public,anon,authenticated,trimax_scheduling_intake;
grant select on public.public_scheduling_outbox to authenticated;
create policy scheduling_outbox_owner_read on public.public_scheduling_outbox for select to authenticated using(exists(select 1 from public.business_users m where m.business_id=public_scheduling_outbox.business_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
create index public_scheduling_outbox_due on public.public_scheduling_outbox(status,next_attempt_at);
create function public.trimax_submit_public_service_request(p_slug text,p_payload jsonb,p_idempotency_hash text,p_capability_hash text) returns jsonb
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
 if p_payload->>'preferredContact' not in ('phone','sms','email') or p_payload->>'flexibility' not in ('fixed','preferred','flexible') or p_payload->>'urgency' not in ('routine','soon','urgent') then raise exception 'Invalid request values'; end if;
 if p_payload->>'email'<>'' and p_payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 if p_payload->>'preferredContact'='email' and p_payload->>'email'='' then raise exception 'Email required'; end if;
 if (p_payload->>'phone'<>'' or p_payload->>'preferredContact' in ('phone','sms')) and (p_payload->>'phone' !~ '^\+?[0-9 ().-]{7,40}$' or length(regexp_replace(p_payload->>'phone','[^0-9]','','g'))<7) then raise exception 'Invalid phone'; end if;
 if p_payload->>'timeWindowId'<>'' and not exists(select 1 from jsonb_array_elements(settings.appointment_windows) w where w->>'id'=p_payload->>'timeWindowId') then raise exception 'Invalid time window'; end if;
 if p_payload->>'preferredDate'<>'' then
  if p_payload->>'preferredDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date'; end if;
  requested=(p_payload->>'preferredDate')::date;
  if not kind.scheduling_eligible or requested<(now() at time zone settings.time_zone)::date+ceil(settings.minimum_lead_hours::numeric/24)::integer+1 or requested>(now() at time zone settings.time_zone)::date+settings.maximum_horizon_days or not extract(dow from requested)::integer=any(settings.available_weekdays) or requested=any(settings.blocked_dates) then raise exception 'Requested date unavailable'; end if;
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
revoke all on function public.trimax_submit_public_service_request(text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.trimax_submit_public_service_request(text,jsonb,text,text) to trimax_scheduling_intake;
-- No direct table grants to intake role; no credential provisioning or role membership.
alter table public.public_request_activity add column mutation_id text;
create unique index public_request_review_mutation on public.public_request_activity(business_id,request_id,mutation_id) where mutation_id is not null;
create function public.trimax_review_public_service_request(p_request_id uuid,p_revision integer,p_status text,p_internal_notes text,p_mutation_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.public_service_requests; actor uuid; previous_mutation jsonb; mutation_hash text; mutation_result jsonb; previous_status text;
begin
 actor=auth.uid();if actor is null then raise exception 'Not authorized'; end if;
 select * into saved from public.public_service_requests where id=p_request_id for update;
 if not found or not exists(select 1 from public.business_users where business_id=saved.business_id and user_id=actor and role in ('owner','admin')) then raise exception 'Not authorized'; end if;
 if p_mutation_id is null or p_mutation_id !~ '^[A-Za-z0-9_-]{16,100}$' then raise exception 'Invalid mutation identity'; end if;
 mutation_hash=encode(sha256(convert_to(jsonb_build_object('revision',p_revision,'status',p_status,'notes',p_internal_notes)::text,'UTF8')),'hex');
 select details into previous_mutation from public.public_request_activity where business_id=saved.business_id and request_id=saved.id and mutation_id=p_mutation_id;
 if found then if previous_mutation->>'hash'<>mutation_hash then raise exception 'Mutation conflict'; end if; return previous_mutation->'result'; end if;
 if saved.revision<>p_revision then raise exception 'Stale revision'; end if;
 if p_status not in ('pending_confirmation','reviewing','approved','needs_information','rejected','cancelled') or p_status is null or p_internal_notes is null or length(p_internal_notes)>5000 then raise exception 'Invalid review'; end if;
 if saved.status in ('rejected','cancelled','converted') and p_status<>saved.status then raise exception 'Terminal request'; end if;
 previous_status=saved.status;
 update public.public_service_requests set status=p_status,internal_notes=case when btrim(p_internal_notes)='' then internal_notes when internal_notes='' then p_internal_notes else internal_notes||E'\n'||p_internal_notes end,revision=revision+1 where id=saved.id returning * into saved;
 mutation_result=jsonb_build_object('id',saved.id,'status',saved.status,'revision',saved.revision);
 insert into public.public_request_activity(business_id,request_id,event_type,actor_id,mutation_id,details) values(saved.business_id,saved.id,'review_updated',actor,p_mutation_id,jsonb_build_object('fromStatus',previous_status,'toStatus',p_status,'note',p_internal_notes,'revision',saved.revision,'hash',mutation_hash,'result',mutation_result));
 return mutation_result;
end $$;
revoke all on function public.trimax_review_public_service_request(uuid,integer,text,text,text) from public,anon,trimax_scheduling_intake;
grant execute on function public.trimax_review_public_service_request(uuid,integer,text,text,text) to authenticated;
create function public.trimax_public_request_status(p_slug text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.public_service_requests;
begin
 if p_capability_hash is null or p_capability_hash !~ '^[a-f0-9]{64}$' then return null; end if;
 select r.* into saved from public.public_service_requests r join public.public_scheduling_settings s on s.business_id=r.business_id where s.public_slug=p_slug and r.status_capability_hash=p_capability_hash and r.capability_expires_at>now() and r.capability_revoked_at is null;
 if not found then return null; end if;
 return jsonb_build_object('reference',saved.public_reference,'status',case saved.status when 'pending_confirmation' then 'received' when 'approved' then case when saved.confirmation_status='confirmed' then 'confirmed' else 'under_review' end when 'needs_information' then 'needs_information' when 'cancelled' then 'cancelled' when 'rejected' then 'cancelled' else 'under_review' end,'submittedAt',saved.submitted_at);
end $$;
revoke all on function public.trimax_public_request_status(text,text) from public,anon,authenticated;
grant execute on function public.trimax_public_request_status(text,text) to trimax_scheduling_intake;
commit;
