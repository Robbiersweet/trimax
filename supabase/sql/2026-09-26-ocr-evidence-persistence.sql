-- Append-only evidence; small operational writes. Existing worker credential and RPC grants remain unchanged.
create table if not exists public.ocr_legacy_evidence (
 attempt_id uuid not null references public.ocr_attempt_diagnostics(attempt_id) on delete cascade,
 hash text not null check(hash ~ '^[a-f0-9]{64}$'),
 chunk_index integer not null check(chunk_index between 0 and 249),
 data text not null check(octet_length(data)<=64000),
 primary key(attempt_id,hash,chunk_index)
);
alter table public.ocr_legacy_evidence enable row level security;
revoke all on public.ocr_legacy_evidence from public,anon,authenticated;
alter table public.ocr_legacy_jobs add column if not exists evidence_manifest jsonb not null default '{}';
alter table public.ocr_legacy_jobs add column if not exists terminal_summary jsonb;
alter table public.ocr_legacy_jobs drop constraint if exists ocr_legacy_jobs_state_check;
alter table public.ocr_legacy_jobs add constraint ocr_legacy_jobs_state_check check(state in ('queued','running','review','failed','completion_persistence_pending'));
create index if not exists ocr_legacy_pending_claim on public.ocr_legacy_jobs(business_id,queued_at) where state='completion_persistence_pending';

create or replace function public.trimax_update_ocr_legacy(p_business uuid,p_key text,p_attempt uuid,p_lease uuid,p_stage text,p_payload jsonb default '{}',p_status integer default null)
returns void language plpgsql security definer set search_path=public as $$
declare j public.ocr_legacy_jobs; h text; stage text; n integer; actual_hash text; next_state text; first_index integer; last_index integer; actual_bytes integer;
begin
 if not exists(select 1 from public.ocr_legacy_workers where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Invalid legacy worker credential'; end if;
 select * into j from public.ocr_legacy_jobs where attempt_id=p_attempt and business_id=p_business for update;
 if j.attempt_id is null or j.state not in ('running','completion_persistence_pending') or j.lease is distinct from p_lease or j.lease_until<now() then raise exception 'Stale legacy lease'; end if;
 if octet_length(p_payload::text)>70000 then raise exception 'Worker payload exceeds bounded persistence contract'; end if;
 if p_stage='evidence_chunk' then
  h:=p_payload->>'hash'; n:=(p_payload->>'index')::integer;
  if (p_payload->>'count')::integer not between 1 and 250 or n<0 or n>=(p_payload->>'count')::integer then raise exception 'Invalid evidence chunk'; end if;
  insert into public.ocr_legacy_evidence values(p_attempt,h,n,p_payload->>'data') on conflict do nothing;
  if not exists(select 1 from public.ocr_legacy_evidence where attempt_id=p_attempt and hash=h and chunk_index=n and data=p_payload->>'data') then raise exception 'Immutable evidence conflict'; end if;
 elsif p_stage='evidence_ready' then
  h:=p_payload->>'hash'; stage:=p_payload->>'stage';
  if stage not in ('orientation_complete','pass_complete','ocr_complete','response_ready') then raise exception 'Invalid evidence stage'; end if;
  select count(*),encode(extensions.digest(string_agg(decode(data,'base64'),''::bytea order by chunk_index),'sha256'),'hex'),min(chunk_index),max(chunk_index),sum(octet_length(decode(data,'base64'))) into n,actual_hash,first_index,last_index,actual_bytes from public.ocr_legacy_evidence where attempt_id=p_attempt and hash=h;
  if n is distinct from (p_payload->>'count')::integer or actual_hash is distinct from h or first_index<>0 or last_index<>n-1 or actual_bytes is distinct from (p_payload->>'bytes')::integer then raise exception 'Incomplete evidence'; end if;
  update public.ocr_legacy_jobs set evidence_manifest=evidence_manifest||jsonb_build_object(stage,p_payload-'stage'),
   timings=timings||jsonb_build_object(stage,now()),
   state=case when stage in ('ocr_complete','response_ready') then 'completion_persistence_pending' else state end where attempt_id=p_attempt;
  if stage in ('ocr_complete','response_ready') then
   update public.ocr_attempts set result='processing',updated_at=now(),summary=summary||jsonb_build_object('result','processing','captureState','completion_persistence_pending','legacyJobState','completion_persistence_pending','ocrStarted',true,'paymentCanApply',false,'reasons',jsonb_build_array('OCR completed — saving review result')) where id=p_attempt;
  end if;
 elsif p_stage='complete' then
  h:=j.evidence_manifest#>>'{response_ready,hash}';
  if h is null or p_payload->>'evidenceReference' is distinct from h or octet_length(p_payload::text)>4096 then raise exception 'Durable response and bounded summary required'; end if;
  next_state:=case when coalesce(p_status,200)>=400 then 'failed' else 'review' end;
  update public.ocr_legacy_jobs set state=next_state,terminal_summary=p_payload,response=null,http_status=coalesce(p_status,200),error=null,completed_at=now(),timings=timings||jsonb_build_object('reviewReady',now()) where attempt_id=p_attempt;
  -- Do not touch the verbose diagnostic document in this transaction.
  update public.ocr_attempts set result=next_state,updated_at=now(),summary=(summary-'failureStage'-'errorClass'-'httpStatus')||p_payload||jsonb_build_object('result',next_state,'legacyJobState',next_state,'captureState',next_state,'ocrStarted',true,'paymentCanApply',false) where id=p_attempt;
 elsif p_stage='failed' then
  if j.evidence_manifest ? 'ocr_complete' or j.evidence_manifest ? 'response_ready' then
   update public.ocr_legacy_jobs set state='completion_persistence_pending',error=left(p_payload->>'error',2000),lease_until=now() where attempt_id=p_attempt;
   update public.ocr_attempts set result='processing',summary=summary||jsonb_build_object('result','processing','captureState','completion_persistence_pending','legacyJobState','completion_persistence_pending','ocrStarted',true,'paymentCanApply',false,'reasons',jsonb_build_array('OCR completed — saving review result')) where id=p_attempt;
  else
   update public.ocr_legacy_jobs set state='failed',response=p_payload,http_status=500,error=left(p_payload->>'error',2000),completed_at=now() where attempt_id=p_attempt;
   update public.ocr_attempts set result='failed',summary=summary||jsonb_build_object('captureState','recognition_failed','paymentCanApply',false,'reasons',jsonb_build_array(left(p_payload->>'error',2000))) where id=p_attempt;
  end if;
 elsif p_stage<>'heartbeat' then raise exception 'Unsupported persistence stage';
 end if;
 if p_stage<>'failed' then update public.ocr_legacy_jobs set lease_until=now()+interval '3 minutes' where attempt_id=p_attempt; end if;
end $$;

create or replace view public.ocr_debug_queue with (security_invoker=true) as
select a.id,a.business_id,a.created_at,a.original_id,a.parent_id,a.result,a.summary,a.pinned,a.diagnostics_expires_at,a.diagnostic_bytes,
 coalesce(d.status,'Needs Investigation') as debug_status,coalesce(d.note,'') as investigation_note,
 coalesce(d.regression_id,'') as regression_id,d.investigated_at,d.resolved_at,d.updated_at as debug_updated_at,
 (a.summary->>'captureState' in ('image_stored','transport_failed','completion_persistence_pending') or a.summary->>'shadowHandoffState'='handoff_pending' or a.pinned or a.result in ('failed','review','duplicate','apply blocked') or
 (a.result='success' and (coalesce((a.summary->>'reconciled')::boolean,false)=false or coalesce((a.summary->>'paymentCanApply')::boolean,false)=false or
 coalesce((a.summary->>'invoicesResolved')::integer,0)<coalesce((a.summary->>'rowsDetected')::integer,0)))) as debug_worthy
from public.ocr_attempts a left join public.ocr_attempt_debug d on d.attempt_id=a.id;

create or replace function public.trimax_claim_ocr_legacy(p_business uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.ocr_legacy_jobs; optical jsonb; recovery jsonb;
begin
 if not exists(select 1 from public.ocr_legacy_workers where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Invalid legacy worker credential'; end if;
 select * into j from public.ocr_legacy_jobs where business_id=p_business and (state='queued' or (state in ('running','completion_persistence_pending') and lease_until<now())) order by queued_at for update skip locked limit 1;
 if j.attempt_id is null then return null; end if;
 update public.ocr_legacy_jobs set state=case when evidence_manifest ? 'ocr_complete' then 'completion_persistence_pending' else 'running' end,lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',claims=claims+1,timings=timings||jsonb_build_object('jobClaimed',now()) where attempt_id=j.attempt_id returning * into j;
 select evidence into optical from public.ocr_attempt_optical where attempt_id=j.source_reference;
 select convert_from(string_agg(decode(data,'base64'),''::bytea order by chunk_index),'UTF8')::jsonb into recovery from public.ocr_legacy_evidence where attempt_id=j.attempt_id and hash=coalesce(j.evidence_manifest#>>'{response_ready,hash}',j.evidence_manifest#>>'{ocr_complete,hash}');
 return jsonb_build_object('job',jsonb_build_object('attempt_id',j.attempt_id,'business_id',j.business_id,'source_reference',j.source_reference,'source_hash',j.source_hash,'input',j.input,'lease',j.lease,'lease_until',j.lease_until,'state',j.state,'claims',j.claims,'timings',j.timings,'evidence_manifest',j.evidence_manifest),'optical',optical,'recovery',recovery);
end $$;

create or replace function public.trimax_ocr_legacy_status(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts; j public.ocr_legacy_jobs; r jsonb;
begin
 select * into a from public.ocr_attempts where id=p_attempt;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 select * into j from public.ocr_legacy_jobs where attempt_id=p_attempt;
 if j.attempt_id is null then raise exception 'Legacy job unavailable'; end if;
 r:=j.response;
 if j.state in ('review','failed') and j.evidence_manifest ? 'response_ready' then
  select (convert_from(string_agg(decode(data,'base64'),''::bytea order by chunk_index),'UTF8')::jsonb)->'result' into r from public.ocr_legacy_evidence where attempt_id=p_attempt and hash=j.evidence_manifest#>>'{response_ready,hash}';
 end if;
 return jsonb_build_object('attemptId',p_attempt,'status',j.state,'timings',j.timings,'response',r,'httpStatus',j.http_status,'error',j.error,'summary',j.terminal_summary);
end $$;
