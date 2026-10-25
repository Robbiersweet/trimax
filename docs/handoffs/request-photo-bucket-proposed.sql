-- Separate reviewed deployment step; NOT executed. No existing buckets/policies changed.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('request-photos-private','request-photos-private',false,5242880,array['image/jpeg']);
-- No anonymous/authenticated object policy: only the existing app server storage authority.
commit;
