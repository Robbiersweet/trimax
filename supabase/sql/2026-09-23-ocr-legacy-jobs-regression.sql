-- Transaction-only queue/access/failure injection. Never commits test attempts or credentials.
begin;
do $$
declare b uuid; u uuid; test_id uuid:=gen_random_uuid(); x jsonb; y jsonb; old_lease uuid; new_lease uuid;
begin
 select business_id,created_by into b,u from public.ocr_attempts where id='17b4794f-cf3b-49d9-8ec7-90ae7992021b';
 if b is null then raise exception 'Test workspace anchor unavailable'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.ocr_legacy_workers(business_id,enabled,worker_key_hash) values(b,true,encode(extensions.digest('transaction-only-test','sha256'),'hex')) on conflict(business_id) do update set enabled=true,worker_key_hash=excluded.worker_key_hash;
 insert into public.ocr_attempts(id,business_id,created_by,original_id,summary,diagnostics_expires_at)
 values(test_id,b,u,test_id,jsonb_build_object('attemptId',test_id,'sourceImageHash',repeat('a',64),'canonicalReference',test_id,'ocrEngine','legacy'),now()+interval '1 day');
 insert into public.ocr_attempt_diagnostics(attempt_id,payload) values(test_id,'{}');
 insert into public.ocr_attempt_optical(attempt_id,evidence) values(test_id,jsonb_build_object('images',jsonb_build_array(jsonb_build_object('mime','image/png','base64','dGVzdA=='))));
 x:=public.trimax_enqueue_ocr_legacy(test_id,'{"documentType":"remittance_stub","retryStrategy":"standard"}');
 y:=public.trimax_enqueue_ocr_legacy(test_id,'{"documentType":"remittance_stub","retryStrategy":"standard"}');
 if x<>y or (select count(*) from public.ocr_legacy_jobs where attempt_id=test_id)<>1 then raise exception 'Duplicate enqueue'; end if;
 update public.ocr_legacy_jobs set queued_at='-infinity' where attempt_id=test_id;
 x:=public.trimax_claim_ocr_legacy(b,'transaction-only-test'); old_lease:=(x->'job'->>'lease')::uuid;
 if (x->'job'->>'attempt_id')::uuid<>test_id or x->'optical' is null then raise exception 'Wrong claim or missing image'; end if;
 perform public.trimax_update_ocr_legacy(b,'transaction-only-test',test_id,old_lease,'pass_complete','{"text":"Completed evidence"}');
 update public.ocr_legacy_jobs set lease_until=now()-interval '1 second' where attempt_id=test_id;
 x:=public.trimax_claim_ocr_legacy(b,'transaction-only-test');new_lease:=(x->'job'->>'lease')::uuid;
 if old_lease=new_lease then raise exception 'Lease not reclaimed'; end if;
 begin perform public.trimax_update_ocr_legacy(b,'transaction-only-test',test_id,old_lease,'complete','{}',200);raise exception 'Old lease accepted'; exception when others then if sqlerrm<>'Stale legacy lease' then raise; end if;end;
 begin perform public.trimax_claim_ocr_legacy(b,'wrong-shadow-credential');raise exception 'Wrong credential accepted';exception when others then if sqlerrm<>'Invalid legacy worker credential' then raise; end if;end;
 perform public.trimax_update_ocr_legacy(b,'transaction-only-test',test_id,new_lease,'complete','{"structuredRowEvidence":[{"rowId":"row-1"}],"stubText":"observed"}',200);
 x:=public.trimax_ocr_legacy_status(test_id);
 if x->>'status'<>'review' or x->'response'->>'stubText'<>'observed' then raise exception 'Result not durable'; end if;
 if (select jsonb_array_length(checkpoints) from public.ocr_legacy_jobs where attempt_id=test_id)<>1 then raise exception 'Checkpoint lost after reclaim'; end if;
 if (select summary->>'paymentCanApply' from public.ocr_attempts where id=test_id)<>'false' then raise exception 'Unsafe authority'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.trimax_ocr_legacy_status(test_id);raise exception 'Unauthenticated read accepted';exception when others then if sqlerrm<>'Owner/admin attempt required' then raise; end if;end;
end $$;
rollback;
select 'PASS duplicate enqueue, image claim, durable checkpoint, stale lease fencing/reclaim, credential isolation, persisted result, unauthenticated rejection; transaction rolled back' as result;
