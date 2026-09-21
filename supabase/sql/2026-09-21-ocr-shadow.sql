-- Phase 6: an isolated queue attached to existing diagnostic attempts.
-- All flags default OFF. Worker credentials grant only these narrow queue RPCs.
create table public.ocr_shadow_flags (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 native_still boolean not null default false,
 worker_key_hash text check(worker_key_hash ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz not null default now()
);
alter table public.ocr_shadow_flags enable row level security;
revoke all on public.ocr_shadow_flags from anon, authenticated;
grant select(business_id,enabled,native_still,updated_at) on public.ocr_shadow_flags to authenticated;
create policy shadow_flags_admin on public.ocr_shadow_flags for select to authenticated
 using(public.trimax_is_business_admin(business_id));

create table public.ocr_shadow_jobs (
 legacy_attempt_id uuid primary key references public.ocr_attempts(id) on delete cascade,
 shadow_attempt_id uuid unique not null references public.ocr_attempts(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,
 capture_session_id uuid not null,
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 source_reference uuid not null references public.ocr_attempts(id),
 state text not null default 'queued' check(state in ('queued','running','completed','failed')),
 lease uuid, lease_until timestamptz, enqueued_at timestamptz not null default now(),
 completed_at timestamptz, result_hash text
);
alter table public.ocr_shadow_jobs enable row level security;
revoke all on public.ocr_shadow_jobs from anon,authenticated;
grant select on public.ocr_shadow_jobs to authenticated;
create policy shadow_jobs_admin on public.ocr_shadow_jobs for select to authenticated
 using(public.trimax_is_business_admin(business_id));
create index ocr_shadow_pending on public.ocr_shadow_jobs(business_id,enqueued_at) where state in ('queued','running');

create or replace function public.trimax_set_ocr_shadow(p_business uuid,p_enabled boolean,p_native boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.trimax_is_business_admin(p_business) then raise exception 'Owner/admin required'; end if;
 insert into public.ocr_shadow_flags(business_id,enabled,native_still) values(p_business,p_enabled,p_native)
 on conflict(business_id) do update set enabled=p_enabled,native_still=p_native,updated_at=now();
end $$;
revoke all on function public.trimax_set_ocr_shadow(uuid,boolean,boolean) from public,anon;
grant execute on function public.trimax_set_ocr_shadow(uuid,boolean,boolean) to authenticated;

create or replace function public.trimax_enqueue_ocr_shadow(p_legacy uuid,p_shadow uuid,p_session uuid,p_hash text,p_image text,p_snapshot jsonb,p_capture jsonb,p_legacy_observed jsonb default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts; f public.ocr_shadow_flags; image_reference uuid; s jsonb; bytes text;
begin
 select * into a from public.ocr_attempts where id=p_legacy;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 select * into f from public.ocr_shadow_flags where business_id=a.business_id;
 if not coalesce(f.enabled,false) then return false; end if;
 if a.phase<>2 then raise exception 'Legacy must finish before shadow enqueue'; end if;
 if exists(select 1 from public.ocr_shadow_jobs where legacy_attempt_id=p_legacy) then return true; end if;
 if p_image is null or p_image !~ '^data:image/(jpeg|png|webp|heic|heif);base64,' or length(p_image)>11000000 then raise exception 'Unsupported or oversized canonical capture'; end if;
 bytes := split_part(p_image,',',2);
 if encode(extensions.digest(decode(bytes,'base64'),'sha256'),'hex') is distinct from p_hash then raise exception 'Canonical capture hash mismatch'; end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>4000000 then raise exception 'Invalid read-only snapshot'; end if;
 -- Reuse the existing identical image when it survived legacy retention.
 select p_legacy into image_reference from public.ocr_attempt_optical o
 where o.attempt_id=p_legacy and exists(select 1 from jsonb_array_elements(o.evidence->'images') i where i->>'base64'=bytes);
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

create or replace function public.trimax_claim_ocr_shadow(p_business uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.ocr_shadow_jobs; f public.ocr_shadow_flags; payload jsonb; optical jsonb;
begin
 select * into f from public.ocr_shadow_flags where business_id=p_business;
 if f.worker_key_hash is null or f.worker_key_hash is distinct from encode(extensions.digest(p_key,'sha256'),'hex') then raise exception 'Invalid worker credential'; end if;
 if not f.enabled then return null; end if;
 select q.* into j from public.ocr_shadow_jobs q join public.ocr_attempts a on a.id=q.shadow_attempt_id
 where q.business_id=p_business and (q.state='queued' or q.state='running' and q.lease_until<now()) and (a.pinned or a.diagnostics_expires_at>now())
 order by q.enqueued_at for update of q skip locked limit 1;
 if j.shadow_attempt_id is null then return null; end if;
 update public.ocr_shadow_jobs set state='running',lease=gen_random_uuid(),lease_until=now()+interval '15 minutes' where legacy_attempt_id=j.legacy_attempt_id returning * into j;
 select d.payload into payload from public.ocr_attempt_diagnostics d where d.attempt_id=j.shadow_attempt_id;
 select o.evidence into optical from public.ocr_attempt_optical o where o.attempt_id=j.source_reference;
 return jsonb_build_object('job',to_jsonb(j),'input',jsonb_build_object('snapshot',payload->'snapshot'),'optical',optical);
end $$;
revoke all on function public.trimax_claim_ocr_shadow(uuid,text) from public;
grant execute on function public.trimax_claim_ocr_shadow(uuid,text) to anon,authenticated;

create or replace function public.trimax_complete_ocr_shadow(p_business uuid,p_key text,p_legacy uuid,p_lease uuid,p_result jsonb,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
declare j public.ocr_shadow_jobs; f public.ocr_shadow_flags; s jsonb; r jsonb;
begin
 select * into f from public.ocr_shadow_flags where business_id=p_business;
 if f.worker_key_hash is null or f.worker_key_hash is distinct from encode(extensions.digest(p_key,'sha256'),'hex') then raise exception 'Invalid worker credential'; end if;
 select * into j from public.ocr_shadow_jobs where legacy_attempt_id=p_legacy and business_id=p_business for update;
 if j.state is distinct from 'running' or j.lease is distinct from p_lease or j.lease_until<now() then raise exception 'Stale worker lease'; end if;
 if not f.enabled then raise exception 'Shadow processing disabled'; end if;
 if p_error is null and (p_result->>'ocrEngine' is distinct from 'v2-shadow' or p_result->>'sourceImageHash' is distinct from j.source_hash or p_result->>'captureSessionId' is distinct from j.capture_session_id::text) then raise exception 'Result provenance mismatch'; end if;
 r:=coalesce(p_result,'{}'::jsonb)||jsonb_build_object('paymentCanApply',false,'error',left(p_error,2000));
 update public.ocr_shadow_jobs set state=case when p_error is null then 'completed' else 'failed' end,completed_at=now(),result_hash=encode(extensions.digest(r::text,'sha256'),'hex') where legacy_attempt_id=p_legacy;
 select summary into s from public.ocr_attempts where id=j.shadow_attempt_id;
 s:=s||jsonb_build_object('result',case when p_error is null then 'review' else 'failed' end,'paymentCanApply',false,
 'rowsDetected',coalesce(jsonb_array_length(r#>'{model,table,rows}'),0),'invoicesResolved',coalesce(jsonb_array_length(r#>'{resolver,automaticInvoiceIds}'),0),
 'documentTotal',case when r#>>'{model,total,cents}' is null then null else (r#>>'{model,total,cents}')::numeric/100 end,
 'identity',r#>'{model,identity,value}','resolverStatus',r#>'{resolver,status}',
 'checkNumber',r#>'{document,header,checkNumber}','checkDate',r#>'{document,header,checkDate}',
 'amountRows',(select count(*) from jsonb_array_elements(coalesce(r#>'{document,rows}','[]'::jsonb)) row where jsonb_array_length(row->'amounts')>0),
 'reconciled',coalesce(r#>>'{resolver,status}'='automatic',false),
 'durationMs',coalesce((r#>>'{timings,totalMs}')::numeric,0),'reasons',case when p_error is not null then jsonb_build_array(left(p_error,2000)) else coalesce(r->'reviewBlockers','[]'::jsonb) end);
 update public.ocr_attempts set phase=2,result=s->>'result',summary=s,updated_at=now(),diagnostic_bytes=octet_length(r::text) where id=j.shadow_attempt_id;
 -- Update only the shadow diagnostic; never legacy fields or any payment table.
 update public.ocr_attempt_diagnostics set payload=jsonb_build_object('stage','shadow-frozen','result',r,'legacyObserved',payload->'legacyObserved','canonicalCaptureReference',j.source_reference,'frozenAt',now()) where attempt_id=j.shadow_attempt_id;
end $$;
revoke all on function public.trimax_complete_ocr_shadow(uuid,text,uuid,uuid,jsonb,text) from public;
grant execute on function public.trimax_complete_ocr_shadow(uuid,text,uuid,uuid,jsonb,text) to anon,authenticated;

-- Preserve a canonical reference when its original diagnostic expires while a
-- paired shadow attempt remains pinned. Transfer bytes only as the old copy dies.
create function public.trimax_transfer_shadow_optical() returns trigger language plpgsql security definer set search_path=public as $$
declare j public.ocr_shadow_jobs;
begin
 for j in select q.* from public.ocr_shadow_jobs q join public.ocr_attempts a on a.id=q.shadow_attempt_id
 where q.source_reference=old.attempt_id and q.shadow_attempt_id<>old.attempt_id and (a.pinned or a.diagnostics_expires_at>now())
 and exists(select 1 from public.ocr_attempt_diagnostics d where d.attempt_id=q.shadow_attempt_id)
 loop
  insert into public.ocr_attempt_optical values(j.shadow_attempt_id,old.evidence) on conflict(attempt_id) do nothing;
  update public.ocr_shadow_jobs set source_reference=j.shadow_attempt_id where legacy_attempt_id=j.legacy_attempt_id;
 end loop;
 return old;
end $$;
revoke all on function public.trimax_transfer_shadow_optical() from public,anon,authenticated;
create trigger transfer_shadow_optical before delete on public.ocr_attempt_optical for each row execute function public.trimax_transfer_shadow_optical();

-- Human truth is separate from inference and is never returned to workers.
create table public.ocr_shadow_acceptance (
 legacy_attempt_id uuid primary key references public.ocr_shadow_jobs(legacy_attempt_id),
 business_id uuid not null references public.businesses(id),
 independent_document_id text not null,
 result_hash text not null, source_hash text not null,
 verified_by uuid not null, verified_at timestamptz not null default now(),
 truth jsonb not null check(octet_length(truth::text)<=65536)
);
alter table public.ocr_shadow_acceptance enable row level security;
revoke all on public.ocr_shadow_acceptance from anon,authenticated;
grant select on public.ocr_shadow_acceptance to authenticated;
create policy shadow_truth_admin on public.ocr_shadow_acceptance for select to authenticated using(public.trimax_is_business_admin(business_id));
create function public.trimax_verify_shadow_truth(p_legacy uuid,p_truth jsonb) returns void language plpgsql security definer set search_path=public as $$
declare j public.ocr_shadow_jobs; count_rows integer; total numeric;
begin
 select * into j from public.ocr_shadow_jobs where legacy_attempt_id=p_legacy;
 if j.business_id is null or auth.uid() is null or not public.trimax_is_business_admin(j.business_id) then raise exception 'Owner/admin required'; end if;
 if j.completed_at is null or j.result_hash is null then raise exception 'Inference must be frozen before truth'; end if;
 if p_truth->>'businessTruthVerified' is distinct from 'true' or p_truth->>'freshUnseenConfirmed' is distinct from 'true'
 or length(coalesce(p_truth->>'independentDocumentId',''))=0 or length(coalesce(p_truth->>'finalPaymentResult',''))=0
 or p_truth->>'sourceImageHash' is distinct from j.source_hash then raise exception 'Explicit human verification of this fresh capture required'; end if;
 if jsonb_typeof(p_truth->'rows') is distinct from 'array' then raise exception 'Verified rows required'; end if;
 select count(*),sum((r->>'amountCents')::numeric) into count_rows,total from jsonb_array_elements(p_truth->'rows') r;
 if count_rows=0 or coalesce(p_truth->>'totalCents','') !~ '^[0-9]+$' or total is distinct from (p_truth->>'totalCents')::numeric or exists(select 1 from jsonb_array_elements(p_truth->'rows') r
 where coalesce(r->>'amountCents','') !~ '^[0-9]+$' or (r->>'amountCents')::numeric<=0 or (r->>'amountCents')::numeric<>trunc((r->>'amountCents')::numeric)
 or length(coalesce(r->>'invoiceRecordId',''))=0 or length(coalesce(r->>'invoiceNumber',''))=0)
 or count_rows<>(select count(distinct r->>'invoiceRecordId') from jsonb_array_elements(p_truth->'rows') r) then raise exception 'Invalid verified rows or reconciliation'; end if;
 insert into public.ocr_shadow_acceptance(legacy_attempt_id,business_id,independent_document_id,result_hash,source_hash,verified_by,truth)
 values(p_legacy,j.business_id,p_truth->>'independentDocumentId',j.result_hash,j.source_hash,auth.uid(),p_truth||jsonb_build_object('verifiedBy',auth.uid(),'verifiedAt',now()));
end $$;
revoke all on function public.trimax_verify_shadow_truth(uuid,jsonb) from public,anon;
grant execute on function public.trimax_verify_shadow_truth(uuid,jsonb) to authenticated;

-- A queued worker job is not an abandoned browser capture. Retention stays unchanged.
create or replace function public.trimax_cleanup_ocr_diagnostics()
returns integer language plpgsql security definer set search_path=public as $$
declare deleted_count integer;
begin
 update public.ocr_attempts set result='failed', summary=summary || '{"result":"failed","paymentCanApply":false,"reasons":["Scan interrupted before final review completed."]}'::jsonb
 where phase<2 and updated_at < now()-interval '1 hour' and result='processing' and coalesce(summary->>'ocrEngine','legacy')<>'v2-shadow';
 delete from public.ocr_attempt_diagnostics d using public.ocr_attempts a where d.attempt_id=a.id and not a.pinned and a.diagnostics_expires_at<=now();
 get diagnostics deleted_count = row_count;
 update public.ocr_attempts set diagnostic_bytes=0 where diagnostic_bytes>0 and not pinned and diagnostics_expires_at<=now();
 return deleted_count;
end $$;
