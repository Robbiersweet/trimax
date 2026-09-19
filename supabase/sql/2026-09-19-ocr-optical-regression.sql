-- Run in SQL Editor as postgres. All synthetic attempts are rolled back.
begin;
do $$
declare b uuid; u uuid; original uuid:=gen_random_uuid(); retry uuid:=gen_random_uuid(); success_id uuid:=gen_random_uuid(); summary jsonb;
begin
 select business_id,user_id into b,u from public.business_users where role in ('owner','admin') and user_id is not null limit 1;
 if b is null then raise exception 'An owner/admin fixture is required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 summary:=jsonb_build_object('attemptId',original,'result','failed','paymentCanApply',false,'reasons',jsonb_build_array('Synthetic retention regression'));
 perform public.trimax_save_ocr_attempt(b,original,original,null,0,summary,'{"stage":"pending"}');
 perform public.trimax_save_ocr_attempt(b,original,original,null,2,summary,'{"complete":"original","optical":{"images":[],"notes":["synthetic optical retention"]}}');
 perform public.trimax_save_ocr_attempt(b,original,original,null,1,summary,'{"late":"must not overwrite"}');
 if (select payload->>'complete' from public.ocr_attempt_diagnostics where attempt_id=original) is distinct from 'original' then raise exception 'Terminal record overwritten'; end if;
 perform public.trimax_save_ocr_attempt(b,retry,original,original,2,summary||jsonb_build_object('attemptId',retry,'result','review'),'{"complete":"retry","optical":{"images":[],"notes":[]}}');
 if (select parent_id from public.ocr_attempts where id=retry) is distinct from original then raise exception 'Retry parent missing'; end if;
 perform public.trimax_save_ocr_attempt(b,success_id,success_id,null,2,summary||jsonb_build_object('attemptId',success_id,'result','success'),'{"must":"discard","optical":{"images":[],"notes":[]}}');
 if exists(select 1 from public.ocr_attempt_diagnostics where attempt_id=success_id) then raise exception 'Success retained verbose payload'; end if;
 if not exists(select 1 from public.ocr_attempt_optical where attempt_id=original) then raise exception 'Optical missing'; end if;
 if exists(select 1 from public.ocr_attempt_diagnostics where attempt_id=original and payload ? 'optical') then raise exception 'Optical eagerly embedded'; end if;
 if exists(select 1 from public.ocr_attempt_optical where attempt_id=success_id) then raise exception 'Clean success retained optical'; end if;
 perform public.trimax_pin_ocr_attempt(original,true);
 update public.ocr_attempts set diagnostics_expires_at=now()-interval '1 day' where id in (original,retry);
 perform public.trimax_cleanup_ocr_diagnostics();
 if not exists(select 1 from public.ocr_attempt_diagnostics where attempt_id=original) then raise exception 'Pinned payload expired'; end if;
 if not exists(select 1 from public.ocr_attempt_optical where attempt_id=original) then raise exception 'Pinned optical deleted'; end if;
 if exists(select 1 from public.ocr_attempt_optical where attempt_id=retry) then raise exception 'Expired optical survives'; end if;
 if exists(select 1 from public.ocr_attempt_diagnostics where attempt_id=retry) then raise exception 'Unpinned payload not cleaned'; end if;
 if not exists(select 1 from public.ocr_attempts where id=retry) then raise exception 'Summary deleted'; end if;
 perform public.trimax_pin_ocr_attempt(original,false);
 perform public.trimax_cleanup_ocr_diagnostics();
 if exists(select 1 from public.ocr_attempt_diagnostics where attempt_id=original) then raise exception 'Unpinned expired payload remains'; end if;
 if exists(select 1 from public.ocr_attempt_optical where attempt_id=original) then raise exception 'Unpinned optical survives cleanup'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.trimax_save_ocr_attempt(b,gen_random_uuid(),gen_random_uuid(),null,2,summary,null);
  raise exception 'Unauthenticated write allowed';
 exception when others then
  if sqlerrm <> 'Owner/admin workspace access required' then raise; end if;
 end;
end $$;
select 'PASS: optical separation, success exclusion, pinned survival, cascade cleanup, terminal immutability, retry linkage, success summary only, pin retention, expiry cleanup, summary preservation, auth gate' as regression;
rollback;
