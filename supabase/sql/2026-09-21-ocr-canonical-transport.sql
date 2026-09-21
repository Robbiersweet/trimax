-- Reuse existing private optical storage and retention. No public URLs or payment grants.
create or replace function public.trimax_enqueue_ocr_shadow(p_legacy uuid,p_shadow uuid,p_session uuid,p_hash text,p_image text,p_snapshot jsonb,p_capture jsonb,p_legacy_observed jsonb default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts; f public.ocr_shadow_flags; image_reference uuid; s jsonb; bytes text;
begin
 select * into a from public.ocr_attempts where id=p_legacy;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 select * into f from public.ocr_shadow_flags where business_id=a.business_id;
 if not coalesce(f.enabled,false) then return false; end if;

 if exists(select 1 from public.ocr_shadow_jobs where legacy_attempt_id=p_legacy) then return true; end if;
 if p_image is null then
 select i->>'base64' into bytes from public.ocr_attempt_optical o, lateral jsonb_array_elements(o.evidence->'images') i where o.attempt_id=coalesce((a.summary->>'canonicalReference')::uuid,p_legacy) and encode(extensions.digest(decode(i->>'base64','base64'),'sha256'),'hex')=p_hash limit 1;
 if bytes is null then raise exception 'Canonical capture unavailable'; end if;
 else
 if p_image !~ '^data:image/(jpeg|png|webp|heic|heif);base64,' or length(p_image)>11000000 then raise exception 'Unsupported or oversized canonical capture'; end if;
 bytes:=split_part(p_image,',',2);
 end if;
 if encode(extensions.digest(decode(bytes,'base64'),'sha256'),'hex') is distinct from p_hash then raise exception 'Canonical capture hash mismatch'; end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>4000000 then raise exception 'Invalid read-only snapshot'; end if;
 -- Reuse the existing identical image when it survived legacy retention.
 select o.attempt_id into image_reference from public.ocr_attempt_optical o
 where o.attempt_id=coalesce((a.summary->>'canonicalReference')::uuid,p_legacy) and exists(select 1 from jsonb_array_elements(o.evidence->'images') i where i->>'base64'=bytes);
 image_reference := coalesce(image_reference,p_shadow);
 s := a.summary || jsonb_build_object('attemptId',p_shadow,'originalId',p_shadow,'parentId',null,'kind','scan','result','processing',
 'ocrEngine','v2-shadow','captureSessionId',p_session,'legacyAttemptId',p_legacy,'shadowAttemptId',p_shadow,
 'sourceImageHash',p_hash,'sameInputBytes',true,'captureTimings',p_capture,'paymentCanApply',false,
 'rowsDetected',0,'invoicesResolved',0,'reconciled',false,'documentTotal',null,'checkNumber',null,'checkDate',null,
 'durationMs',0,'reasons',jsonb_build_array('Queued shadow comparison; legacy remains authoritative'));
 insert into public.ocr_attempts(id,business_id,original_id,parent_id,phase,result,summary,diagnostics_expires_at,diagnostic_bytes)
 values(p_shadow,a.business_id,p_shadow,null,0,'processing',s,now()+interval '30 days',octet_length(p_snapshot::text));
 insert into public.ocr_attempt_diagnostics(attempt_id,payload) values(p_shadow,jsonb_build_object('stage','shadow-queued','snapshot',p_snapshot,'canonicalCaptureReference',image_reference,'legacyObserved',p_legacy_observed));
 if image_reference=p_shadow then
  insert into public.ocr_attempt_optical(attempt_id,evidence) values(p_shadow,jsonb_build_object('images',jsonb_build_array(jsonb_build_object('label','Canonical shared capture','base64',bytes,'mime',split_part(split_part(p_image,';',1),':',2),'sha256',p_hash))));
 end if;
 insert into public.ocr_shadow_jobs(legacy_attempt_id,shadow_attempt_id,business_id,capture_session_id,source_hash,source_reference)
 values(p_legacy,p_shadow,a.business_id,p_session,p_hash,image_reference);
 update public.ocr_attempts set summary=summary || jsonb_build_object('ocrEngine','legacy','captureSessionId',p_session,'legacyAttemptId',p_legacy,'shadowAttemptId',p_shadow,'sourceImageHash',p_hash,'sameInputBytes',true,'captureTimings',p_capture) where id=p_legacy;
 return true;
end $$;
revoke all on function public.trimax_enqueue_ocr_shadow(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.trimax_enqueue_ocr_shadow(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb) to authenticated;


create or replace function public.trimax_store_ocr_capture(p_attempt uuid,p_hash text,p_image text,p_metadata jsonb,p_shadow uuid default null,p_snapshot jsonb default null,p_capture jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts; bytes text; current_hash text; queued boolean:=false; stored integer; reference uuid; image_mime text;
begin
 select * into a from public.ocr_attempts where id=p_attempt for update;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 if a.phase=2 then raise exception 'Capture already completed'; end if;
 reference:=p_attempt;
 if p_image is null and p_metadata->>'retainedReference' is not null then
 reference:=(p_metadata->>'retainedReference')::uuid;
 select i->>'base64',i->>'mime' into bytes,image_mime from public.ocr_attempt_optical o join public.ocr_attempts original on original.id=o.attempt_id,
 lateral jsonb_array_elements(o.evidence->'images') i where o.attempt_id=reference and original.business_id=a.business_id and (original.pinned or original.diagnostics_expires_at>now()) and encode(extensions.digest(decode(i->>'base64','base64'),'sha256'),'hex')=p_hash limit 1;
 if bytes is null then raise exception 'Retained canonical source unavailable'; end if;
 p_image:='data:'||image_mime||';base64,'||bytes;
 end if;
 if p_hash !~ '^[a-f0-9]{64}$' or p_image is null or p_image !~ '^data:image/(jpeg|png|webp);base64,' or length(p_image)>11000000 then raise exception 'Invalid canonical capture'; end if;
 bytes:=split_part(p_image,',',2); stored:=octet_length(decode(bytes,'base64'));
 if encode(extensions.digest(decode(bytes,'base64'),'sha256'),'hex') is distinct from p_hash then raise exception 'Canonical capture hash mismatch'; end if;
 select evidence->>'canonicalHash' into current_hash from public.ocr_attempt_optical where attempt_id=p_attempt;
 if a.summary->>'sourceImageHash' is not null and (a.summary->>'sourceImageHash'<>p_hash or a.summary->>'canonicalReference'<>reference::text) then raise exception 'Canonical reference is immutable'; end if;
 if current_hash is not null and current_hash<>p_hash then raise exception 'Canonical capture is immutable'; end if;
 if octet_length(coalesce(p_metadata,'{}')::text)>8192 then raise exception 'Metadata too large'; end if;
 insert into public.ocr_attempt_diagnostics(attempt_id,payload) values(p_attempt,'{}') on conflict do nothing;
 if current_hash is null and reference=p_attempt then
 insert into public.ocr_attempt_optical(attempt_id,evidence) values(p_attempt,jsonb_build_object('canonicalHash',p_hash,'images',jsonb_build_array(coalesce(p_metadata,'{}')||jsonb_build_object('label','Canonical OCR input','base64',bytes,'sha256',p_hash,'mime',split_part(split_part(p_image,';',1),':',2),'storedBytes',stored)))) on conflict(attempt_id) do update set evidence=excluded.evidence;
 end if;
 update public.ocr_attempts set summary=summary||jsonb_build_object('sourceImageHash',p_hash,'canonicalReference',reference),diagnostics_expires_at=created_at+interval '30 days' where id=p_attempt;
 update public.ocr_attempt_diagnostics set payload=payload||jsonb_build_object('canonicalCapture',coalesce(p_metadata,'{}')||jsonb_build_object('reference',reference,'sha256',p_hash,'storedBytes',stored,'storedAt',now())) where attempt_id=p_attempt;
 -- Atomic image + outbox commit survives browser reload and legacy failure.
 if p_shadow is not null and p_snapshot is not null then
 begin
 queued:=public.trimax_enqueue_ocr_shadow(p_attempt,p_shadow,p_attempt,p_hash,null,p_snapshot,p_capture,null);
 exception when others then
 insert into public.ocr_attempts(id,business_id,original_id,phase,result,summary,diagnostics_expires_at,diagnostic_bytes)
 values(p_shadow,a.business_id,p_shadow,2,'failed',a.summary||jsonb_build_object('attemptId',p_shadow,'originalId',p_shadow,'result','failed','ocrEngine','v2-shadow','legacyAttemptId',p_attempt,'captureSessionId',p_attempt,'sourceImageHash',p_hash,'paymentCanApply',false,'reasons',jsonb_build_array('Shadow handoff failed: '||SQLERRM)),now()+interval '30 days',100);
 insert into public.ocr_attempt_diagnostics values(p_shadow,jsonb_build_object('stage','shadow-handoff','error',SQLERRM));
 update public.ocr_attempts set summary=summary||jsonb_build_object('shadowAttemptId',p_shadow,'legacyAttemptId',p_attempt,'sameInputBytes',true) where id=p_attempt;
 end;
 end if;
 return jsonb_build_object('reference',reference,'sha256',p_hash,'storedBytes',stored,'shadowQueued',queued);
end $$;
revoke all on function public.trimax_store_ocr_capture(uuid,text,text,jsonb,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.trimax_store_ocr_capture(uuid,text,text,jsonb,uuid,jsonb,jsonb) to authenticated;

create or replace function public.trimax_preserve_capture_pair() returns trigger language plpgsql set search_path=public as $$
begin
 new.summary:=new.summary||jsonb_strip_nulls(jsonb_build_object('sourceImageHash',old.summary->'sourceImageHash','canonicalReference',old.summary->'canonicalReference','shadowAttemptId',old.summary->'shadowAttemptId','legacyAttemptId',old.summary->'legacyAttemptId','captureSessionId',old.summary->'captureSessionId','sameInputBytes',old.summary->'sameInputBytes'));
 return new;
end $$;
drop trigger if exists preserve_capture_pair on public.ocr_attempts;
create trigger preserve_capture_pair before update on public.ocr_attempts for each row execute function public.trimax_preserve_capture_pair();

create or replace function public.trimax_cleanup_ocr_diagnostics()
returns integer language plpgsql security definer set search_path=public as $$
declare deleted_count integer;
begin
 update public.ocr_attempts set phase=2,result='failed',summary=summary||jsonb_build_object('result','failed','paymentCanApply',false,'failureStage','terminal-recovery','errorClass','ClientCompletionMissing','reasons',jsonb_build_array('Client completion was interrupted; retained evidence requires review.'))
 where phase<2 and updated_at<now()-interval '1 hour' and result='processing' and coalesce(summary->>'ocrEngine','legacy')<>'v2-shadow';
 delete from public.ocr_attempt_diagnostics d using public.ocr_attempts a where d.attempt_id=a.id and not a.pinned and a.diagnostics_expires_at<=now();
 get diagnostics deleted_count=row_count;
 update public.ocr_attempts set diagnostic_bytes=0 where diagnostic_bytes>0 and not pinned and diagnostics_expires_at<=now();
 return deleted_count;
end $$;
