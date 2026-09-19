-- Separate investigator annotations; OCR evidence and its retention remain unchanged.
create table if not exists public.ocr_attempt_debug (
 attempt_id uuid primary key references public.ocr_attempts(id) on delete cascade,
 status text not null default 'Needs Investigation' check(status in ('Needs Investigation','Investigated','Regression Covered','Resolved')),
 note text not null default '' check(length(note)<=2000),
 regression_id text not null default '' check(length(regression_id)<=160),
 investigated_at timestamptz,
 resolved_at timestamptz,
 updated_at timestamptz not null default now(),
 updated_by uuid not null default auth.uid() references auth.users(id)
);
alter table public.ocr_attempt_debug enable row level security;
revoke all on public.ocr_attempt_debug from anon,authenticated;
grant select on public.ocr_attempt_debug to authenticated;
create policy ocr_debug_admin_read on public.ocr_attempt_debug for select to authenticated using(exists(
 select 1 from public.ocr_attempts a where a.id=attempt_id and public.trimax_is_business_admin(a.business_id)
));
-- security_invoker preserves underlying owner/admin RLS on direct view reads.
create or replace view public.ocr_debug_queue with (security_invoker=true) as
select a.id,a.business_id,a.created_at,a.original_id,a.parent_id,a.result,a.summary,a.pinned,a.diagnostics_expires_at,a.diagnostic_bytes,
 coalesce(d.status,'Needs Investigation') as debug_status,coalesce(d.note,'') as investigation_note,
 coalesce(d.regression_id,'') as regression_id,d.investigated_at,d.resolved_at,d.updated_at as debug_updated_at,
 (a.pinned or a.result in ('failed','review','duplicate','apply blocked') or
 (a.result='success' and (coalesce((a.summary->>'reconciled')::boolean,false)=false or coalesce((a.summary->>'paymentCanApply')::boolean,false)=false or
 coalesce((a.summary->>'invoicesResolved')::integer,0)<coalesce((a.summary->>'rowsDetected')::integer,0)))) as debug_worthy
from public.ocr_attempts a left join public.ocr_attempt_debug d on d.attempt_id=a.id;
revoke all on public.ocr_debug_queue from anon,authenticated;
grant select on public.ocr_debug_queue to authenticated;
create or replace function public.trimax_update_ocr_debug(p_id uuid,p_status text,p_note text default '',p_regression_id text default '')
returns void language plpgsql security definer set search_path=public as $$
declare target public.ocr_attempts;
begin
 select * into target from public.ocr_attempts where id=p_id;
 if auth.uid() is null or target.id is null or not public.trimax_is_business_admin(target.business_id) then raise exception 'Owner/admin workspace access required'; end if;
 if p_status not in ('Needs Investigation','Investigated','Regression Covered','Resolved') or p_status is null then raise exception 'Invalid debug status'; end if;
 if length(coalesce(p_note,''))>2000 or length(coalesce(p_regression_id,''))>160 then raise exception 'Debug note or fixture identifier is too long'; end if;
 insert into public.ocr_attempt_debug(attempt_id,status,note,regression_id,investigated_at,resolved_at,updated_by)
 values(p_id,p_status,coalesce(p_note,''),coalesce(p_regression_id,''),case when p_status<>'Needs Investigation' then now() end,case when p_status='Resolved' then now() end,auth.uid())
 on conflict(attempt_id) do update set status=excluded.status,note=excluded.note,regression_id=excluded.regression_id,
 investigated_at=coalesce(ocr_attempt_debug.investigated_at,excluded.investigated_at),
 resolved_at=case when excluded.status='Resolved' then coalesce(ocr_attempt_debug.resolved_at,excluded.resolved_at) else null end,
 updated_at=now(),updated_by=auth.uid();
end $$;
revoke all on function public.trimax_update_ocr_debug(uuid,text,text,text) from public,anon;
grant execute on function public.trimax_update_ocr_debug(uuid,text,text,text) to authenticated;
-- Existing (business_id, created_at, id) and (business_id, original_id, created_at)
-- indexes serve queue pagination and retry relationships. No payload joins or new large indexes.
