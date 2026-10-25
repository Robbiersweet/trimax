-- Candidate only: capability-authorized replies; no approval or scheduling writes.
begin;
create function public.trimax_customer_link_reply(p_hash text,p_key text,p_body text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare l public.communication_links;m public.communication_messages;r public.public_service_requests;reply_id uuid;
begin
 if p_hash is null or p_key is null or p_hash !~ '^[a-f0-9]{64}$' or p_key !~ '^[a-f0-9]{64}$' or p_body is null or length(trim(p_body)) not between 1 and 1600 then raise exception 'Invalid reply';end if;
 select * into l from public.communication_links where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'Unavailable link';end if;
 select * into m from public.communication_messages where id=l.message_id and business_id=l.business_id and direction='outbound' and event_type='needs_information';
 if not found then raise exception 'Reply unavailable';end if;
 select * into r from public.public_service_requests where id=m.request_id and business_id=l.business_id for update;
 if not found or r.status<>'needs_information' or public.trimax_normalize_sms_phone(r.phone) is distinct from m.recipient then raise exception 'Reply unavailable';end if;
 select id into reply_id from public.communication_messages where business_id=l.business_id and idempotency_key='web-reply:'||p_hash||':'||p_key;
 if found then return reply_id;end if;
 if (select count(*) from public.communication_messages where business_id=l.business_id and request_id=r.id and provider='customer-link' and created_at>now()-interval '1 hour')>=5 then raise exception 'Reply limit reached';end if;
 insert into public.communication_messages(business_id,request_id,client_id,direction,event_type,idempotency_key,recipient,status,provider,body)
 values(l.business_id,r.id,r.client_id,'inbound','customer_reply','web-reply:'||p_hash||':'||p_key,m.recipient,'received','customer-link',trim(p_body)) returning id into reply_id;
 insert into public.communication_audit(business_id,message_id,event_type,details) values(l.business_id,reply_id,'customer_link_reply',jsonb_build_object('requestId',r.id));
 insert into public.communication_owner_alerts(business_id,message_id,kind) values(l.business_id,reply_id,'customer_reply');
 return reply_id;
end $$;
revoke all on function public.trimax_customer_link_reply(text,text,text) from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake;
grant execute on function public.trimax_customer_link_reply(text,text,text) to service_role;
create function public.trimax_sms_information_event() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests;phone_normal text;
begin
 if new.event_type<>'review_updated' or new.details->>'toStatus' is distinct from 'needs_information' or new.details->>'fromStatus'='needs_information' then return new;end if;
 select * into r from public.public_service_requests where id=new.request_id and business_id=new.business_id and status='needs_information';if not found then return new;end if;
 phone_normal=public.trimax_normalize_sms_phone(r.phone);
 if not exists(select 1 from public.communication_consent where business_id=r.business_id and phone=phone_normal and opted_in_at is not null and suppressed_at is null) then return new;end if;
 insert into public.communication_messages(business_id,request_id,client_id,event_type,idempotency_key,recipient)
 values(r.business_id,r.id,r.client_id,'needs_information','information-event:'||new.id,phone_normal) on conflict do nothing;return new;
end $$;
revoke all on function public.trimax_sms_information_event() from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake;
create trigger communication_information_event after insert on public.public_request_activity for each row execute function public.trimax_sms_information_event();
-- Add to the default only. Existing per-business milestone choices stay unchanged.
alter table public.communication_settings alter column milestones set default array['request_received','approved','needs_information','appointment_scheduled','appointment_rescheduled','appointment_cancelled','reminder_24h','reminder_1h','estimate_sent','invoice_sent','payment_received'];
create or replace function public.trimax_prepare_sms(p_id uuid,p_lease uuid,p_test boolean default true) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
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
 if m.queue_id is not null and m.request_id is null and (m.client_id is null or public.trimax_queue_sms_client(m.business_id,m.queue_id,m.recipient) is distinct from m.client_id) then
 update public.communication_messages set status='suppressed',error_code='recipient_changed',lease_token=null,lease_expires_at=null where id=m.id;return null;end if;
 if m.event_type='needs_information' and not exists(select 1 from public.public_service_requests where id=m.request_id and business_id=m.business_id and status='needs_information') then
 update public.communication_messages set status='superseded',error_code='request_changed',lease_token=null,lease_expires_at=null where id=m.id;return null;end if;
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
create or replace function public.trimax_update_sms_preferences(p_business uuid,p_start integer,p_end integer,p_zone text,p_limit integer,p_milestones text[]) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.business_users where business_id=p_business and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Not authorized';end if;
 if not exists(select 1 from pg_timezone_names where name=p_zone) or p_start not between 0 and 23 or p_end not between 0 and 23 or p_start=p_end or p_limit not between 0 and 100000 or p_milestones is null or not(p_milestones<@array['request_received','approved','needs_information','appointment_scheduled','appointment_rescheduled','appointment_cancelled','reminder_24h','reminder_1h','estimate_sent','invoice_sent','payment_received']) then raise exception 'Invalid preferences';end if;
 insert into public.communication_settings(business_id) values(p_business) on conflict do nothing;
 update public.communication_settings set quiet_start=p_start,quiet_end=p_end,time_zone=p_zone,monthly_limit=p_limit,milestones=p_milestones,updated_at=now() where business_id=p_business;
 insert into public.communication_audit(business_id,event_type,details) values(p_business,'preferences_updated',jsonb_build_object('actor',auth.uid()));return true;
end $$;
commit;
