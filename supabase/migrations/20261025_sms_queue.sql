-- Candidate only, after communications + workflow_experience. Observe committed
-- timed appointments; never infer client identity from property/customer names.
begin;
create function public.trimax_queue_sms_client(p_business uuid,p_queue text,p_phone text default null) returns uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare q public.queue_items;estimate_client uuid;chosen uuid;
begin
 select * into q from public.queue_items where id=p_queue and business_id=p_business;if not found then return null;end if;
 if q.linked_estimate_id is not null then select client_id into estimate_client from public.estimates where id=q.linked_estimate_id and business_id=p_business;end if;
 if q.request_client_id is not null and estimate_client is not null and q.request_client_id<>estimate_client then return null;end if;
 chosen=coalesce(q.request_client_id,estimate_client);
 if not exists(select 1 from public.clients where id=chosen and business_id=p_business and (p_phone is null or public.trimax_normalize_sms_phone(phone)=p_phone)) then return null;end if;
 return chosen;
end $$;
create function public.trimax_sms_queue_event() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare chosen uuid;phone_normal text;k text;offset_hours integer;
begin
 if new.source_request_id is not null then return new;end if;
 if new.appointment_start is not distinct from old.appointment_start and new.appointment_end is not distinct from old.appointment_end then return new;end if;
 update public.communication_messages set status='superseded',updated_at=now() where business_id=new.business_id and queue_id=new.id and status in ('pending','retry') and event_type in ('reminder_24h','reminder_1h','appointment_scheduled','appointment_rescheduled','appointment_cancelled');
 chosen=public.trimax_queue_sms_client(new.business_id,new.id);if chosen is null then return new;end if;
 select public.trimax_normalize_sms_phone(phone) into phone_normal from public.clients where id=chosen and business_id=new.business_id;
 if not exists(select 1 from public.communication_consent where business_id=new.business_id and phone=phone_normal and client_id=chosen and opted_in_at is not null) then return new;end if;
 if new.appointment_start is null then
 if old.appointment_start is null then return new;end if;k='appointment_cancelled';
 elsif new.appointment_end is null or new.appointment_end<=new.appointment_start or new.completed_date is not null then return new;
 else k=case when old.appointment_start is null then 'appointment_scheduled' else 'appointment_rescheduled' end;end if;
 insert into public.communication_messages(business_id,client_id,queue_id,event_type,idempotency_key,recipient,appointment_start,appointment_end)
 values(new.business_id,chosen,new.id,k,'queue-appointment:'||new.id||':'||new.appointment_revision,phone_normal,new.appointment_start,new.appointment_end) on conflict do nothing;
 if k<>'appointment_cancelled' then foreach offset_hours in array array[24,1] loop
 if new.appointment_start-make_interval(hours=>offset_hours)>now() then
 insert into public.communication_messages(business_id,client_id,queue_id,event_type,idempotency_key,recipient,appointment_start,appointment_end,scheduled_for)
 values(new.business_id,chosen,new.id,'reminder_'||offset_hours||'h','queue-reminder:'||new.id||':'||new.appointment_revision||':'||offset_hours,phone_normal,new.appointment_start,new.appointment_end,new.appointment_start-make_interval(hours=>offset_hours)) on conflict do nothing;
 end if;end loop;end if;return new;
end $$;
create trigger communication_queue_event after update of appointment_start,appointment_end on public.queue_items for each row execute function public.trimax_sms_queue_event();

-- Enforce current identity on every send-time preparation as well as enqueue.
create function public.trimax_sms_current_identity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.status='leased' and new.queue_id is not null and new.request_id is null and
 (public.trimax_queue_sms_client(new.business_id,new.queue_id) is distinct from new.client_id or not exists(select 1 from public.clients c where c.id=new.client_id and c.business_id=new.business_id and public.trimax_normalize_sms_phone(c.phone)=new.recipient)) then
 new.status='suppressed';new.error_code='recipient_changed';new.lease_token=null;new.lease_expires_at=null;
 end if;return new;
end $$;
create trigger communication_current_identity before update on public.communication_messages for each row execute function public.trimax_sms_current_identity();
revoke all on function public.trimax_queue_sms_client(uuid,text,text),public.trimax_sms_queue_event(),public.trimax_sms_current_identity() from public,anon,authenticated,service_role;
-- Server capability endpoint checks the same current identity; never browser RPC.
grant execute on function public.trimax_queue_sms_client(uuid,text,text) to service_role;
commit;

