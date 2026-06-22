alter table public.service_items
  add column if not exists easy_unit_price numeric,
  add column if not exists normal_unit_price numeric,
  add column if not exists difficult_unit_price numeric;

comment on column public.service_items.easy_unit_price is
  'Optional suggested unit price for easy/simple versions of this saved service.';

comment on column public.service_items.normal_unit_price is
  'Optional suggested unit price for normal/default versions of this saved service.';

comment on column public.service_items.difficult_unit_price is
  'Optional suggested unit price for difficult/high-effort versions of this saved service.';
