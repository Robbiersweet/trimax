-- Optical bytes share the lifetime of their existing diagnostic record.
create table if not exists public.ocr_attempt_optical (
 attempt_id uuid primary key references public.ocr_attempt_diagnostics(attempt_id) on delete cascade,
 evidence jsonb not null check(octet_length(evidence::text)<=12582912)
);
alter table public.ocr_attempt_optical enable row level security;
revoke all on public.ocr_attempt_optical from anon,authenticated;
grant select on public.ocr_attempt_optical to authenticated;
create policy ocr_optical_admin_read on public.ocr_attempt_optical for select to authenticated using(exists(
 select 1 from public.ocr_attempts a where a.id=attempt_id and public.trimax_is_business_admin(a.business_id) and (a.pinned or a.diagnostics_expires_at>now())
));
create or replace function public.trimax_separate_ocr_optical() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.payload ? 'optical' then
   if jsonb_typeof(new.payload->'optical')='object' and octet_length((new.payload->'optical')::text)<=12582912 then
     insert into public.ocr_attempt_optical values(new.attempt_id,new.payload->'optical') on conflict(attempt_id) do update set evidence=excluded.evidence;
   end if;
   update public.ocr_attempt_diagnostics set payload=payload-'optical' where attempt_id=new.attempt_id;
 end if;
 return new;
end $$;
revoke all on function public.trimax_separate_ocr_optical() from public,anon,authenticated;
create trigger separate_ocr_optical after insert or update on public.ocr_attempt_diagnostics for each row execute function public.trimax_separate_ocr_optical();
