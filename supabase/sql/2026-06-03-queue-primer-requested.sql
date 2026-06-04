alter table public.queue_items
  add column if not exists primer_requested boolean not null default true;

update public.queue_items
set primer_requested = true
where primer_requested is null;
