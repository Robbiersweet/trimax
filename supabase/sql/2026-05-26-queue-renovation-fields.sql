alter table public.queue_items
  add column if not exists prior_renovation boolean not null default false,
  add column if not exists prior_renovation_details text,
  add column if not exists renovation_needed boolean not null default false;

create index if not exists queue_items_renovation_lookup_idx
  on public.queue_items (business_id, property, unit, created_at desc);
