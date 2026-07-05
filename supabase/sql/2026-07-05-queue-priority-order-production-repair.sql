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

with ranked_queue_items as (
  select
    id,
    row_number() over (
      partition by business_id, property
      order by
        ready_date asc nulls last,
        created_at asc nulls last,
        id asc
    ) as next_priority_order
  from public.queue_items
  where priority_order is null
    and completed_date is null
    and coalesce(status, '') not in ('Completed', 'Archived', 'Deleted')
)
update public.queue_items queue_item
set
  priority_order = ranked_queue_items.next_priority_order,
  priority_updated_at = coalesce(queue_item.priority_updated_at, now())
from ranked_queue_items
where queue_item.id = ranked_queue_items.id;

create index if not exists queue_items_manager_priority_idx
  on public.queue_items (business_id, property, ready_date, priority_order);

notify pgrst, 'reload schema';
