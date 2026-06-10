-- Seed confirmed North Creek Apartments unit map.
-- Safe to run more than once. Existing unit notes are preserved.

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
building_map as (
  select *
  from (
    values
      ('A', 12, '2x1'),
      ('B', 12, '2x2'),
      ('C', 8, '2x1'),
      ('D', 8, '2x2'),
      ('E', 8, '2x1'),
      ('F', 8, '2x2'),
      ('G', 12, '2x2'),
      ('H', 12, '2x1'),
      ('I', 8, '2x2'),
      ('J', 8, '2x2'),
      ('K', 12, '2x1'),
      ('L', 12, '2x1'),
      ('M', 12, '2x2'),
      ('N', 8, 'mixed'),
      ('O', 12, '2x1'),
      ('P', 8, '2x1'),
      ('Q', 8, '2x1'),
      ('R', 8, '2x2'),
      ('S', 8, '2x2'),
      ('T', 12, '2x1'),
      ('U', 12, '2x2'),
      ('V', 12, '2x2'),
      ('W', 8, '2x2'),
      ('X', 12, '2x1'),
      ('Y', 12, '2x1'),
      ('Z', 12, '2x2')
  ) as buildings(building_letter, unit_count, building_floorplan)
),
seed_units as (
  select
    building_map.building_letter,
    unit_number,
    building_map.building_letter || unit_number::text as unit_label,
    case
      when unit_number % 2 = 1 then 'bottom'
      else 'top'
    end as floor,
    case
      when building_map.building_letter = 'N' and unit_number <= 4 then '2x1'
      when building_map.building_letter = 'N' and unit_number >= 5 then '2x2'
      else building_map.building_floorplan
    end as floorplan
  from building_map
  cross join lateral generate_series(1, building_map.unit_count) as unit_number
),
expected_count as (
  select count(*) as unit_count
  from seed_units
),
seeded_units as (
  insert into public.property_units (
    business_id,
    property_id,
    building_letter,
    unit_number,
    unit_label,
    floor,
    floorplan
  )
  select
    property_row.business_id,
    property_row.id,
    seed_units.building_letter,
    seed_units.unit_number,
    seed_units.unit_label,
    seed_units.floor,
    seed_units.floorplan
  from property_row
  cross join seed_units
  where (select unit_count from expected_count) = 264
  on conflict (property_id, unit_label)
  do update set
    building_letter = excluded.building_letter,
    unit_number = excluded.unit_number,
    floor = excluded.floor,
    floorplan = excluded.floorplan
  returning id
)
select
  (select unit_count from expected_count) as expected_seed_units,
  count(*) as rows_inserted_or_updated,
  (
    select count(*)
    from public.property_units pu
    join property_row pr on pr.id = pu.property_id
  ) as north_creek_total_units
from seeded_units;
