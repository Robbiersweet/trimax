begin;

create schema if not exists trimax_scheduler;
create table trimax_scheduler.customer_email_activation (
  business_id uuid primary key references public.businesses(id),
  active_from timestamptz not null check(isfinite(active_from))
);
revoke all on trimax_scheduler.customer_email_activation from public,anon,authenticated,service_role;

-- A new activation starts at an explicit boundary and leaves the existing outbox intact.
create function public.trimax_claim_customer_schedule_email(
  p_business uuid, p_test_ids uuid[]
) returns setof public.public_scheduling_outbox
language sql security definer set search_path=pg_catalog as $$
  with due as (
    select o.id
    from public.public_scheduling_outbox o
    join trimax_scheduler.customer_email_activation a on a.business_id=o.business_id
    join public.public_service_requests r on (r.id,r.business_id)=(o.request_id,o.business_id)
    left join public.queue_items q on (q.id,q.business_id)=(r.queue_item_id,r.business_id)
    where o.business_id=p_business and o.created_at>=a.active_from
      and o.channel='email' and o.audience='customer' and o.consent_reference is not null
      and r.source='public-web' and r.contact_consent_at is not null
      and r.email<>'' and r.email=o.recipient
      and not (r.id=any(coalesce(p_test_ids,array[]::uuid[])))
      and o.scheduled_for<=now() and o.attempts<5
      and ((o.status in ('pending','retry') and o.next_attempt_at<=now())
        or (o.status='leased' and o.lease_expires_at<now()))
      and (o.event_type='request_received' or (
        o.event_type='appointment_scheduled' and r.status='approved'
        and q.source_request_id=r.id and q.appointment_start>now()
        and q.appointment_end>q.appointment_start
        and o.parameters->>'start' is not null and o.parameters->>'end' is not null
        and q.appointment_start=(o.parameters->>'start')::timestamptz
        and q.appointment_end=(o.parameters->>'end')::timestamptz
      ))
    order by o.created_at,o.id for update of o skip locked limit 20
  )
  update public.public_scheduling_outbox o
  set status='leased',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',attempts=o.attempts+1
  from due where o.id=due.id returning o.*;
$$;

revoke all on function public.trimax_claim_customer_schedule_email(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.trimax_claim_customer_schedule_email(uuid,uuid[]) to service_role;

commit;
