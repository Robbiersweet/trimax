-- All fixtures and investigation metadata are rolled back.
begin;
do $$
declare b uuid; u uuid; first_id uuid:=gen_random_uuid(); retry_id uuid:=gen_random_uuid(); clean_id uuid:=gen_random_uuid();
 original_summary jsonb; original_payload jsonb; s jsonb;
begin
 select business_id,user_id into b,u from public.business_users where role in ('owner','admin') and user_id is not null limit 1;
 if b is null then raise exception 'Owner/admin fixture required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 s:=jsonb_build_object('result','failed','reconciled',false,'paymentCanApply',false,'rowsDetected',5,'invoicesResolved',3);
 perform public.trimax_save_ocr_attempt(b,first_id,first_id,null,2,s,'{"evidence":"unchanged original"}');
 perform public.trimax_save_ocr_attempt(b,retry_id,first_id,first_id,2,s||'{"result":"review"}', '{"evidence":"unchanged retry"}');
 perform public.trimax_save_ocr_attempt(b,clean_id,clean_id,null,2,s||'{"result":"success","reconciled":true,"paymentCanApply":true,"invoicesResolved":5}',null);
 select summary into original_summary from public.ocr_attempts where id=first_id;
 select payload into original_payload from public.ocr_attempt_diagnostics where attempt_id=first_id;
 perform set_config('role','authenticated',true);
 if (select count(*) from public.ocr_debug_queue where id in(first_id,retry_id,clean_id) and debug_worthy and debug_status='Needs Investigation')<>2 then raise exception 'Default queue criteria failed'; end if;
 if (select original_id from public.ocr_debug_queue where id=retry_id)<>first_id then raise exception 'Retry link failed'; end if;
 perform public.trimax_update_ocr_debug(first_id,'Investigated','Synthetic annotation regression','fixture-D');
 if (select investigated_at from public.ocr_attempt_debug where attempt_id=first_id) is null then raise exception 'Investigation timestamp missing'; end if;
 if (select summary from public.ocr_attempts where id=first_id) is distinct from original_summary or (select payload from public.ocr_attempt_diagnostics where attempt_id=first_id) is distinct from original_payload then raise exception 'Annotation changed OCR evidence'; end if;
 perform public.trimax_update_ocr_debug(first_id,'Regression Covered','Fixture added','fixture-D');
 if (select resolved_at from public.ocr_attempt_debug where attempt_id=first_id) is not null then raise exception 'Regression automatically resolved attempt'; end if;
 perform public.trimax_update_ocr_debug(first_id,'Resolved','Synthetic acceptance complete','fixture-D');
 if (select resolved_at from public.ocr_attempt_debug where attempt_id=first_id) is null then raise exception 'Explicit resolution timestamp missing'; end if;
 perform public.trimax_update_ocr_debug(first_id,'Needs Investigation','','');
 if (select resolved_at from public.ocr_attempt_debug where attempt_id=first_id) is not null then raise exception 'Reopened case retained resolved status'; end if;
 perform set_config('role','postgres',true);
 update public.ocr_attempts set diagnostics_expires_at=now()-interval '1 day' where id=first_id;
 perform public.trimax_cleanup_ocr_diagnostics();
 perform set_config('role','authenticated',true);
 if not exists(select 1 from public.ocr_debug_queue where id=first_id) or not exists(select 1 from public.ocr_attempt_debug where attempt_id=first_id) or exists(select 1 from public.ocr_attempt_diagnostics where attempt_id=first_id) then raise exception 'Expired diagnostics did not preserve debug summary and metadata'; end if;
 -- A signed-in identity with no workspace role must see no diagnostics or metadata.
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.ocr_debug_queue where id in(first_id,retry_id,clean_id)) or exists(select 1 from public.ocr_attempt_debug where attempt_id=first_id) then raise exception 'Non-admin read was allowed'; end if;
 begin
  perform public.trimax_update_ocr_debug(first_id,'Resolved','Unauthorized','');
  raise exception 'Non-admin write was allowed';
 exception when others then
  if sqlerrm<>'Owner/admin workspace access required' then raise; end if;
 end;
 perform set_config('role','anon',true);
 begin
  perform 1 from public.ocr_debug_queue;
  raise exception 'Anonymous view read was allowed';
 exception when insufficient_privilege then null;
 end;
 perform set_config('role','postgres',true);
end $$;
select 'PASS: owner/admin access, anonymous/non-admin denial, default queue, retry link, independent metadata, expired summary preservation, explicit-only resolution' as regression;
rollback;
