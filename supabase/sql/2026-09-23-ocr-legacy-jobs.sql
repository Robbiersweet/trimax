-- Legacy extraction jobs reference the existing durable attempts and canonical captures.
-- This credential is deliberately different from the diagnostic-only shadow credential.
create table if not exists public.ocr_legacy_workers (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 worker_key_hash text not null check(worker_key_hash ~ '^[a-f0-9]{64}$')
);
alter table public.ocr_legacy_workers enable row level security;
revoke all on public.ocr_legacy_workers from anon,authenticated;
create table if not exists public.ocr_legacy_jobs (
 attempt_id uuid primary key references public.ocr_attempts(id) on delete cascade,
 business_id uuid not null references public.businesses(id),
 source_reference uuid not null references public.ocr_attempts(id),
 source_hash text not null,
 input jsonb not null,
 state text not null default 'queued' check(state in ('queued','running','review','failed')),
 lease uuid, lease_until timestamptz, claims integer not null default 0,
 timings jsonb not null default '{}',
 checkpoints jsonb not null default '[]',
 response jsonb, http_status integer, error text,
 queued_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.ocr_legacy_jobs enable row level security;
revoke all on public.ocr_legacy_jobs from anon,authenticated;
create index if not exists ocr_legacy_claim on public.ocr_legacy_jobs(queued_at) where state in ('queued','running');

create or replace function public.trimax_enqueue_ocr_legacy(p_attempt uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts; j public.ocr_legacy_jobs; ref uuid;
begin
 select * into a from public.ocr_attempts where id=p_attempt for update;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 select * into j from public.ocr_legacy_jobs where attempt_id=p_attempt;
 if j.attempt_id is not null then return jsonb_build_object('attemptId',p_attempt,'status',j.state); end if;
 if a.phase=2 or a.summary->>'ocrEngine'='v2-shadow' then raise exception 'A terminal or shadow attempt cannot become a legacy job'; end if;
 if not exists(select 1 from public.ocr_legacy_workers where business_id=a.business_id and enabled) then raise exception 'Legacy worker not enabled'; end if;
 if p_input is null or p_input->>'documentType' is null or p_input->>'retryStrategy' is null or octet_length(p_input::text)>16384 or p_input->>'documentType' not in ('remittance_stub','check_only','full_check_stub') or p_input->>'retryStrategy' not in ('standard','alternate') then raise exception 'Invalid extraction options'; end if;
 ref:=(a.summary->>'canonicalReference')::uuid;
 if ref is null or not exists(select 1 from public.ocr_attempt_optical o join public.ocr_attempts original on original.id=o.attempt_id where o.attempt_id=ref and original.business_id=a.business_id and (original.pinned or original.diagnostics_expires_at>now())) then raise exception 'Durable canonical capture required'; end if;
 insert into public.ocr_legacy_jobs(attempt_id,business_id,source_reference,source_hash,input,timings)
 values(p_attempt,a.business_id,ref,a.summary->>'sourceImageHash',jsonb_build_object('documentType',p_input->>'documentType','retryStrategy',p_input->>'retryStrategy','diagnosticReplay',coalesce((p_input->>'diagnosticReplay')::boolean,false)),jsonb_build_object('jobQueued',now(),'captureStored',(select payload->'canonicalCapture'->'storedAt' from public.ocr_attempt_diagnostics where attempt_id=p_attempt)));
 update public.ocr_attempts set result='processing',summary=summary||jsonb_build_object('result','processing','captureState','processing','legacyJobState','queued','paymentCanApply',false) where id=p_attempt;
 return jsonb_build_object('attemptId',p_attempt,'status','queued');
end $$;

create or replace function public.trimax_ocr_legacy_status(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts; j public.ocr_legacy_jobs;
begin
 select * into a from public.ocr_attempts where id=p_attempt;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 select * into j from public.ocr_legacy_jobs where attempt_id=p_attempt;
 if j.attempt_id is null then raise exception 'Legacy job unavailable'; end if;
 return jsonb_build_object('attemptId',p_attempt,'status',j.state,'timings',j.timings,'response',j.response,'httpStatus',j.http_status,'error',j.error);
end $$;

create or replace function public.trimax_claim_ocr_legacy(p_business uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.ocr_legacy_jobs; optical jsonb;
begin
 if not exists(select 1 from public.ocr_legacy_workers where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Invalid legacy worker credential'; end if;
 select * into j from public.ocr_legacy_jobs where business_id=p_business and (state='queued' or (state='running' and lease_until<now())) order by queued_at for update skip locked limit 1;
 if j.attempt_id is null then return null; end if;
 update public.ocr_legacy_jobs set state='running',lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',claims=claims+1,timings=timings||jsonb_build_object('jobClaimed',now()) where attempt_id=j.attempt_id returning * into j;
 select evidence into optical from public.ocr_attempt_optical where attempt_id=j.source_reference;
 return jsonb_build_object('job',to_jsonb(j)-'response'-'checkpoints','optical',optical);
end $$;

create or replace function public.trimax_update_ocr_legacy(p_business uuid,p_key text,p_attempt uuid,p_lease uuid,p_stage text,p_payload jsonb default '{}',p_status integer default null)
returns void language plpgsql security definer set search_path=public as $$
declare j public.ocr_legacy_jobs; terminal boolean; next_state text;
begin
 if not exists(select 1 from public.ocr_legacy_workers where business_id=p_business and enabled and worker_key_hash=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Invalid legacy worker credential'; end if;
 select * into j from public.ocr_legacy_jobs where attempt_id=p_attempt and business_id=p_business for update;
 if j.state<>'running' or j.lease is distinct from p_lease or j.lease_until<now() then raise exception 'Stale legacy lease'; end if;
 if p_stage not in ('heartbeat','orientation_complete','pass_complete','ocr_complete','complete','failed') or octet_length(p_payload::text)>12000000 then raise exception 'Invalid worker checkpoint'; end if;
 terminal:=p_stage in ('complete','failed');
 next_state:=case when p_stage='failed' or coalesce(p_status,200)>=400 then 'failed' else 'review' end;
 update public.ocr_legacy_jobs set lease_until=now()+interval '3 minutes',
 timings=case when p_stage='heartbeat' then timings else timings||jsonb_build_object(p_stage,now())||case when terminal then jsonb_build_object('reviewReady',now()) else '{}'::jsonb end end,
 checkpoints=case when p_stage in ('orientation_complete','pass_complete','ocr_complete') then checkpoints||jsonb_build_array(jsonb_build_object('stage',p_stage,'at',now(),'evidence',p_payload)) else checkpoints end,
 state=case when terminal then next_state else state end,
 response=case when terminal then p_payload else response end,http_status=case when terminal then coalesce(p_status,500) else http_status end,
 error=case when terminal then p_payload->>'error' else error end,completed_at=case when terminal then now() else completed_at end
 where attempt_id=p_attempt;
 if terminal then
 update public.ocr_attempt_diagnostics set payload=payload||jsonb_build_object('response',p_payload,'stage','legacy-background-complete','httpStatus',coalesce(p_status,500),'legacyJob',jsonb_build_object('timings',j.timings||jsonb_build_object('reviewReady',now()),'sourceHash',j.source_hash,'claims',j.claims)) where attempt_id=p_attempt;
 update public.ocr_attempts set phase=greatest(phase,1),result=case when next_state='review' then 'review' else 'failed' end,
 summary=summary||jsonb_build_object('result',next_state,'legacyJobState',next_state,'captureState',next_state,'durationMs',round(extract(epoch from(now()-(j.timings->>'jobClaimed')::timestamptz))*1000),'paymentCanApply',false,'rowsDetected',jsonb_array_length(coalesce(p_payload->'structuredRowEvidence','[]'::jsonb)),'reasons',jsonb_build_array(case when next_state='review' then 'OCR complete — open payment review' else coalesce(p_payload->>'error','Legacy OCR failed') end)) where id=p_attempt;
 end if;
end $$;
revoke all on function public.trimax_enqueue_ocr_legacy(uuid,jsonb),public.trimax_ocr_legacy_status(uuid),public.trimax_claim_ocr_legacy(uuid,text),public.trimax_update_ocr_legacy(uuid,text,uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.trimax_enqueue_ocr_legacy(uuid,jsonb),public.trimax_ocr_legacy_status(uuid) to authenticated;
grant execute on function public.trimax_claim_ocr_legacy(uuid,text),public.trimax_update_ocr_legacy(uuid,text,uuid,uuid,text,jsonb,integer) to anon;

create or replace function public.trimax_recent_ocr_legacy(p_business uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.trimax_is_business_admin(p_business) then raise exception 'Owner/admin required'; end if;
 return coalesce((select jsonb_agg(x) from (select j.attempt_id as "attemptId",j.state as status,j.input,a.summary from public.ocr_legacy_jobs j join public.ocr_attempts a on a.id=j.attempt_id where j.business_id=p_business and a.created_by=auth.uid() and (a.pinned or a.diagnostics_expires_at>now()) order by j.queued_at desc limit 5) x),'[]');
end $$;
revoke all on function public.trimax_recent_ocr_legacy(uuid) from public,anon;
grant execute on function public.trimax_recent_ocr_legacy(uuid) to authenticated;

-- Existing diagnostics cleanup deletes this dependent job payload under the same retention policy.
do $$ begin if not exists(select 1 from pg_constraint where conname='ocr_legacy_diagnostics_retention') then alter table public.ocr_legacy_jobs add constraint ocr_legacy_diagnostics_retention foreign key(attempt_id) references public.ocr_attempt_diagnostics(attempt_id) on delete cascade; end if; end $$;
