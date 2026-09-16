-- Reusable apartment-turn add-ons, shared across properties within each business.
-- Run in the Supabase SQL editor. Existing saved defaults are never overwritten.
begin;

-- Serialize this seed with other service writes so concurrent runs cannot duplicate it.
lock table public.service_items in share row exclusive mode;

insert into public.service_items (
  business_id, name, description, default_quantity, default_unit_price,
  category, is_active
)
select
  business.id, addon.name, addon.description, 1, addon.price,
  'Apartment Turns', true
from public.businesses as business
cross join (values
  (
    'Excessive Unit Condition — Moderate',
    'Additional labor for above-normal cleaning, prep, patching, or other unit conditions.',
    100
  ),
  (
    'Excessive Unit Condition — Heavy',
    'Additional labor for heavy cleaning, extensive prep, wall repairs, patching, or other above-normal unit conditions.',
    175
  ),
  (
    'Excessive Unit Condition — Severe',
    'Additional labor for severe cleaning, damage repair, patching, contamination, or other conditions substantially beyond a normal unit turn.',
    250
  )
) as addon(name, description, price)
where not exists (
  select 1
  from public.service_items as existing
  where existing.business_id = business.id
    and existing.name = addon.name
);

commit;

-- Verify the saved records after applying. No property overrides are created.
select business_id, name, description, default_quantity, default_unit_price, is_active
from public.service_items
where name in (
  'Excessive Unit Condition — Moderate',
  'Excessive Unit Condition — Heavy',
  'Excessive Unit Condition — Severe'
)
order by business_id, default_unit_price;
