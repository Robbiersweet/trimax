create or replace function public.get_trimax_storage_health(
  requested_business_slug text
)
returns table (
  database_size_bytes bigint,
  invoice_count bigint,
  estimate_count bigint,
  queue_count bigint,
  client_count bigint,
  import_batch_count bigint,
  import_row_count bigint,
  property_unit_count bigint,
  unit_history_count bigint,
  activity_log_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_business_id uuid;
  current_role text;
begin
  select b.id
    into selected_business_id
  from public.businesses b
  where b.slug = requested_business_slug
  limit 1;

  if selected_business_id is null then
    raise exception 'Business not found';
  end if;

  select bu.role
    into current_role
  from public.business_users bu
  where bu.business_id = selected_business_id
    and bu.user_id = auth.uid()
    and bu.role in ('owner', 'admin')
  limit 1;

  if current_role is null then
    raise exception 'Only owners and admins can view storage health';
  end if;

  return query
  select
    pg_database_size(current_database())::bigint as database_size_bytes,
    (select count(*) from public.invoices where business_id = selected_business_id)::bigint as invoice_count,
    (select count(*) from public.estimates where business_id = selected_business_id)::bigint as estimate_count,
    (select count(*) from public.queue_items where business_id = selected_business_id)::bigint as queue_count,
    (select count(*) from public.clients where business_id = selected_business_id)::bigint as client_count,
    (select count(*) from public.import_batches where business_id = selected_business_id)::bigint as import_batch_count,
    (select count(*) from public.import_rows where business_id = selected_business_id)::bigint as import_row_count,
    (
      select count(*)
      from public.property_units pu
      join public.properties p on p.id = pu.property_id
      where p.business_id = selected_business_id
    )::bigint as property_unit_count,
    (
      select count(*)
      from public.unit_history uh
      join public.property_units pu on pu.id = uh.property_unit_id
      join public.properties p on p.id = pu.property_id
      where p.business_id = selected_business_id
    )::bigint as unit_history_count,
    (select count(*) from public.activity_logs where business_id = selected_business_id)::bigint as activity_log_count;
end;
$$;

grant execute on function public.get_trimax_storage_health(text) to authenticated;
