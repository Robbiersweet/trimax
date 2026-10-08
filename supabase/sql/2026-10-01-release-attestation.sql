-- Read-only attestation; no new tables or business-write grants.
-- Catalog algorithm v1 excludes only the release-attestation function itself to avoid a self-hash cycle.
-- Frozen catalog-v1 baseline used CRLF between entries. Spell out bytes 0D 0A
-- so editor/platform newline conversion cannot silently change the digest.
create or replace function public.trimax_release_runtime(p_business uuid,p_engine text,p_key text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare answer jsonb;
begin
 if p_engine='diagnostics' then
  if auth.uid() is null or not public.trimax_is_business_admin(p_business) then raise exception 'Owner/admin required'; end if;
 elsif p_engine='legacy' then
  if not exists(select 1 from public.ocr_legacy_workers where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Invalid legacy credential'; end if;
 elsif p_engine='v2-shadow' then
  if not exists(select 1 from public.ocr_shadow_flags where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Invalid shadow credential'; end if;
 else raise exception 'Unknown engine'; end if;
 with tables as (
  select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
 ), parts as (
  select 'schema' kind,c.relname||'.'||a.attname name,concat_ws('|',a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),c.relrowsecurity,c.relforcerowsecurity) value from tables c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
  union all select 'schema',c.relname||'.constraint.'||k.conname,pg_get_constraintdef(k.oid,true) from tables c join pg_constraint k on k.conrelid=c.oid
  union all select 'schema',tablename||'.index.'||indexname,indexdef from pg_indexes where schemaname='public'
  union all select 'rpc',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'DEFAULT') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname<>'trimax_release_runtime'
  union all select 'triggers',c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid,true)||t.tgenabled::text from tables c join pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal
  union all select 'policies',schemaname||'.'||tablename||'.'||policyname,concat_ws('|',permissive,roles::text,cmd,qual,with_check) from pg_policies where schemaname in ('public','storage')
  union all select 'grants',table_schema||'.'||table_name||'.'||grantee||'.'||privilege_type,is_grantable from information_schema.role_table_grants where table_schema='public'
 ), hashes as (
  select kind,count(*) entries,encode(sha256(convert_to(string_agg(name||'='||value,chr(13)||chr(10) order by name collate "C"),'UTF8')),'hex') hash from parts group by kind
 ) select jsonb_build_object('fingerprints',(select jsonb_object_agg(kind,jsonb_build_object('sha256',hash,'entries',entries)) from hashes),
 'flags',(select jsonb_agg(jsonb_build_object('businessId',business_id,'enabled',enabled,'nativeStill',native_still) order by business_id) from public.ocr_shadow_flags where business_id=p_business),
 'businessId',p_business,'engine',p_engine,'credentialScope','ocr-only','observedAt',now(),
 'legacyRelease',(select terminal_summary->'release' from public.ocr_legacy_jobs where business_id=p_business order by queued_at desc limit 1),
 'v2Release',(select d.payload#>'{result,release}' from public.ocr_shadow_jobs j join public.ocr_attempt_diagnostics d on d.attempt_id=j.shadow_attempt_id where j.business_id=p_business order by j.enqueued_at desc limit 1)) into answer;
 return answer;
end $$;
revoke all on function public.trimax_release_runtime(uuid,text,text) from public;
grant execute on function public.trimax_release_runtime(uuid,text,text) to anon,authenticated;
