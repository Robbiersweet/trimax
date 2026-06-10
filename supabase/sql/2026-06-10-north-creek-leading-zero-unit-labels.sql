-- Convert North Creek property unit labels to canonical display format.
-- Examples: A1 -> A01, H4 -> H04, N7 -> N07. B12 stays B12.

with rnl_business as (
  select id
  from public.businesses
  where slug = 'rnl-creations'
  limit 1
),
north_creek_property as (
  select p.id
  from public.properties p
  join rnl_business b on b.id = p.business_id
  where p.name = 'North Creek Apartments'
  limit 1
),
canonical_units as (
  select
    pu.id,
    pu.building_letter || lpad(pu.unit_number::text, 2, '0') as canonical_label
  from public.property_units pu
  join north_creek_property ncp on ncp.id = pu.property_id
  where pu.building_letter is not null
    and pu.unit_number is not null
)
update public.property_units pu
set unit_label = canonical_units.canonical_label
from canonical_units
where pu.id = canonical_units.id
  and pu.unit_label is distinct from canonical_units.canonical_label;

select
  count(*) as north_creek_total_units,
  count(*) filter (where unit_label ~ '^[A-Z][0-9]{2}$') as canonical_unit_labels
from public.property_units pu
join public.properties p on p.id = pu.property_id
join public.businesses b on b.id = p.business_id
where b.slug = 'rnl-creations'
  and p.name = 'North Creek Apartments';
