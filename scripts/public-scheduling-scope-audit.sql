-- Read-only provisioning gate. Must return zero unexpected privileges before token issuance.
-- PUBLIC privileges also apply to NOINHERIT roles. Do not assume NOLOGIN restricts them.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and has_function_privilege('trimax_scheduling_intake',p.oid,'EXECUTE')
and p.proname not in ('trimax_public_scheduling_config','trimax_submit_public_service_request','trimax_public_request_status');
select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','v','m','p')
and has_table_privilege('trimax_scheduling_intake',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
select rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolcanlogin,rolinherit
from pg_roles where rolname='trimax_scheduling_intake';
