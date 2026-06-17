-- Payment image filing for check and remittance stub photos.
-- Run this once in Supabase SQL editor before relying on stored payment images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trimax-payment-images',
  'trimax-payment-images',
  false,
  8000000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.payment_attachments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_bucket text not null default 'trimax-payment-images',
  storage_path text not null,
  file_name text,
  content_type text,
  file_size integer,
  check_number text,
  check_amount numeric,
  payor text,
  remittance_stub_text text,
  matched_invoice_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists payment_attachments_business_created_idx
  on public.payment_attachments (business_id, created_at desc);

create index if not exists payment_attachments_matched_invoice_ids_idx
  on public.payment_attachments using gin (matched_invoice_ids);

alter table public.payment_attachments enable row level security;

drop policy if exists "Allow business payment attachment read"
  on public.payment_attachments;
drop policy if exists "Allow business payment attachment insert"
  on public.payment_attachments;

create policy "Allow business payment attachment read"
on public.payment_attachments
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business payment attachment insert"
on public.payment_attachments
for insert
to authenticated
with check (public.trimax_has_business_access(business_id));

drop policy if exists "Allow business payment image read"
  on storage.objects;
drop policy if exists "Allow business payment image upload"
  on storage.objects;

create policy "Allow business payment image read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trimax-payment-images'
  and public.trimax_has_business_access((storage.foldername(name))[1]::uuid)
);

create policy "Allow business payment image upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trimax-payment-images'
  and public.trimax_has_business_access((storage.foldername(name))[1]::uuid)
);
