-- CANDIDATE ONLY. Separate operator approval required; never run from build/startup.
-- Reuse the already verified private http 1.6 + pg_cron design and Vault credential.
-- Does not create/rotate a secret, install pg_net, or enable any SMS workspace.
begin;
do $$ begin
 if not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='http' and n.nspname='trimax_scheduler') then raise exception 'Verified private http scheduler required';end if;
 if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','trimax_scheduling_web') and has_schema_privilege(r.oid,'trimax_scheduler','USAGE')) then raise exception 'Scheduler schema must remain private';end if;
 if exists(select 1 from pg_extension where extname='pg_net') then raise exception 'Superseded pg_net transport is not supported';end if;
end $$;
select cron.schedule('trimax-sms-delivery','* * * * *',$job$
do $dispatch$
declare response_status integer;
begin
 if exists(select 1 from public.communication_messages m join public.communication_settings s on s.business_id=m.business_id where s.enabled and s.provider='twilio' and m.created_at>=s.enabled_at and m.scheduled_for<=now() and ((m.status in ('pending','retry') and m.next_attempt_at<=now()) or (m.status='leased' and m.lease_expires_at<=now()))) then
  perform trimax_scheduler.http_set_curlopt('CURLOPT_TIMEOUT_MS','55000');
  perform trimax_scheduler.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','5000');
  select status into response_status from trimax_scheduler.http(('GET','https://app.rnlcreations.com/api/communications/deliver',ARRAY[('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='trimax_service_request_cron_secret'))::trimax_scheduler.http_header],null,null)::trimax_scheduler.http_request);
  if response_status not in (200,207) then raise exception 'SMS dispatcher returned non-success';end if;
 end if;
exception when others then raise exception 'SMS dispatcher failed; inspect sanitized communications audit';
end $dispatch$;
$job$);
-- Deliberately paused until sender/consent/delivery acceptance and explicit activation.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='trimax-sms-delivery';
commit;
