-- Property Intelligence foundation for Trimax.
-- This keeps permanent property/unit facts separate from queue job history.

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  building_letter text not null,
  unit_number integer not null,
  unit_label text not null,
  floor text check (floor in ('bottom', 'top')),
  floorplan text check (floorplan in ('2x1', '2x2')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, unit_label)
);

create table if not exists public.unit_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  property_unit_id uuid not null references public.property_units(id) on delete cascade,
  queue_item_id text references public.queue_items(id) on delete set null,
  event_type text not null default 'general_turn',
  event_date date,
  paint_type text,
  wall_paint_color text,
  flooring text,
  smoker_remediation boolean not null default false,
  prior_renovation boolean not null default false,
  prior_renovation_details text,
  queue_item_is_renovation boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists properties_business_id_idx
  on public.properties (business_id);

create index if not exists property_units_business_property_idx
  on public.property_units (business_id, property_id);

create index if not exists property_units_label_idx
  on public.property_units (property_id, unit_label);

create index if not exists unit_history_property_unit_idx
  on public.unit_history (property_unit_id, event_date desc, created_at desc);

create or replace function public.set_property_units_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_property_units_updated_at on public.property_units;

create trigger set_property_units_updated_at
before update on public.property_units
for each row
execute function public.set_property_units_updated_at();

alter table public.properties enable row level security;
alter table public.property_units enable row level security;
alter table public.unit_history enable row level security;

drop policy if exists "Allow authenticated property read during development"
  on public.properties;

drop policy if exists "Allow authenticated property manage during development"
  on public.properties;

drop policy if exists "Allow authenticated property unit read during development"
  on public.property_units;

drop policy if exists "Allow authenticated property unit manage during development"
  on public.property_units;

drop policy if exists "Allow authenticated unit history read during development"
  on public.unit_history;

drop policy if exists "Allow authenticated unit history manage during development"
  on public.unit_history;

create policy "Allow authenticated property read during development"
  on public.properties
  for select
  to authenticated
  using (true);

create policy "Allow authenticated property manage during development"
  on public.properties
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Allow authenticated property unit read during development"
  on public.property_units
  for select
  to authenticated
  using (true);

create policy "Allow authenticated property unit manage during development"
  on public.property_units
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Allow authenticated unit history read during development"
  on public.unit_history
  for select
  to authenticated
  using (true);

create policy "Allow authenticated unit history manage during development"
  on public.unit_history
  for all
  to authenticated
  using (true)
  with check (true);

with rnl_business as (
  select id
  from public.businesses
  where slug = 'rnl-creations'
  limit 1
),
north_creek_property as (
  insert into public.properties (business_id, name, address)
  select
    id,
    'North Creek Apartments',
    '11401 3rd Ave SE Everett, WA 98208'
  from rnl_business
  on conflict (business_id, name)
  do update set address = excluded.address
  returning id, business_id
),
property_row as (
  select id, business_id
  from north_creek_property
  union all
  select p.id, p.business_id
  from public.properties p
  join rnl_business b on b.id = p.business_id
  where p.name = 'North Creek Apartments'
  limit 1
),
seed_units as (
  select *
  from (
    values
      ('N', 1, 'N1', 'bottom', '2x1'),
      ('N', 2, 'N2', 'top', '2x1'),
      ('N', 3, 'N3', 'bottom', '2x1'),
      ('N', 4, 'N4', 'top', '2x1'),
      ('N', 5, 'N5', 'bottom', '2x2'),
      ('N', 6, 'N6', 'top', '2x2'),
      ('N', 7, 'N7', 'bottom', '2x2'),
      ('N', 8, 'N8', 'top', '2x2')
  ) as units(building_letter, unit_number, unit_label, floor, floorplan)
)
insert into public.property_units (
  business_id,
  property_id,
  building_letter,
  unit_number,
  unit_label,
  floor,
  floorplan,
  notes
)
select
  property_row.business_id,
  property_row.id,
  seed_units.building_letter,
  seed_units.unit_number,
  seed_units.unit_label,
  seed_units.floor,
  seed_units.floorplan,
  'Seeded from confirmed North Creek N building rule.'
from property_row
cross join seed_units
on conflict (property_id, unit_label)
do update set
  building_letter = excluded.building_letter,
  unit_number = excluded.unit_number,
  floor = excluded.floor,
  floorplan = excluded.floorplan,
  notes = excluded.notes;
