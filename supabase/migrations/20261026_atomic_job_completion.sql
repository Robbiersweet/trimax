-- Candidate only: no historical data rewrite. Both competing paths write one
-- private mutex row, so Repeatable Read cannot silently reuse a stale snapshot.
begin;
create table public.trimax_queue_completion_mutex (
 business_id uuid not null, queue_item_id text not null, version bigint not null default 1,
 primary key(business_id,queue_item_id)
);
alter table public.trimax_queue_completion_mutex enable row level security;
create function public.trimax_guard_queue_completion_atomic() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare terminal boolean; prior_terminal boolean:=false;
begin
 terminal:=new.completed_date is not null or lower(btrim(coalesce(new.status,''))) in ('completed','invoiced','paid') or lower(btrim(coalesce(to_jsonb(new)->>'progress_stage','')))='complete';
 if tg_op='UPDATE' then
  -- Serialize identity changes with starts against the OLD identity first.
  -- Retain every linked session's audit relationship, including ended or
  -- historically inconsistent tenant rows, without rewriting those rows.
  if old.business_id is distinct from new.business_id or old.id is distinct from new.id then
   insert into public.trimax_queue_completion_mutex(business_id,queue_item_id) values(old.business_id,old.id::text)
   on conflict(business_id,queue_item_id) do update set version=public.trimax_queue_completion_mutex.version+1;
   if exists(select 1 from public.job_sessions s where s.queue_item_id::text=old.id::text) then
    raise exception 'Cannot change Queue identity while Job Sessions reference it' using errcode='23514';
   end if;
  end if;
  prior_terminal:=old.completed_date is not null or lower(btrim(coalesce(old.status,''))) in ('completed','invoiced','paid') or lower(btrim(coalesce(to_jsonb(old)->>'progress_stage','')))='complete';
 end if;
 if terminal and (not prior_terminal or (tg_op='UPDATE' and (old.business_id is distinct from new.business_id or old.id is distinct from new.id))) then
  insert into public.trimax_queue_completion_mutex(business_id,queue_item_id) values(new.business_id,new.id::text)
  on conflict(business_id,queue_item_id) do update set version=public.trimax_queue_completion_mutex.version+1;
  if exists(select 1 from public.job_sessions s where s.queue_item_id::text=new.id::text and s.ended_at is null) then
   raise exception 'Finish the active Job Session before marking this job complete.' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
create function public.trimax_guard_session_start_atomic() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare q public.queue_items;
begin
 -- Ordinary edits to grandfathered active sessions and ending them remain valid.
 if new.ended_at is null and new.queue_item_id is not null and
 (tg_op='INSERT' or old.ended_at is not null or old.queue_item_id is distinct from new.queue_item_id or old.business_id is distinct from new.business_id) then
  insert into public.trimax_queue_completion_mutex(business_id,queue_item_id) values(new.business_id,new.queue_item_id::text)
  on conflict(business_id,queue_item_id) do update set version=public.trimax_queue_completion_mutex.version+1;
  -- No Queue row lock: completion already owns Queue then mutex. Reversing those
  -- locks here could deadlock. The shared mutex write provides serialization.
  select * into q from public.queue_items where id::text=new.queue_item_id::text and business_id=new.business_id;
  if not found then raise exception 'Queue item unavailable' using errcode='23514';end if;
  if q.completed_date is not null or lower(btrim(coalesce(q.status,''))) in ('completed','invoiced','paid') or lower(btrim(coalesce(to_jsonb(q)->>'progress_stage','')))='complete' then
   raise exception 'Cannot start a Job Session on completed work' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
-- Supabase inherited defaults may name additional restricted roles. Remove every
-- non-owner explicit grant on these new private objects, not just anon/authenticated.
do $$declare x record;begin
 for x in select distinct case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end grantee
 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 where c.oid='public.trimax_queue_completion_mutex'::regclass and a.grantee<>c.relowner
 loop execute 'revoke all on public.trimax_queue_completion_mutex from '||x.grantee;end loop;
 for x in select distinct p.oid::regprocedure signature,case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end grantee
 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid in ('public.trimax_guard_queue_completion_atomic()'::regprocedure,'public.trimax_guard_session_start_atomic()'::regprocedure) and a.grantee<>p.proowner
 loop execute 'revoke all on function '||x.signature||' from '||x.grantee;end loop;
 -- A definer lacking RLS bypass cannot reliably see all active sessions.
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then raise exception 'Trusted RLS-bypassing migration owner required';end if;
end $$;
create trigger trimax_queue_completion_atomic before insert or update on public.queue_items
for each row execute function public.trimax_guard_queue_completion_atomic();
create trigger trimax_session_start_atomic before insert or update on public.job_sessions
for each row execute function public.trimax_guard_session_start_atomic();
commit;

