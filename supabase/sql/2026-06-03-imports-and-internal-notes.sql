create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  source text not null default 'csv',
  import_type text not null check (import_type in ('clients', 'invoices')),
  file_name text,
  status text not null default 'completed' check (status in ('preview', 'completed', 'failed')),
  row_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists import_batches_business_created_idx
  on public.import_batches (business_id, created_at desc);

alter table public.import_batches enable row level security;

drop policy if exists "Allow authenticated import batch read during development"
  on public.import_batches;

drop policy if exists "Allow authenticated import batch manage during development"
  on public.import_batches;

create policy "Allow authenticated import batch read during development"
  on public.import_batches
  for select
  to authenticated
  using (true);

create policy "Allow authenticated import batch manage during development"
  on public.import_batches
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  row_number integer not null,
  import_type text not null check (import_type in ('clients', 'invoices')),
  raw_data jsonb not null default '{}'::jsonb,
  mapped_data jsonb not null default '{}'::jsonb,
  status text not null default 'imported' check (status in ('imported', 'skipped', 'error')),
  target_table text,
  target_id uuid,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists import_rows_batch_idx
  on public.import_rows (batch_id, row_number);

create index if not exists import_rows_business_created_idx
  on public.import_rows (business_id, created_at desc);

alter table public.import_rows enable row level security;

drop policy if exists "Allow authenticated import row read during development"
  on public.import_rows;

drop policy if exists "Allow authenticated import row manage during development"
  on public.import_rows;

create policy "Allow authenticated import row read during development"
  on public.import_rows
  for select
  to authenticated
  using (true);

create policy "Allow authenticated import row manage during development"
  on public.import_rows
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  entity_type text not null check (entity_type in ('client', 'invoice', 'estimate', 'queue_item')),
  entity_id uuid not null,
  body text not null,
  author_user_id uuid,
  author_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists internal_notes_entity_idx
  on public.internal_notes (business_id, entity_type, entity_id, created_at desc);

alter table public.internal_notes enable row level security;

drop policy if exists "Allow authenticated internal note read during development"
  on public.internal_notes;

drop policy if exists "Allow authenticated internal note manage during development"
  on public.internal_notes;

create policy "Allow authenticated internal note read during development"
  on public.internal_notes
  for select
  to authenticated
  using (true);

create policy "Allow authenticated internal note manage during development"
  on public.internal_notes
  for all
  to authenticated
  using (true)
  with check (true);
