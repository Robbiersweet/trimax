-- Compact history is permanent; verbose diagnostic JSON expires after 30 days unless pinned.
-- No image data or image objects are created by this feature.
create table if not exists public.ocr_attempts (
 id uuid primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 original_id uuid not null,
 parent_id uuid,
 phase smallint not null default 0 check (phase between 0 and 2),
 result text not null default 'processing' check (result in ('processing','success','review','failed','duplicate','apply blocked')),
 summary jsonb not null check (octet_length(summary::text) <= 16384),
 pinned boolean not null default false,
 diagnostics_expires_at timestamptz,
 diagnostic_bytes integer not null default 0
);
create index if not exists ocr_attempts_recent on public.ocr_attempts(business_id, created_at desc, id);
create index if not exists ocr_attempts_original on public.ocr_attempts(business_id, original_id, created_at);
create table if not exists public.ocr_attempt_diagnostics (
 attempt_id uuid primary key references public.ocr_attempts(id) on delete cascade,
 payload jsonb not null check (octet_length(payload::text) <= 16777216)
);
alter table public.ocr_attempts enable row level security;
alter table public.ocr_attempt_diagnostics enable row level security;
revoke all on public.ocr_attempts, public.ocr_attempt_diagnostics from anon, authenticated;
grant select on public.ocr_attempts, public.ocr_attempt_diagnostics to authenticated;
drop policy if exists ocr_history_admin_read on public.ocr_attempts;
create policy ocr_history_admin_read on public.ocr_attempts for select to authenticated using (public.trimax_is_business_admin(business_id));
drop policy if exists ocr_diagnostics_admin_read on public.ocr_attempt_diagnostics;
create policy ocr_diagnostics_admin_read on public.ocr_attempt_diagnostics for select to authenticated using (exists (
 select 1 from public.ocr_attempts a where a.id=attempt_id and public.trimax_is_business_admin(a.business_id)
 and (a.pinned or a.diagnostics_expires_at > now())
));
create or replace function public.trimax_save_ocr_attempt(p_business uuid, p_id uuid, p_original uuid, p_parent uuid, p_phase integer, p_summary jsonb, p_payload jsonb default null)
returns void language plpgsql security definer set search_path=public as $$
declare existing public.ocr_attempts; target_result text; expiry timestamptz;
begin
 if auth.uid() is null or not public.trimax_is_business_admin(p_business) then raise exception 'Owner/admin workspace access required'; end if;
 if p_phase not between 0 and 2 or jsonb_typeof(p_summary) <> 'object' then raise exception 'Invalid attempt'; end if;
 if p_parent is not null and not exists(select 1 from public.ocr_attempts where id=p_parent and business_id=p_business and original_id=p_original) then raise exception 'Retry parent is not in this workspace'; end if;
 if p_parent is null and p_original <> p_id then raise exception 'Original ID must match first attempt'; end if;
 target_result := coalesce(p_summary->>'result','processing');
 if p_phase < 2 then target_result := 'processing'; end if;
 insert into public.ocr_attempts(id,business_id,original_id,parent_id,summary) values(p_id,p_business,p_original,p_parent,p_summary) on conflict(id) do nothing;
 select * into existing from public.ocr_attempts where id=p_id for update;
 if existing.business_id <> p_business or existing.created_by <> auth.uid() or existing.original_id <> p_original or existing.parent_id is distinct from p_parent then raise exception 'Attempt identity cannot change'; end if;
 if existing.phase > p_phase or existing.phase = 2 then return; end if;
 expiry := existing.created_at + interval '30 days';
 update public.ocr_attempts set phase=p_phase, result=target_result, summary=p_summary, updated_at=now(),
 diagnostics_expires_at=case when target_result='success' then null else expiry end,
 diagnostic_bytes=case when target_result='success' then 0 when p_payload is null then diagnostic_bytes else octet_length(p_payload::text) end where id=p_id;
 if target_result='success' then delete from public.ocr_attempt_diagnostics where attempt_id=p_id;
 elsif p_payload is not null then insert into public.ocr_attempt_diagnostics values(p_id,p_payload) on conflict(attempt_id) do update set payload=excluded.payload;
 end if;
end $$;
revoke all on function public.trimax_save_ocr_attempt(uuid,uuid,uuid,uuid,integer,jsonb,jsonb) from public;
grant execute on function public.trimax_save_ocr_attempt(uuid,uuid,uuid,uuid,integer,jsonb,jsonb) to authenticated;
create or replace function public.trimax_pin_ocr_attempt(p_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path=public as $$
declare target public.ocr_attempts;
begin
 select * into target from public.ocr_attempts where id=p_id for update;
 if target.id is null or auth.uid() is null or not public.trimax_is_business_admin(target.business_id) then raise exception 'Owner/admin workspace access required'; end if;
 if target.result='success' then raise exception 'Successful scans have no retained debug payload'; end if;
 if not exists(select 1 from public.ocr_attempt_diagnostics where attempt_id=p_id) or (not target.pinned and target.diagnostics_expires_at <= now()) then raise exception 'Full diagnostics have expired'; end if;
 update public.ocr_attempts set pinned=p_pinned where id=p_id;
end $$;
revoke all on function public.trimax_pin_ocr_attempt(uuid,boolean) from public;
grant execute on function public.trimax_pin_ocr_attempt(uuid,boolean) to authenticated;
create or replace function public.trimax_cleanup_ocr_diagnostics()
returns integer language plpgsql security definer set search_path=public as $$
declare deleted_count integer;
begin
 update public.ocr_attempts set result='failed', summary=summary || '{"result":"failed","paymentCanApply":false,"reasons":["Scan interrupted before final review completed."]}'::jsonb
 where phase<2 and updated_at < now()-interval '1 hour' and result='processing';
 delete from public.ocr_attempt_diagnostics d using public.ocr_attempts a where d.attempt_id=a.id and not a.pinned and a.diagnostics_expires_at<=now();
 get diagnostics deleted_count = row_count;
 update public.ocr_attempts set diagnostic_bytes=0 where diagnostic_bytes>0 and not pinned and diagnostics_expires_at<=now();
 return deleted_count;
end $$;
revoke all on function public.trimax_cleanup_ocr_diagnostics() from public, anon, authenticated;
grant execute on function public.trimax_cleanup_ocr_diagnostics() to service_role;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('trimax-ocr-diagnostics-retention','25 * * * *','select public.trimax_cleanup_ocr_diagnostics();');
