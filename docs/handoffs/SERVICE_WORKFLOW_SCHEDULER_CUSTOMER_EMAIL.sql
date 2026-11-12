-- Supersedes pg_net activation: managed PUBLIC grants violate restricted intake role.
-- Existing http extension is installed in private trimax_scheduler schema.
-- Run after both R&L test messages are confirmed delivered. Start fresh; preserve pending historical rows.
begin;
do $$ begin
 if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','trimax_scheduling_web') and has_schema_privilege(r.oid,'trimax_scheduler','USAGE')) then raise exception 'Scheduler schema must remain private'; end if;
 if exists(select 1 from pg_extension where extname='pg_net') then raise exception 'Broad network extension must remain absent'; end if;
end $$;
insert into trimax_scheduler.customer_email_activation(business_id,active_from)
values('f31adfa1-26ad-4e74-ad94-a4668d7ad57d',clock_timestamp())
on conflict (business_id) do nothing;

select cron.schedule('trimax-service-request-delivery','* * * * *',$job$
do $dispatch$
declare response_status integer;
begin
 if exists(select 1 from public.public_scheduling_outbox where channel='push' and scheduled_for<=now() and ((status in ('pending','retry') and next_attempt_at<=now()) or (status='leased' and lease_expires_at<=now())))
 or exists(
  select 1 from public.public_scheduling_outbox o
  join trimax_scheduler.customer_email_activation a on a.business_id=o.business_id
  join public.public_service_requests r on (r.id,r.business_id)=(o.request_id,o.business_id)
  left join public.queue_items q on (q.id,q.business_id)=(r.queue_item_id,r.business_id)
  where o.channel='email' and o.audience='customer' and o.consent_reference is not null
    and o.created_at>=a.active_from and o.scheduled_for<=now() and o.attempts<5
    and ((o.status in ('pending','retry') and o.next_attempt_at<=now()) or (o.status='leased' and o.lease_expires_at<now()))
    and r.source='public-web' and r.contact_consent_at is not null and r.email<>'' and r.email=o.recipient
    and r.id not in (
      'e31ed066-b467-4696-abca-4d6c046e6722','9b5cf022-33ed-4136-b89b-5698f738da63',
      'c27947e5-168e-4876-8110-620f8662a190','531a5c52-c100-4655-8792-fcaed3f58b10',
      'ab9da6ac-9f1e-42f6-b76c-d01758a9393c','bb74c3f6-647f-4303-9805-a0812424855d',
      'db884fb9-f089-4ee5-8642-468c88dfb837','e1e4090c-221b-47c9-b8d0-d3defd340803',
      '9655234a-9876-4f66-b6aa-848cb7bc30d4','2cdb9bcb-a429-43fb-9eb5-07b212a4f6b6'
    )
    and (o.event_type='request_received' or (
      o.event_type='appointment_scheduled' and r.status='approved'
      and q.source_request_id=r.id and q.appointment_start>now()
      and q.appointment_end>q.appointment_start
      and q.appointment_start=(o.parameters->>'start')::timestamptz
      and q.appointment_end=(o.parameters->>'end')::timestamptz
    ))
 ) then
  perform trimax_scheduler.http_set_curlopt('CURLOPT_TIMEOUT_MS','55000');
  perform trimax_scheduler.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','5000');
  select status into response_status from trimax_scheduler.http(('GET','https://app.rnlcreations.com/api/public-scheduling/deliver',ARRAY[('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='trimax_service_request_cron_secret'))::trimax_scheduler.http_header],null,null)::trimax_scheduler.http_request);
  if response_status not in (200,207) then raise exception 'Request dispatcher returned non-success status'; end if;
 end if;
exception when others then raise exception 'Request dispatcher failed; inspect sanitized application delivery status';
end $dispatch$;
$job$);
commit;
select jobid,jobname,schedule,active from cron.job where jobname='trimax-service-request-delivery';
