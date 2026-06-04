alter table public.queue_items
  add column if not exists wall_paint_color text;

create index if not exists queue_items_wall_paint_color_idx
  on public.queue_items (business_id, property, wall_paint_color);
