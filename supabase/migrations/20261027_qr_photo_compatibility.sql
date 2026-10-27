-- QR/photo prerequisite only. No communications triggers, sends, data backfill or existing permission changes.
begin;
alter table public.public_service_requests add column sms_consent_at timestamptz, add column sms_consent_version text, add column sms_consent_source text;
-- Private storage only; no public policies or grants. Reject an unsafe pre-existing collision.
do $$begin
 if exists(select 1 from storage.buckets where id='request-photos-private' and public) then raise exception 'Request photo bucket must be private'; end if;
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('request-photos-private','request-photos-private',false,5242880,array['image/jpeg']) on conflict(id) do nothing;
commit;
