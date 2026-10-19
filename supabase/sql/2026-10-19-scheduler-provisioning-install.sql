-- OPERATOR ONLY: install temporarily during an explicitly approved rollout.
-- Pause contract-checked workers until this helper is removed and fingerprints match.
-- No credentials appear in this script. Do not call it with a literal secret in SQL.
begin;
create function public.trimax_provision_request_scheduler(p_secret text default null)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare existing_value text;
begin
 -- The no-secret first request checks the REST session's SQL logging settings.
 if current_setting('log_statement') not in ('none','ddl')
    or current_setting('log_min_duration_statement') <> '-1'
    or current_setting('log_min_duration_sample') <> '-1'
    or current_setting('log_transaction_sample_rate')::numeric <> 0
    or current_setting('log_parameter_max_length_on_error')::integer <> 0
    or coalesce(current_setting('pgaudit.log_parameter',true),'off') not in ('off','false') then
   return 'logging_configuration_rejected';
 end if;
 if p_secret is null then return 'ready'; end if;
 if length(p_secret)<=20 or length(p_secret)>8192 then return 'invalid'; end if;
 perform pg_advisory_xact_lock(20261019,1);
 select decrypted_secret into existing_value from vault.decrypted_secrets
 where name='trimax_service_request_cron_secret';
 if found then
  if existing_value=p_secret then return 'matched'; end if;
  return 'conflict'; -- Never replace, rotate or delete a pre-existing value.
 end if;
 perform vault.create_secret(p_secret,'trimax_service_request_cron_secret','Existing Vercel production scheduler credential');
 select decrypted_secret into existing_value from vault.decrypted_secrets
 where name='trimax_service_request_cron_secret';
 if existing_value is distinct from p_secret then raise exception 'Verification failed'; end if;
 return 'stored';
exception when others then return 'failed';
end $$;
revoke all on function public.trimax_provision_request_scheduler(text) from public,anon,authenticated,service_role;
grant execute on function public.trimax_provision_request_scheduler(text) to service_role;
commit;
notify pgrst, 'reload schema';
