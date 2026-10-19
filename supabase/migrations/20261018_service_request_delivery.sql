-- Candidate only. Reuse the existing scheduling outbox and existing push subscriptions.
begin;
alter table public.public_scheduling_outbox drop constraint public_scheduling_outbox_channel_check;
alter table public.public_scheduling_outbox add constraint public_scheduling_outbox_channel_check check(channel in ('sms','email','in-app','push'));
alter table public.public_scheduling_outbox add column lease_token uuid;
alter table public.public_scheduling_outbox add column delivery_history jsonb not null default '[]';

-- Restore missing persistent history without replaying old phone/customer messages.
insert into public.scheduling_owner_notifications(business_id,request_id,recipient_id,customer_name,request_type,submitted_at)
 select r.business_id,r.id,m.user_id,r.customer_name,t.public_label,r.submitted_at
 from public.public_service_requests r join public.business_users m on m.business_id=r.business_id and m.role in ('owner','admin') and m.user_id is not null
 join public.public_service_request_types t on t.id=r.request_type_id and t.business_id=r.business_id
 on conflict(request_id,recipient_id) do nothing;

create function public.trimax_enqueue_request_delivery() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests; s public.public_scheduling_settings; event_name text; appointment public.queue_items;
begin
 select * into r from public.public_service_requests where id=new.request_id and business_id=new.business_id;
 select * into s from public.public_scheduling_settings where business_id=r.business_id;
 event_name=case new.event_type when 'request_received' then 'request_received' when 'appointment_scheduled' then 'appointment_scheduled' when 'appointment_rescheduled' then 'appointment_rescheduled' when 'appointment_cancelled' then 'appointment_cancelled' when 'review_updated' then case when new.details->>'toStatus' is distinct from new.details->>'fromStatus' then case new.details->>'toStatus' when 'approved' then 'approved' when 'rejected' then 'declined' end end end;
 if event_name is null then return new; end if;
 if event_name='request_received' then
  insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,idempotency_key)
  select r.business_id,r.id,'new_request','push','internal',p.id::text,'service-request',
   jsonb_build_object('customer',r.customer_name,'reference',r.public_reference,'category',t.public_label,'requestedDate',coalesce(r.preferred_date::text,'Flexible'),'slug',s.public_slug),
   'request-push:'||r.id::text||':'||p.id::text
  from public.push_subscriptions p join public.public_service_request_types t on t.id=r.request_type_id and t.business_id=r.business_id
  where p.business_id=r.business_id and p.status='active' and exists(select 1 from public.business_users m where m.business_id=r.business_id and m.user_id=p.user_id and m.role in ('owner','admin'))
  on conflict(business_id,idempotency_key) do nothing;
 end if;
 if r.email<>'' and r.contact_consent_at is not null then
  select * into appointment from public.queue_items where id=r.queue_item_id and business_id=r.business_id;
  insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,consent_reference,idempotency_key)
  values(r.business_id,r.id,event_name,'email','customer',r.email,event_name,
   jsonb_build_object('business',s.display_name,'reference',r.public_reference,'start',appointment.appointment_start,'end',appointment.appointment_end,'timeZone',s.time_zone),
   'request:'||r.id::text||':'||r.contact_consent_at::text,'request-email:'||new.id::text)
  on conflict(business_id,idempotency_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.trimax_enqueue_request_delivery() from public,anon,authenticated,service_role;
create trigger scheduling_request_delivery after insert on public.public_request_activity for each row execute function public.trimax_enqueue_request_delivery();

-- Private service-role dispatcher; claims are channel-specific so missing email/SMS cannot block push.
create function public.trimax_claim_request_delivery(p_channel text) returns setof public.public_scheduling_outbox
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_channel not in ('push','email') or p_channel is null then raise exception 'Unsupported channel'; end if;
 update public.public_scheduling_outbox set status='dead_letter',last_error_code='lease_expired_after_max_attempts',lease_token=null,lease_expires_at=null
 where channel=p_channel and status='leased' and lease_expires_at<now() and attempts>=5;
 return query with due as (
 select id from public.public_scheduling_outbox where channel=p_channel and
 ((status in ('pending','retry') and next_attempt_at<=now()) or (status='leased' and lease_expires_at<now()))
 and scheduled_for<=now() and attempts<5 order by created_at for update skip locked limit 20
 ) update public.public_scheduling_outbox o set status='leased',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',attempts=attempts+1 from due where o.id=due.id returning o.*;
end $$;
create function public.trimax_finish_request_delivery(p_id uuid,p_lease uuid,p_reference text,p_error text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
 update public.public_scheduling_outbox set status=case when p_error is null then 'delivered' when attempts>=5 then 'dead_letter' else 'retry' end,
 provider_message_id=left(p_reference,200),last_error_code=left(p_error,80),delivery_history=delivery_history||jsonb_build_array(jsonb_build_object('at',now(),'attempt',attempts,'accepted',p_error is null,'error',left(p_error,80))),next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_expires_at=null,lease_token=null
 where id=p_id and lease_token=p_lease and status='leased';
 return found;
end $$;
revoke all on function public.trimax_claim_request_delivery(text),public.trimax_finish_request_delivery(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.trimax_claim_request_delivery(text),public.trimax_finish_request_delivery(uuid,uuid,text,text) to service_role;

-- Fail closed on inherited grants to unexpected runtime roles.
do $acl$
begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where n.nspname='public' and p.proname in ('trimax_enqueue_request_delivery','trimax_claim_request_delivery','trimax_finish_request_delivery') and a.grantee<>p.proowner
 and not (p.proname='trimax_service_request_workflow' and a.grantee='authenticated'::regrole)
 and not (p.proname in ('trimax_claim_request_delivery','trimax_finish_request_delivery') and a.grantee='service_role'::regrole)) then raise exception 'Unexpected workflow function grant'; end if;
end $acl$;
commit;
