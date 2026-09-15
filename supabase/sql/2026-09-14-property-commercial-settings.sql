alter table public.clients
  add column if not exists tax_mode text not null default 'taxable',
  add column if not exists tax_label text,
  add column if not exists tax_rate numeric not null default 0,
  add column if not exists tax_number text,
  add column if not exists auto_split_enabled boolean not null default false,
  add column if not exists split_target_amount numeric;

create table if not exists public.client_service_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_item_id uuid not null references public.service_items(id) on delete cascade,
  unit_price numeric not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, client_id, service_item_id)
);

alter table public.client_service_overrides enable row level security;

drop policy if exists "Allow business client service override read"
  on public.client_service_overrides;
drop policy if exists "Allow business client service override manage"
  on public.client_service_overrides;

create policy "Allow business client service override read"
on public.client_service_overrides
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business client service override manage"
on public.client_service_overrides
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create index if not exists client_service_overrides_business_client_idx
  on public.client_service_overrides (business_id, client_id)
  where is_active;

create index if not exists client_service_overrides_service_idx
  on public.client_service_overrides (business_id, service_item_id)
  where is_active;
