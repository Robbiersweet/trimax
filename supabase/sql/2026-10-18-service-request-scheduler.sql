-- Activation only after production authorization and successful migration/web gates.
-- Uses the existing Supabase project; no paid scheduler or Vercel upgrade.
-- Provision the EXISTING Vercel CRON_SECRET as Vault secret
-- trimax_service_request_cron_secret through the approved secret-handling process.
-- Never paste the secret into this file or retain it in SQL query history.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='trimax_service_request_cron_secret' and length(decrypted_secret)>20) then
  raise exception 'Existing delivery credential must be provisioned in Vault before activation';
 end if;
 if to_regprocedure('public.trimax_claim_request_delivery(text)') is null then
  raise exception 'Install and verify the delivery migration first';
 end if;
end $$;
select cron.schedule('trimax-service-request-delivery','* * * * *',$job$
 select net.http_get(
  url:='https://app.rnlcreations.com/api/public-scheduling/deliver',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='trimax_service_request_cron_secret')),
  timeout_milliseconds:=55000
 ) where exists (
  select 1 from public.public_scheduling_outbox
  where channel in ('push','email') and (
   (status in ('pending','retry') and next_attempt_at<=now()) or
   (status='leased' and lease_expires_at<=now())
  )
 );
$job$);
commit;
-- Verify without disclosing command headers/secrets:
select jobid,jobname,schedule,active from cron.job where jobname='trimax-service-request-delivery';
-- Stop/recovery (run only when needed):
-- select cron.unschedule('trimax-service-request-delivery');
-- Also disable SERVICE_REQUEST_DELIVERY_ENABLED before restoring the prior web release.
