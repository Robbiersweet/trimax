-- Run after successful transfer, or after an aborted attempt. Preserve the Vault value.
begin;
drop function if exists public.trimax_provision_request_scheduler(text);
commit;
notify pgrst, 'reload schema';
