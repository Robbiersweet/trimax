-- Job-site media filing foundation.
-- This keeps Trimax lightweight by storing searchable photo metadata and links,
-- while allowing originals to live in Supabase, OneDrive, a NAS, or a home-drive archive.

create table if not exists public.job_site_media_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  related_entity_type text,
  related_entity_id uuid,
  related_entity_label text,
  storage_mode text not null default 'external'
    check (storage_mode in ('supabase', 'external', 'local_archive')),
  storage_bucket text,
  storage_path text,
  external_uri text,
  external_label text,
  file_name text,
  content_type text,
  file_size integer,
  caption text,
  tags text[] not null default '{}'::text[],
  captured_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists job_site_media_business_created_idx
  on public.job_site_media_files (business_id, created_at desc);

create index if not exists job_site_media_related_idx
  on public.job_site_media_files (business_id, related_entity_type, related_entity_id);

create index if not exists job_site_media_tags_idx
  on public.job_site_media_files using gin (tags);

alter table public.job_site_media_files enable row level security;

drop policy if exists "Allow business job site media read"
  on public.job_site_media_files;
drop policy if exists "Allow business job site media insert"
  on public.job_site_media_files;
drop policy if exists "Allow business job site media update"
  on public.job_site_media_files;

create policy "Allow business job site media read"
on public.job_site_media_files
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business job site media insert"
on public.job_site_media_files
for insert
to authenticated
with check (public.trimax_has_business_access(business_id));

create policy "Allow business job site media update"
on public.job_site_media_files
for update
to authenticated
using (public.trimax_has_business_access(business_id))
with check (public.trimax_has_business_access(business_id));
