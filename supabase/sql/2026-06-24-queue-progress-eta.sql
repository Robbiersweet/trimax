alter table public.queue_items
  add column if not exists projected_completion_date date,
  add column if not exists progress_stage text,
  add column if not exists percent_complete integer,
  add column if not exists delay_reason text,
  add column if not exists manager_update text,
  add column if not exists manager_update_at timestamptz,
  add column if not exists manager_update_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'queue_items_percent_complete_range'
  ) then
    alter table public.queue_items
      add constraint queue_items_percent_complete_range
      check (percent_complete is null or percent_complete in (0, 25, 50, 75, 90, 100));
  end if;
end $$;

create index if not exists queue_items_progress_eta_idx
  on public.queue_items (
    business_id,
    property,
    progress_stage,
    projected_completion_date
  );
