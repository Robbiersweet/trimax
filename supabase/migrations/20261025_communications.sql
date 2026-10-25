-- Candidate only. No extension, scheduler, credential, provider activation or backfill.
-- Separate outbox reuses the existing lease/CAS pattern: the request outbox requires
-- request_id and cannot represent invoice/payment communications for existing clients.
begin;
alter table public.public_service_requests add column sms_consent_at timestamptz,
 add column sms_consent_version text, add column sms_consent_source text;

create table public.communication_settings (
 business_id uuid primary key references public.businesses(id), enabled boolean not null default false,enabled_at timestamptz,
 provider text not null default 'test' check(provider in ('test','twilio')),
 sender text not null default '', account_sid text not null default '', credential_key text not null default '',
 display_name text not null default 'Your service team', time_zone text not null default 'America/Los_Angeles',
 quiet_start integer not null default 20 check(quiet_start between 0 and 23),quiet_end integer not null default 8 check(quiet_end between 0 and 23),
 monthly_limit integer not null default 500 check(monthly_limit between 0 and 100000),
 estimated_segment_cost numeric(10,6) not null default 0 check(estimated_segment_cost>=0),
 milestones text[] not null default array['request_received','approved','appointment_scheduled','appointment_rescheduled','appointment_cancelled','reminder_24h','reminder_1h','estimate_sent','invoice_sent','payment_received'],
 updated_at timestamptz not null default now(),check(quiet_start<>quiet_end)
);
create unique index communication_sender_unique on public.communication_settings(provider,account_sid,sender) where sender<>'';
create function public.trimax_sms_activation_boundary() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.enabled and (tg_op='INSERT' or not old.enabled) then new.enabled_at=now();
 elsif not new.enabled then new.enabled_at=null;
 else new.enabled_at=old.enabled_at;end if;return new;
end $$;
create trigger communication_activation_boundary before insert or update on public.communication_settings for each row execute function public.trimax_sms_activation_boundary();
create table public.communication_consent (
 business_id uuid not null references public.businesses(id),phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 opted_in_at timestamptz,disclosure_version text,source text, suppressed_at timestamptz, suppression_reason text,
 request_id uuid,client_id uuid,updated_at timestamptz not null default now(),primary key(business_id,phone)
);
create table public.communication_messages (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),
 request_id uuid,client_id uuid,queue_id text,entity_type text,entity_id uuid,
 direction text not null default 'outbound' check(direction in ('outbound','inbound')),
 event_type text not null, idempotency_key text not null,recipient text not null,
 status text not null default 'pending' check(status in ('pending','leased','retry','accepted','sent','delivered','failed','suppressed','superseded','uncertain','received')),
 scheduled_for timestamptz not null default now(),next_attempt_at timestamptz not null default now(),
 appointment_start timestamptz,appointment_end timestamptz,
 attempts integer not null default 0,lease_token uuid,lease_expires_at timestamptz,
 provider_message_id text,provider text,simulated boolean not null default false,accepted_at timestamptz,
 body text,estimated_segments integer,estimated_cost numeric(12,6),actual_cost numeric(12,6),
 error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,idempotency_key),foreign key(business_id,recipient) references public.communication_consent(business_id,phone)
);
create unique index communication_provider_unique on public.communication_messages(provider,provider_message_id) where provider_message_id is not null;
create index communication_due on public.communication_messages(status,next_attempt_at,scheduled_for);
create table public.communication_audit (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),
 message_id uuid references public.communication_messages(id),event_type text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.communication_webhook_receipts (
 provider text not null,event_key text not null,business_id uuid not null references public.businesses(id),created_at timestamptz not null default now(),primary key(provider,event_key)
);
create table public.communication_links (
 token_hash text primary key, business_id uuid not null references public.businesses(id),message_id uuid not null references public.communication_messages(id),
 expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now()
);
create table public.communication_owner_alerts (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),message_id uuid not null references public.communication_messages(id),
 kind text not null,created_at timestamptz not null default now(),unique(message_id,kind)
);

create function public.trimax_normalize_sms_phone(p text) returns text language sql immutable set search_path=pg_catalog as $$
 select case when x ~ '^\+[1-9][0-9]{7,14}$' then x when x ~ '^[0-9]{10}$' then '+1'||x when x ~ '^1[0-9]{10}$' then '+'||x end from (select regexp_replace(p,'[ ().-]','','g') x) s
$$;
create function public.trimax_capture_sms_consent() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare phone_normal text;
begin
 if new.sms_consent_at is null then return new;end if;
 if new.sms_consent_version is distinct from 'transactional-sms-2026-10-25' or new.sms_consent_source is distinct from 'public-web' then raise exception 'Invalid SMS consent evidence';end if;
 phone_normal=public.trimax_normalize_sms_phone(new.phone);if phone_normal is null then raise exception 'SMS requires valid phone';end if;
 insert into public.communication_consent(business_id,phone,opted_in_at,disclosure_version,source,request_id)
 values(new.business_id,phone_normal,new.sms_consent_at,new.sms_consent_version,new.sms_consent_source,new.id)
 on conflict(business_id,phone) do update set opted_in_at=excluded.opted_in_at,disclosure_version=excluded.disclosure_version,source=excluded.source,request_id=excluded.request_id,updated_at=now();
 -- Web consent never clears a carrier/STOP suppression. Only verified START does.
 insert into public.communication_audit(business_id,event_type,details) values(new.business_id,'consent_recorded',jsonb_build_object('requestId',new.id,'version',new.sms_consent_version));
 return new;
end $$;
create trigger communication_capture_consent after insert on public.public_service_requests for each row execute function public.trimax_capture_sms_consent();

create function public.trimax_sms_request_event() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests;q public.queue_items;k text;phone_normal text;offset_hours integer;
begin
 select * into r from public.public_service_requests where id=new.request_id and business_id=new.business_id;
 phone_normal=public.trimax_normalize_sms_phone(r.phone);
 if not exists(select 1 from public.communication_consent where business_id=r.business_id and phone=phone_normal and opted_in_at is not null) then return new;end if;
 update public.communication_consent set client_id=r.client_id where business_id=r.business_id and phone=phone_normal and r.client_id is not null;
 k=case when new.event_type in ('request_received','appointment_scheduled','appointment_rescheduled','appointment_cancelled') then new.event_type when new.event_type='review_updated' and new.details->>'toStatus'='approved' and new.details->>'fromStatus' is distinct from 'approved' then 'approved' end;
 if k is null then return new;end if;
 select * into q from public.queue_items where id=r.queue_item_id and business_id=r.business_id;
 if k like 'appointment_%' then
 update public.communication_messages set status='superseded',updated_at=now() where business_id=r.business_id and request_id=r.id and status in ('pending','retry') and event_type in ('reminder_24h','reminder_1h','appointment_scheduled','appointment_rescheduled','appointment_cancelled');
 end if;
 insert into public.communication_messages(business_id,request_id,client_id,queue_id,event_type,idempotency_key,recipient,appointment_start,appointment_end)
 values(r.business_id,r.id,r.client_id,q.id,k,'request-event:'||new.id::text,phone_normal,q.appointment_start,q.appointment_end) on conflict do nothing;
 if k in ('appointment_scheduled','appointment_rescheduled') and q.appointment_start>now() then
 foreach offset_hours in array array[24,1] loop
 if q.appointment_start-make_interval(hours=>offset_hours)>now() then
 insert into public.communication_messages(business_id,request_id,client_id,queue_id,event_type,idempotency_key,recipient,appointment_start,appointment_end,scheduled_for)
 values(r.business_id,r.id,r.client_id,q.id,'reminder_'||offset_hours||'h','reminder:'||new.id::text||':'||offset_hours,phone_normal,q.appointment_start,q.appointment_end,q.appointment_start-make_interval(hours=>offset_hours)) on conflict do nothing;
 end if;end loop;end if;
 return new;
end $$;
create trigger communication_request_event after insert on public.public_request_activity for each row execute function public.trimax_sms_request_event();

-- Observe successful existing send/payment audit events, never page views or drafts.
-- Financial tables and reconciliation logic are not changed.
create function public.trimax_sms_document_event() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare document jsonb;customer public.clients;kind text;phone_normal text;entity_kind text;
begin
 if new.action='estimate.email_sent' and new.details->>'delivery_status'='sent' then
 select to_jsonb(e) into document from public.estimates e where e.id=new.entity_id and e.business_id=new.business_id and lower(e.status)='sent';kind='estimate_sent';entity_kind='estimate';
 elsif new.action in ('invoice.email_sent','invoice.split_group_email_sent') and new.details->>'delivery_status'='sent' then
 select to_jsonb(i) into document from public.invoices i where i.id=new.entity_id and i.business_id=new.business_id and lower(i.status) in ('sent','paid','partial','overdue');kind='invoice_sent';entity_kind='invoice';
 elsif new.action='invoice.batch_payment_applied' and jsonb_typeof(new.details->'amountApplied')='number' and jsonb_typeof(new.details->'resultingAmountPaid')='number' and (new.details->>'amountApplied')::numeric>0 then
 select to_jsonb(i) into document from public.invoices i where i.id=new.entity_id and i.business_id=new.business_id and i.amount_paid>0 and i.amount_paid>=(new.details->>'resultingAmountPaid')::numeric;kind='payment_received';entity_kind='invoice';
 else return new;end if;
 if document is null then return new;end if;
 select * into customer from public.clients where id=(document->>'client_id')::uuid and business_id=new.business_id;
 phone_normal=public.trimax_normalize_sms_phone(customer.phone);
 if not exists(select 1 from public.communication_consent where business_id=new.business_id and phone=phone_normal and client_id=customer.id and opted_in_at is not null) then return new;end if;
 insert into public.communication_messages(business_id,client_id,entity_type,entity_id,event_type,idempotency_key,recipient)
 values(new.business_id,customer.id,entity_kind,new.entity_id,kind,'document-event:'||new.id::text,phone_normal) on conflict do nothing;
 return new;
end $$;
create trigger communication_document_event after insert on public.activity_logs for each row execute function public.trimax_sms_document_event();

create function public.trimax_sms_owner_push() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare m public.communication_messages;slug text;
begin
 select * into m from public.communication_messages where id=new.message_id and business_id=new.business_id;
 if m.request_id is null then return new;end if;
 select public_slug into slug from public.public_scheduling_settings where business_id=new.business_id;
 insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,idempotency_key)
 select new.business_id,m.request_id,new.kind,'push','internal',p.id::text,'communications',jsonb_build_object('slug',slug),'communication-alert:'||new.id::text||':'||p.id::text
 from public.push_subscriptions p where p.business_id=new.business_id and p.status='active' and exists(select 1 from public.business_users u where u.business_id=new.business_id and u.user_id=p.user_id and u.role in ('owner','admin')) on conflict do nothing;
 return new;
end $$;
create trigger communication_owner_push after insert on public.communication_owner_alerts for each row execute function public.trimax_sms_owner_push();

create function public.trimax_claim_sms(p_test boolean default true) returns setof public.communication_messages language plpgsql security definer set search_path=pg_catalog as $$
begin
 -- Unknown provider outcome requires reconciliation, not automatic duplicate delivery.
 with expired as (update public.communication_messages set status='uncertain',error_code='expired_send_lease',lease_token=null,lease_expires_at=null,updated_at=now() where status='leased' and lease_expires_at<now() returning id,business_id)
 insert into public.communication_owner_alerts(business_id,message_id,kind) select business_id,id,'delivery_issue' from expired on conflict do nothing;
 return query with due as (
 select m.id from public.communication_messages m join public.communication_settings s on s.business_id=m.business_id
 where s.enabled and m.created_at>=s.enabled_at and (p_test or s.provider<>'test') and m.direction='outbound' and m.status in ('pending','retry')
 and m.event_type=any(s.milestones) and m.scheduled_for<=now() and m.next_attempt_at<=now() and m.attempts<5
 order by m.created_at for update of m skip locked limit 4
 ) update public.communication_messages m set status='leased',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() from due where m.id=due.id returning m.*;
end $$;

create function public.trimax_prepare_sms(p_id uuid,p_lease uuid,p_test boolean default true) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare m public.communication_messages;s public.communication_settings;c public.communication_consent;q public.queue_items;local_time timestamp;next_time timestamp;used integer;
begin
 select * into m from public.communication_messages where id=p_id and lease_token=p_lease and status='leased' for update;
 if not found then return null;end if;
 select * into s from public.communication_settings where business_id=m.business_id;
 select * into c from public.communication_consent where business_id=m.business_id and phone=m.recipient;
 if not s.enabled or c.opted_in_at is null or c.suppressed_at is not null or not(m.event_type=any(s.milestones)) then
 update public.communication_messages set status='suppressed',error_code='consent_or_workspace_disabled',lease_token=null,lease_expires_at=null where id=m.id;return null;end if;
 if (m.request_id is not null and not exists(select 1 from public.public_service_requests r where r.id=m.request_id and r.business_id=m.business_id and public.trimax_normalize_sms_phone(r.phone)=m.recipient)) or (m.entity_id is not null and not exists(select 1 from public.clients x where x.id=m.client_id and x.business_id=m.business_id and public.trimax_normalize_sms_phone(x.phone)=m.recipient)) then
 update public.communication_messages set status='suppressed',error_code='recipient_changed',lease_token=null,lease_expires_at=null where id=m.id;return null;end if;
 if m.event_type='appointment_cancelled' and exists(select 1 from public.queue_items where id=m.queue_id and business_id=m.business_id and appointment_start is not null) then
 update public.communication_messages set status='superseded',error_code='appointment_restored',lease_token=null,lease_expires_at=null where id=m.id;return null;end if;
 if m.event_type in ('reminder_24h','reminder_1h','appointment_scheduled','appointment_rescheduled') then
 select * into q from public.queue_items where id=m.queue_id and business_id=m.business_id;
 if q.appointment_start is distinct from m.appointment_start or q.appointment_end is distinct from m.appointment_end or q.appointment_start<=now() or q.completed_date is not null then
 update public.communication_messages set status='superseded',error_code='appointment_changed',lease_token=null,lease_expires_at=null where id=m.id;return null;end if;end if;
 local_time=now() at time zone s.time_zone;
 if (s.quiet_start>s.quiet_end and (extract(hour from local_time)>=s.quiet_start or extract(hour from local_time)<s.quiet_end)) or (s.quiet_start<s.quiet_end and extract(hour from local_time)>=s.quiet_start and extract(hour from local_time)<s.quiet_end) then
 next_time=date_trunc('day',local_time)+make_interval(hours=>s.quiet_end);
 if next_time<=local_time then next_time=next_time+interval '1 day';end if;
 update public.communication_messages set status='retry',next_attempt_at=next_time at time zone s.time_zone,attempts=greatest(0,attempts-1),lease_token=null,lease_expires_at=null where id=m.id;return null;end if;
 select count(*) into used from public.communication_messages where business_id=m.business_id and direction='outbound' and coalesce(accepted_at,updated_at)>=date_trunc('month',now()) and id<>m.id and (status in ('accepted','sent','delivered','uncertain') or (status='leased' and (created_at,id)<(m.created_at,m.id)));
 if used>=s.monthly_limit then update public.communication_messages set status='retry',next_attempt_at=date_trunc('month',now())+interval '1 month',attempts=greatest(0,attempts-1),error_code='monthly_limit',lease_token=null,lease_expires_at=null where id=m.id;return null;end if;
 return jsonb_build_object('message',to_jsonb(m),'settings',to_jsonb(s));
end $$;

create function public.trimax_sms_usage(p_business uuid) returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('month',date_trunc('month',now()),'accepted',count(*) filter(where status in ('accepted','sent','delivered')),'delivered',count(*) filter(where status='delivered'),'failed',count(*) filter(where status in ('failed','uncertain')),'simulated',count(*) filter(where simulated),'estimatedSegments',coalesce(sum(estimated_segments),0),'estimatedCost',coalesce(sum(estimated_cost),0),'actualCost',sum(actual_cost))
 from public.communication_messages where business_id=p_business and direction='outbound' and coalesce(accepted_at,updated_at)>=date_trunc('month',now())
$$;
revoke all on function public.trimax_sms_usage(uuid) from public,anon;
grant execute on function public.trimax_sms_usage(uuid) to authenticated;

create function public.trimax_update_sms_preferences(p_business uuid,p_start integer,p_end integer,p_zone text,p_limit integer,p_milestones text[]) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.business_users where business_id=p_business and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Not authorized';end if;
 if not exists(select 1 from pg_timezone_names where name=p_zone) or p_start not between 0 and 23 or p_end not between 0 and 23 or p_start=p_end or p_limit not between 0 and 100000 or p_milestones is null or not(p_milestones<@array['request_received','approved','appointment_scheduled','appointment_rescheduled','appointment_cancelled','reminder_24h','reminder_1h','estimate_sent','invoice_sent','payment_received']) then raise exception 'Invalid preferences';end if;
 insert into public.communication_settings(business_id) values(p_business) on conflict do nothing;
 update public.communication_settings set quiet_start=p_start,quiet_end=p_end,time_zone=p_zone,monthly_limit=p_limit,milestones=p_milestones,updated_at=now() where business_id=p_business;
 insert into public.communication_audit(business_id,event_type,details) values(p_business,'preferences_updated',jsonb_build_object('actor',auth.uid()));return true;
end $$;
revoke all on function public.trimax_update_sms_preferences(uuid,integer,integer,text,integer,text[]) from public,anon;
grant execute on function public.trimax_update_sms_preferences(uuid,integer,integer,text,integer,text[]) to authenticated;

create function public.trimax_finish_sms(p_id uuid,p_lease uuid,p_reference text,p_body text,p_segments integer,p_simulated boolean,p_error text default null,p_retry boolean default false,p_uncertain boolean default false) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare m public.communication_messages;s public.communication_settings;
begin
 select * into m from public.communication_messages where id=p_id and status='leased' and lease_token=p_lease for update;if not found then return false;end if;
 select * into s from public.communication_settings where business_id=m.business_id;
 if p_error='provider_opted_out' then
 update public.communication_consent set suppressed_at=now(),suppression_reason='provider_opted_out',updated_at=now() where business_id=m.business_id and phone=m.recipient;
 update public.communication_messages set status='suppressed',error_code='provider_opted_out',updated_at=now() where business_id=m.business_id and recipient=m.recipient and status in ('pending','retry');
 end if;
 update public.communication_messages set status=case when p_uncertain then 'uncertain' when p_error is null then 'accepted' when p_retry and attempts<5 then 'retry' else 'failed' end,
 provider=case when p_simulated then 'test' else s.provider end,provider_message_id=p_reference,simulated=p_simulated,accepted_at=case when p_error is null then now() else accepted_at end,body=left(p_body,1600),estimated_segments=p_segments,estimated_cost=case when p_simulated or p_error is not null then 0 else p_segments*s.estimated_segment_cost end,
 error_code=left(p_error,80),next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_token=null,lease_expires_at=null,updated_at=now() where id=m.id;
 insert into public.communication_audit(business_id,message_id,event_type,details) values(m.business_id,m.id,'delivery_attempt',jsonb_build_object('attempt',m.attempts,'simulated',p_simulated,'error',left(p_error,80),'uncertain',p_uncertain));
 if p_error is not null and (not p_retry or m.attempts>=5) then insert into public.communication_owner_alerts(business_id,message_id,kind) values(m.business_id,m.id,'delivery_issue') on conflict do nothing;end if;
 return true;
end $$;

create function public.trimax_sms_webhook(p_business uuid,p_event_key text,p_provider_id text,p_from text,p_to text,p_body text,p_status text,p_optout text,p_error text default null) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s public.communication_settings;m public.communication_messages;c public.communication_consent;phone_normal text;keyword text;new_id uuid;
begin
 select * into s from public.communication_settings where business_id=p_business and provider='twilio';if not found then return false;end if;
 insert into public.communication_webhook_receipts(provider,event_key,business_id) values('twilio',p_event_key,p_business) on conflict do nothing;if not found then return true;end if;
 if p_status is not null then
 select * into m from public.communication_messages where business_id=p_business and provider='twilio' and provider_message_id=p_provider_id for update;
 if not found then raise exception 'Unknown message';end if;
 if p_to<>m.recipient or p_from<>s.sender then raise exception 'Message sender mismatch';end if;
 if p_status in ('sent','delivered','failed','undelivered') and m.status not in ('delivered','failed') and not(m.status='sent' and p_status='sent') then
 update public.communication_messages set status=case when p_status='undelivered' then 'failed' else p_status end,error_code=left(p_error,80),updated_at=now() where id=m.id;
 insert into public.communication_audit(business_id,message_id,event_type,details) values(p_business,m.id,'provider_status',jsonb_build_object('status',p_status,'error',left(p_error,80)));
 if p_status in ('failed','undelivered') then insert into public.communication_owner_alerts(business_id,message_id,kind) values(p_business,m.id,'delivery_issue') on conflict do nothing;end if;end if;
 return true;end if;
 if p_to<>s.sender then raise exception 'Inbound sender mismatch';end if;
 phone_normal=public.trimax_normalize_sms_phone(p_from);if phone_normal is null then raise exception 'Invalid sender';end if;
 insert into public.communication_consent(business_id,phone) values(p_business,phone_normal) on conflict do nothing;
 select * into c from public.communication_consent where business_id=p_business and phone=phone_normal for update;
 keyword=upper(trim(coalesce(nullif(p_optout,''),p_body)));
 if keyword in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT') then
 update public.communication_consent set suppressed_at=now(),suppression_reason='customer_stop',updated_at=now() where business_id=p_business and phone=phone_normal;
 update public.communication_messages set status='suppressed',error_code='customer_stop',updated_at=now() where business_id=p_business and recipient=phone_normal and status in ('pending','retry');
 elsif keyword in ('START','UNSTOP','YES') and c.opted_in_at is not null then
 update public.communication_consent set suppressed_at=null,suppression_reason=null,source='verified-provider-start',updated_at=now() where business_id=p_business and phone=phone_normal;
 end if;
 insert into public.communication_messages(business_id,request_id,client_id,direction,event_type,idempotency_key,recipient,status,provider,provider_message_id,body)
 values(p_business,c.request_id,c.client_id,'inbound',case when keyword in ('HELP','INFO') then 'help' else 'customer_reply' end,'inbound:'||p_provider_id,phone_normal,'received','twilio',p_provider_id,left(p_body,1600)) returning id into new_id;
 insert into public.communication_audit(business_id,message_id,event_type,details) values(p_business,new_id,'inbound_received',jsonb_build_object('keyword',case when keyword in ('STOP','START','HELP','INFO','UNSTOP','YES','QUIT','END','CANCEL','STOPALL','UNSUBSCRIBE','REVOKE','OPTOUT') then keyword else null end));
 insert into public.communication_owner_alerts(business_id,message_id,kind) values(p_business,new_id,'customer_reply') on conflict do nothing;
 return true;
end $$;

-- RLS denies public intake, customers and other workspaces; authenticated writes
-- never activate a sender. Activation remains an explicit reviewed operator step.
do $$ declare t text;f record;begin
 foreach t in array array['communication_settings','communication_consent','communication_messages','communication_audit','communication_webhook_receipts','communication_links','communication_owner_alerts'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if t not in ('communication_links','communication_webhook_receipts') then
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (exists(select 1 from public.business_users b where b.business_id=%I.business_id and b.user_id=auth.uid() and b.role in (''owner'',''admin'')))',t,t);
 end if;end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('trimax_sms_activation_boundary','trimax_normalize_sms_phone','trimax_capture_sms_consent','trimax_sms_request_event','trimax_sms_document_event','trimax_sms_owner_push','trimax_claim_sms','trimax_prepare_sms','trimax_finish_sms','trimax_sms_webhook') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname in ('trimax_claim_sms','trimax_prepare_sms','trimax_finish_sms','trimax_sms_webhook') then execute format('grant execute on function %s to service_role',f.signature);end if;end loop;
end $$;
do $$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where n.nspname='public' and c.relname like 'communication_%' and c.relkind='r' and a.grantee<>c.relowner and not(a.grantee='service_role'::regrole or (a.grantee='authenticated'::regrole and a.privilege_type='SELECT' and c.relname not in ('communication_links','communication_webhook_receipts')))) then raise exception 'Unexpected communications table grants';end if;
end $$;
commit;


