-- Supersedes pg_net activation: managed PUBLIC grants violate restricted intake role.
-- Existing http extension is installed in private trimax_scheduler schema.
-- Email and SMS remain disabled. Push-only wakeup; no secrets embedded.
begin;
do $$ begin
 if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','trimax_scheduling_web') and has_schema_privilege(r.oid,'trimax_scheduler','USAGE')) then raise exception 'Scheduler schema must remain private'; end if;
 if exists(select 1 from pg_extension where extname='pg_net') then raise exception 'Broad network extension must remain absent'; end if;
end $$;
select cron.schedule('trimax-service-request-delivery','* * * * *',$job$
do $dispatch$
declare response_status integer;
begin
 if exists(select 1 from public.public_scheduling_outbox where channel='push' and scheduled_for<=now() and ((status in ('pending','retry') and next_attempt_at<=now()) or (status='leased' and lease_expires_at<=now()))) then
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