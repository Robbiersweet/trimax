alter table public.queue_items
  add column if not exists priority_order integer,
  add column if not exists priority_updated_at timestamptz,
  add column if not exists priority_updated_by uuid,
  add column if not exists deadline_updated_at timestamptz,
  add column if not exists deadline_updated_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'queue_items_priority_order_positive'
  ) then
    alter table public.queue_items
      add constraint queue_items_priority_order_positive
      check (priority_order is null or priority_order > 0);
  end if;
end $$;

create index if not exists queue_items_manager_priority_idx
  on public.queue_items (business_id, property, ready_date, priority_order);
