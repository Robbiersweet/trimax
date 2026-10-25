-- REVIEW ONLY. New private bucket must be provisioned separately; no storage changes here.
create table public.request_photos(
 id uuid primary key, request_id uuid not null, business_id uuid not null,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'), input_bytes integer not null check(input_bytes between 1 and 5242880),
 state text not null default 'reserved' check(state in ('reserved','complete')), created_at timestamptz not null default now(),
 object_key text not null unique, output_hash text, width integer, height integer,
 foreign key(business_id,request_id) references public.public_service_requests(business_id,id),
 check((state='reserved' and output_hash is null and width is null and height is null) or (state='complete' and output_hash is not null and width is not null and height is not null and output_hash ~ '^[a-f0-9]{64}$' and width>0 and height>0))
);
alter table public.request_photos enable row level security;
alter table public.request_photos force row level security;
revoke all on public.request_photos from public,anon,authenticated,trimax_scheduling_web,service_role;
grant select on public.request_photos to service_role;
-- Server-only entrypoints. Website role retains its existing two RPCs; no photo grants.
create function public.trimax_reserve_request_photo(p_request uuid,p_hash text,p_upload uuid,p_input_hash text,p_bytes integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.public_service_requests; saved public.request_photos; n integer; bytes bigint;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or p_upload is null or p_bytes is null or p_bytes not between 1 and 5242880 then raise exception 'Photo rejected'; end if;
 select * into r from public.public_service_requests where id=p_request for update;
 if not found or r.upload_capability_hash is distinct from p_hash or r.upload_capability_expires_at is null or r.upload_capability_expires_at<=now() then raise exception 'Photo rejected'; end if;
 select * into saved from public.request_photos where id=p_upload;
 if found then
  if saved.request_id<>r.id or saved.business_id<>r.business_id or saved.input_hash<>p_input_hash or saved.input_bytes<>p_bytes then raise exception 'Photo rejected';end if;
 else
  select count(*),coalesce(sum(input_bytes),0) into n,bytes from public.request_photos where request_id=r.id;
  if n>=4 or bytes+p_bytes>12582912 then raise exception 'Photo limit reached';end if;
  insert into public.request_photos(id,request_id,business_id,input_hash,input_bytes,object_key) values(p_upload,r.id,r.business_id,p_input_hash,p_bytes,r.business_id::text||'/'||r.id::text||'/'||p_upload::text||'.jpg') returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'objectKey',saved.object_key,'state',saved.state);
end $$;
create function public.trimax_complete_request_photo(p_request uuid,p_hash text,p_upload uuid,p_output_hash text,p_width integer,p_height integer) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.public_service_requests; saved public.request_photos;
begin
 select * into r from public.public_service_requests where id=p_request for update;
 if not found or r.upload_capability_hash is distinct from p_hash or p_hash is null or r.upload_capability_expires_at<=now() or r.upload_capability_expires_at is null then raise exception 'Photo rejected';end if;
 if p_output_hash is null or p_output_hash !~ '^[a-f0-9]{64}$' or p_width is null or p_height is null or p_width<1 or p_height<1 or p_width::bigint*p_height>24000000 then raise exception 'Photo rejected';end if;
 select * into saved from public.request_photos where id=p_upload and request_id=r.id and business_id=r.business_id for update;
 if not found then raise exception 'Photo rejected';end if;
 if saved.state='complete' and (saved.output_hash<>p_output_hash or saved.width<>p_width or saved.height<>p_height) then raise exception 'Photo rejected';end if;
 update public.request_photos set state='complete',output_hash=p_output_hash,width=p_width,height=p_height where id=saved.id;
end $$;
revoke all on function public.trimax_reserve_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_request_photo(uuid,text,uuid,text,integer,integer) from public,anon,authenticated,trimax_scheduling_web;
grant execute on function public.trimax_reserve_request_photo(uuid,text,uuid,text,integer),public.trimax_complete_request_photo(uuid,text,uuid,text,integer,integer) to service_role;
