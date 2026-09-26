-- Binary bytes belong in private Storage. Postgres acknowledges only bounded references.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('trimax-ocr-captures','trimax-ocr-captures',false,8000000,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

create or replace function public.trimax_ocr_object_owner(p_path text,p_upload boolean default false)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare a public.ocr_attempts;
begin
 if p_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}$' or auth.uid() is null then return false; end if;
 select * into a from public.ocr_attempts where id=split_part(p_path,'/',2)::uuid and business_id=split_part(p_path,'/',1)::uuid;
 return a.id is not null and public.trimax_is_business_admin(a.business_id)
  and (a.pinned or coalesce(a.diagnostics_expires_at,a.created_at+interval '30 days')>now()
    or (not p_upload and exists(select 1 from public.ocr_attempt_optical o join public.ocr_attempts retained on retained.id=o.attempt_id,lateral jsonb_array_elements(o.evidence->'images') i where retained.business_id=a.business_id and (retained.pinned or retained.diagnostics_expires_at>now()) and i->>'objectPath'=p_path)))
  and (not p_upload or (a.created_by=auth.uid() and a.phase<2 and (a.summary->>'sourceImageHash' is null or a.summary->>'sourceImageHash'=split_part(p_path,'/',3))));
end $$;

-- Called only by the existing server retention credential, never by either OCR worker.
create or replace function public.trimax_expired_ocr_objects()
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(name),'[]'::jsonb) from (
  select s.name from storage.objects s where s.bucket_id='trimax-ocr-captures' and s.created_at<now()-interval '30 days'
  and not exists(select 1 from public.ocr_attempt_optical o join public.ocr_attempts a on a.id=o.attempt_id,lateral jsonb_array_elements(o.evidence->'images') i where i->>'objectPath'=s.name and (a.pinned or a.diagnostics_expires_at>now()))
  and not exists(select 1 from public.ocr_attempts a where a.id::text=split_part(s.name,'/',2) and (a.pinned or a.diagnostics_expires_at>now()))
  order by s.created_at limit 100
 ) expired;
$$;
revoke all on function public.trimax_expired_ocr_objects() from public,anon,authenticated;
grant execute on function public.trimax_expired_ocr_objects() to service_role;
revoke all on function public.trimax_ocr_object_owner(text,boolean) from public,anon;
grant execute on function public.trimax_ocr_object_owner(text,boolean) to authenticated;

-- No worker table/storage write grants. Read is limited to its existing live queue lease.
create or replace function public.trimax_ocr_object_worker(p_path text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare h jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb; ref uuid; sha text;
begin
 if p_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}$' or coalesce(h->>'x-trimax-lease','') !~ '^[a-f0-9-]{36}$' then return false; end if;
 if h->>'x-trimax-engine'='legacy' then
  select j.source_reference,j.source_hash into ref,sha from public.ocr_legacy_jobs j join public.ocr_legacy_workers w using(business_id)
  where w.enabled and w.worker_key_hash=encode(extensions.digest(h->>'x-trimax-worker','sha256'),'hex')
   and j.lease=(h->>'x-trimax-lease')::uuid and j.lease_until>now() and j.state in ('running','completion_persistence_pending');
 elsif h->>'x-trimax-engine'='v2-shadow' then
  select j.source_reference,j.source_hash into ref,sha from public.ocr_shadow_jobs j join public.ocr_shadow_flags w using(business_id)
  where w.enabled and w.worker_key_hash=encode(extensions.digest(h->>'x-trimax-worker','sha256'),'hex')
   and j.lease=(h->>'x-trimax-lease')::uuid and j.lease_until>now() and j.state='running';
 end if;
 return ref is not null and exists(select 1 from public.ocr_attempt_optical o,lateral jsonb_array_elements(o.evidence->'images') i
  where o.attempt_id=ref and i->>'objectPath'=p_path and i->>'sha256'=sha and i->>'storageBucket'='trimax-ocr-captures');
end $$;
revoke all on function public.trimax_ocr_object_worker(text) from public,authenticated;
grant execute on function public.trimax_ocr_object_worker(text) to anon;
create policy ocr_capture_insert on storage.objects for insert to authenticated with check(bucket_id='trimax-ocr-captures' and public.trimax_ocr_object_owner(name,true));
create policy ocr_capture_read on storage.objects for select to authenticated using(bucket_id='trimax-ocr-captures' and public.trimax_ocr_object_owner(name,false));
create policy ocr_capture_worker_read on storage.objects for select to anon using(bucket_id='trimax-ocr-captures' and public.trimax_ocr_object_worker(name));
-- Intentionally no overwrite/delete policy for workers or uploading clients.

create or replace function public.trimax_store_ocr_capture(p_attempt uuid,p_hash text,p_image text,p_metadata jsonb,p_shadow uuid default null,p_snapshot jsonb default null,p_capture jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts; ref uuid; image jsonb; object_path text; stored integer;
begin
 select * into a from public.ocr_attempts where id=p_attempt for update;
 if auth.uid() is null or a.id is null or a.created_by<>auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 if p_image is not null then raise exception 'Binary object upload required; image JSON transport is retired'; end if;
 if p_hash !~ '^[a-f0-9]{64}$' or octet_length(p_metadata::text)>8192 then raise exception 'Invalid canonical metadata'; end if;
 ref:=coalesce((p_metadata->>'retainedReference')::uuid,p_attempt);
 if a.summary->>'sourceImageHash' is not null and (a.summary->>'sourceImageHash'<>p_hash or a.summary->>'canonicalReference'<>ref::text) then raise exception 'Canonical reference is immutable'; end if;
 if a.summary->>'sourceImageHash'=p_hash then
  select i into image from public.ocr_attempt_optical o,lateral jsonb_array_elements(o.evidence->'images') i where o.attempt_id=ref and i->>'sha256'=p_hash limit 1;
  if image is not null then return jsonb_build_object('reference',ref,'sha256',p_hash,'storedBytes',image->'storedBytes','shadowQueued',exists(select 1 from public.ocr_shadow_jobs where legacy_attempt_id=p_attempt)); end if;
 end if;
 if a.phase=2 then raise exception 'Capture already completed'; end if;
 if ref<>p_attempt then
  select i into image from public.ocr_attempt_optical o join public.ocr_attempts original on original.id=o.attempt_id,lateral jsonb_array_elements(o.evidence->'images') i
  where o.attempt_id=ref and original.business_id=a.business_id and (original.pinned or original.diagnostics_expires_at>now()) and i->>'sha256'=p_hash limit 1;
  if image is null then raise exception 'Retained canonical source unavailable'; end if;
  stored:=coalesce((image->>'storedBytes')::integer,octet_length(decode(image->>'base64','base64')));
 else
  object_path:=a.business_id::text||'/'||p_attempt::text||'/'||p_hash;
  if p_metadata->>'objectPath' is distinct from object_path or p_metadata->>'storageBucket' is distinct from 'trimax-ocr-captures' then raise exception 'Invalid canonical object scope'; end if;
  select (metadata->>'size')::integer into stored from storage.objects where bucket_id='trimax-ocr-captures' and name=object_path;
  if stored is null or stored is distinct from (p_metadata->>'storedBytes')::integer then raise exception 'Durable object acknowledgement required'; end if;
  image:=p_metadata||jsonb_build_object('label','Canonical OCR input','sha256',p_hash,'storedBytes',stored);
 end if;
 insert into public.ocr_attempt_diagnostics(attempt_id,payload) values(p_attempt,'{}') on conflict do nothing;
 if ref=p_attempt then insert into public.ocr_attempt_optical(attempt_id,evidence) values(p_attempt,jsonb_build_object('canonicalHash',p_hash,'images',jsonb_build_array(image))) on conflict(attempt_id) do nothing; end if;
 update public.ocr_attempts set summary=summary||jsonb_build_object('sourceImageHash',p_hash,'canonicalReference',ref,'captureState','image_stored','shadowHandoffState',case when p_snapshot is null then 'disabled' else 'handoff_pending' end),diagnostics_expires_at=created_at+interval '30 days' where id=p_attempt;
 update public.ocr_attempt_diagnostics set payload=payload||jsonb_build_object('canonicalCapture',image-'base64'||jsonb_build_object('reference',ref,'storedAt',now())) where attempt_id=p_attempt;
 return jsonb_build_object('reference',ref,'sha256',p_hash,'storedBytes',stored,'shadowQueued',false);
end $$;

create or replace function public.trimax_prepare_ocr_handoff(p_attempt uuid,p_snapshot jsonb,p_capture jsonb default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare a public.ocr_attempts;
begin
 select * into a from public.ocr_attempts where id=p_attempt for update;
 if auth.uid() is null or a.created_by is distinct from auth.uid() or not public.trimax_is_business_admin(a.business_id) then raise exception 'Owner/admin attempt required'; end if;
 if a.summary->>'canonicalReference' is null then raise exception 'Durable image required'; end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>4000000 or octet_length(p_capture::text)>8192 then raise exception 'Invalid handoff snapshot'; end if;
 if exists(select 1 from public.ocr_shadow_jobs where legacy_attempt_id=p_attempt) then return; end if;
 update public.ocr_attempt_diagnostics set payload=payload||jsonb_build_object('captureHandoff',jsonb_build_object('snapshot',p_snapshot,'captureTimings',p_capture,'shadowId',gen_random_uuid())) where attempt_id=p_attempt and not(payload ? 'captureHandoff');
 update public.ocr_attempts set summary=summary||jsonb_build_object('shadowHandoffState','handoff_pending') where id=p_attempt;
end $$;
revoke all on function public.trimax_prepare_ocr_handoff(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.trimax_prepare_ocr_handoff(uuid,jsonb,jsonb) to authenticated;
