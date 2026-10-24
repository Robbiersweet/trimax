-- Operational state only. No invoice, allocation or payment writes.
begin;
create table if not exists public.ocr_worker_health (
 business_id uuid not null references public.businesses(id),
 engine text not null check(engine in ('legacy','v2-shadow')),
 instance_id uuid not null, last_seen_at timestamptz not null,
 primary key(business_id,engine)
);
alter table public.ocr_worker_health enable row level security;
revoke all on public.ocr_worker_health from public,anon,authenticated;

create or replace function public.trimax_ocr_worker_heartbeat(p_business uuid,p_engine text,p_key text,p_instance uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_instance is null or not (
  p_engine='legacy' and exists(select 1 from ocr_legacy_workers where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) or
  p_engine='v2-shadow' and exists(select 1 from ocr_shadow_flags where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex'))
 ) then raise exception 'Invalid OCR worker credential'; end if;
 insert into ocr_worker_health values(p_business,p_engine,p_instance,clock_timestamp())
 on conflict(business_id,engine) do update set instance_id=excluded.instance_id,last_seen_at=excluded.last_seen_at;
end $$;
revoke all on function public.trimax_ocr_worker_heartbeat(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.trimax_ocr_worker_heartbeat(uuid,text,text,uuid) to anon;

-- Called by an independent database schedule, as well as claim/status requests.
-- A live lease cannot extend the absolute deadline forever. Expired leases remain
-- reclaimable until the attempt/deadline budget is exhausted.
create or replace function public.trimax_reap_ocr_jobs(p_business uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare j record; n integer:=0; reason text; failure jsonb;
begin
 for j in select * from ocr_legacy_jobs where (p_business is null or business_id=p_business)
  and state in ('queued','running','completion_persistence_pending')
  and (queued_at<clock_timestamp()-interval '30 minutes' or claims>=3 and coalesce(lease_until,'-infinity'::timestamptz)<clock_timestamp())
  for update skip locked limit 200
 loop
  reason:=case when j.claims=0 then 'OCR worker unavailable. Your saved photo is retained; open the saved scan for manual review or recovery.'
   when j.claims>=3 then 'OCR recovery exhausted after repeated worker interruption. Your saved photo and evidence are retained for investigation.'
   else 'OCR processing exceeded its time budget. Your saved photo and evidence are retained for review.' end;
  failure:=jsonb_build_object('error',reason,'failureCode',case when j.claims=0 then 'OCR_WORKER_UNAVAILABLE' when j.claims>=3 then 'OCR_RETRY_EXHAUSTED' else 'OCR_JOB_DEADLINE' end,'paymentCanApply',false);
  update ocr_legacy_jobs set state='failed',lease=null,lease_until=null,response=failure,terminal_summary=failure,http_status=503,error=reason,completed_at=clock_timestamp(),timings=timings||jsonb_build_object('watchdogFailed',clock_timestamp()) where attempt_id=j.attempt_id;
  update ocr_attempts set result='failed',updated_at=clock_timestamp(),summary=summary||failure||jsonb_build_object('result','failed','legacyJobState','failed','captureState','processing_failed','reasons',jsonb_build_array(reason)) where id=j.attempt_id;
  n:=n+1;
 end loop;
 for j in select * from ocr_shadow_jobs where (p_business is null or business_id=p_business) and state in ('queued','running') and enqueued_at<clock_timestamp()-interval '30 minutes' for update skip locked limit 200
 loop
  reason:='Diagnostic OCR exceeded its processing budget. Saved capture retained.';
  update ocr_shadow_jobs set state='failed',lease=null,lease_until=null,completed_at=clock_timestamp() where legacy_attempt_id=j.legacy_attempt_id;
  update ocr_attempts set result='failed',updated_at=clock_timestamp(),summary=summary||jsonb_build_object('result','failed','paymentCanApply',false,'reasons',jsonb_build_array(reason)) where id=j.shadow_attempt_id;
  n:=n+1;
 end loop;
 -- A PWA can close between durable capture and enqueue. Account for that
 -- separate boundary too; the same saved attempt remains available to resume.
 for j in select a.id from ocr_attempts a where (p_business is null or a.business_id=p_business)
  and a.phase<2 and a.result='processing' and a.summary->>'canonicalReference' is not null
  and coalesce(a.summary->>'ocrEngine','legacy')<>'v2-shadow'
  and a.created_at<clock_timestamp()-interval '30 minutes'
  and not exists(select 1 from ocr_legacy_jobs q where q.attempt_id=a.id)
  for update of a skip locked limit 200
 loop
  update ocr_attempts set result='failed',updated_at=clock_timestamp(),summary=summary||jsonb_build_object('result','failed','failureCode','OCR_NOT_ENQUEUED','captureState','enqueue_interrupted','paymentCanApply',false,'reasons',jsonb_build_array('Capture saved but processing was not queued. Resume this saved scan; no new photo is needed.')) where id=j.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.trimax_reap_ocr_jobs(uuid) from public,anon,authenticated;

-- Preserve the existing hash/chunk/provenance and lease-fencing implementation.
do $$ begin
 if to_regprocedure('public.trimax_claim_ocr_legacy_before_lifecycle(uuid,text)') is null then
  alter function public.trimax_claim_ocr_legacy(uuid,text) rename to trimax_claim_ocr_legacy_before_lifecycle;
 end if;
end $$;
revoke all on function public.trimax_claim_ocr_legacy_before_lifecycle(uuid,text) from public,anon,authenticated;
create or replace function public.trimax_claim_ocr_legacy(p_business uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from ocr_legacy_workers where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Invalid legacy worker credential'; end if;
 perform trimax_reap_ocr_jobs(p_business);
 return trimax_claim_ocr_legacy_before_lifecycle(p_business,p_key);
end $$;
revoke all on function public.trimax_claim_ocr_legacy(uuid,text) from public,anon,authenticated;
grant execute on function public.trimax_claim_ocr_legacy(uuid,text) to anon;

create or replace function public.trimax_ocr_legacy_status(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a ocr_attempts; j ocr_legacy_jobs; h ocr_worker_health; r jsonb; processing text;
begin
 select * into a from ocr_attempts where id=p_attempt;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 perform trimax_reap_ocr_jobs(a.business_id);
 select * into j from ocr_legacy_jobs where attempt_id=p_attempt;
 if j.attempt_id is null then
  return jsonb_build_object('attemptId',p_attempt,'status','not_enqueued','processingState','not_enqueued','error','Capture saved but processing was not queued. Resume this saved scan to enqueue the same attempt.');
 end if;
 select * into h from ocr_worker_health where business_id=a.business_id and engine='legacy';
 r:=j.response;
 if j.state in ('review','failed') and j.evidence_manifest ? 'response_ready' and j.terminal_summary->>'failureCode' is null then
  select (convert_from(string_agg(decode(data,'base64'),''::bytea order by chunk_index),'UTF8')::jsonb)->'result' into r from ocr_legacy_evidence where attempt_id=p_attempt and hash=j.evidence_manifest#>>'{response_ready,hash}';
 end if;
 processing:=case when j.state in ('running','completion_persistence_pending') and coalesce(j.lease_until,'-infinity'::timestamptz)<clock_timestamp() then 'recoverable_stalled' else j.state end;
 return jsonb_build_object('attemptId',p_attempt,'status',j.state,'processingState',processing,'queuedAt',j.queued_at,'leaseUntil',j.lease_until,'claims',j.claims,'completedAt',j.completed_at,'timings',j.timings,'response',r,'httpStatus',j.http_status,'error',j.error,'summary',j.terminal_summary,
  'workerHealth',jsonb_build_object('lastSeenAt',h.last_seen_at,'instanceId',h.instance_id,'healthy',coalesce(h.last_seen_at>clock_timestamp()-interval '2 minutes',false)));
end $$;
revoke all on function public.trimax_ocr_legacy_status(uuid) from public,anon,authenticated;
grant execute on function public.trimax_ocr_legacy_status(uuid) to authenticated;
commit;
