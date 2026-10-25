-- Candidate only. Preserve push finish behavior; reject stale email permanently.
begin;
alter table public.public_scheduling_outbox add column email_first_attempt_at timestamptz;
-- Resend idempotency expires after 24h. Do not blindly replay a possibly accepted
-- email after a long worker/database outage; leave a visible reviewable failure.
create function public.trimax_claim_request_email() returns setof public.public_scheduling_outbox
language plpgsql security definer set search_path=pg_catalog as $$
declare claimed_ids uuid[];
begin
 update public.public_scheduling_outbox set status='dead_letter',last_error_code='email_idempotency_window_expired',lease_token=null,lease_expires_at=null
 where channel='email' and status in ('pending','retry','leased') and email_first_attempt_at<now()-interval '23 hours';
 select array_agg(id) into claimed_ids from public.trimax_claim_request_delivery('email');
 return query update public.public_scheduling_outbox o set email_first_attempt_at=coalesce(email_first_attempt_at,now()) where o.id=any(claimed_ids) returning o.*;
end $$;
revoke all on function public.trimax_claim_request_email() from public,anon,authenticated,trimax_scheduling_intake,trimax_scheduling_web;
grant execute on function public.trimax_claim_request_email() to service_role;

create function public.trimax_finish_request_email(p_id uuid,p_lease uuid,p_reference text,p_error text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from public.public_scheduling_outbox where id=p_id and lease_token=p_lease and status='leased' and channel='email' for update;
 if not found then return false;end if;
 if p_error in ('email_recipient_changed','email_before_activation','email_obsolete') then
 update public.public_scheduling_outbox set status='dead_letter',last_error_code=p_error,lease_token=null,lease_expires_at=null,delivery_history=delivery_history||jsonb_build_array(jsonb_build_object('at',now(),'attempt',attempts,'accepted',false,'error',p_error)) where id=p_id;return true;
 end if;
 return public.trimax_finish_request_delivery(p_id,p_lease,p_reference,p_error);
end $$;
revoke all on function public.trimax_finish_request_email(uuid,uuid,text,text) from public,anon,authenticated,trimax_scheduling_intake,trimax_scheduling_web;
grant execute on function public.trimax_finish_request_email(uuid,uuid,text,text) to service_role;
create function public.trimax_enqueue_request_email_reminders() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests;q public.queue_items;s public.public_scheduling_settings;offset_hours integer;
begin
 if new.event_type not in ('appointment_scheduled','appointment_rescheduled','appointment_cancelled') then return new;end if;
 select * into r from public.public_service_requests where id=new.request_id and business_id=new.business_id;if not found then return new;end if;
 -- Suppress obsolete pending reminders; a leased row is revalidated before sending.
 update public.public_scheduling_outbox set status='dead_letter',last_error_code='email_obsolete' where business_id=r.business_id and request_id=r.id and channel='email' and event_type in ('reminder_24h','reminder_1h') and status in ('pending','retry');
 if new.event_type='appointment_cancelled' or r.email='' or r.contact_consent_at is null then return new;end if;
 select * into q from public.queue_items where id=r.queue_item_id and business_id=r.business_id;
 select * into s from public.public_scheduling_settings where business_id=r.business_id;
 if q.appointment_start is null or q.appointment_end is null or q.completed_date is not null then return new;end if;
 foreach offset_hours in array array[24,1] loop
 if q.appointment_start-make_interval(hours=>offset_hours)>now() then
 insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,consent_reference,idempotency_key,scheduled_for)
 values(r.business_id,r.id,'reminder_'||offset_hours||'h','email','customer',r.email,'appointment_reminder',jsonb_build_object('business',s.display_name,'reference',r.public_reference,'start',q.appointment_start,'end',q.appointment_end,'timeZone',s.time_zone),'request:'||r.id||':'||r.contact_consent_at,'request-email-reminder:'||new.id||':'||offset_hours,q.appointment_start-make_interval(hours=>offset_hours)) on conflict do nothing;
 end if;end loop;return new;
end $$;
revoke all on function public.trimax_enqueue_request_email_reminders() from public,anon,authenticated,trimax_scheduling_intake,trimax_scheduling_web,service_role;
create trigger scheduling_request_email_reminders after insert on public.public_request_activity for each row execute function public.trimax_enqueue_request_email_reminders();
commit;
