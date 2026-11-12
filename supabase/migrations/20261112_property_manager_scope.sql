-- Workspace membership identifies a manager for shared Calendar access.
-- Their property assignment, with its explicit write flags, controls Queue access.
-- Internal job media, payment attachments, and job sessions remain staff-only.
begin;

create or replace function public.trimax_has_business_access(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and bu.role is distinct from 'property_manager'
      and (
        bu.user_id = auth.uid()
        or lower(bu.email) = public.trimax_current_user_email()
      )
  );
$$;

create or replace function public.trimax_can_access_property(
  target_business_id uuid,
  target_property text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.trimax_has_business_role(
      target_business_id,
      array[
        'owner',
        'admin',
        'technician',
        'vendor',
        'subcontractor',
        'cleaner',
        'flooring_contractor'
      ]
    )
    or exists (
      select 1
      from public.property_users pu
      where pu.business_id = target_business_id
        and (
          pu.user_id = auth.uid()
          or lower(pu.email) = public.trimax_current_user_email()
        )
        and lower(pu.property_name) = lower(coalesce(target_property, ''))
    );
$$;

create or replace function public.trimax_can_manage_property_queue(
  target_business_id uuid,
  target_property text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.trimax_has_business_role(
      target_business_id,
      array[
        'owner',
        'admin',
        'technician',
        'vendor',
        'subcontractor',
        'cleaner',
        'flooring_contractor'
      ]
    )
    or exists (
      select 1
      from public.property_users pu
      where pu.business_id = target_business_id
        and coalesce(pu.can_update_queue_items, true)
        and (
          pu.user_id = auth.uid()
          or lower(pu.email) = public.trimax_current_user_email()
        )
        and lower(pu.property_name) = lower(coalesce(target_property, ''))
    );
$$;

create or replace function public.trimax_can_create_property_queue(
  target_business_id uuid,
  target_property text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.trimax_has_business_role(
      target_business_id,
      array[
        'owner',
        'admin',
        'technician',
        'vendor',
        'subcontractor',
        'cleaner',
        'flooring_contractor'
      ]
    )
    or exists (
      select 1
      from public.property_users pu
      where pu.business_id = target_business_id
        and coalesce(pu.can_create_queue_items, true)
        and (
          pu.user_id = auth.uid()
          or lower(pu.email) = public.trimax_current_user_email()
        )
        and lower(pu.property_name) = lower(coalesce(target_property, ''))
    );
$$;

-- Existing permissive policies on these tables predate outside users. Apply a
-- restrictive policy so existing staff rules still work and managers cannot
-- inherit access from a permissive development policy in any workspace.
create function public.trimax_is_scoped_property_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.business_users member
    where member.role = 'property_manager'
      and (member.user_id = auth.uid()
        or (member.user_id is null and lower(member.email) = public.trimax_current_user_email()))
  );
$$;

revoke all on function public.trimax_is_scoped_property_manager() from public, anon, service_role;
grant execute on function public.trimax_is_scoped_property_manager() to authenticated;

create policy scoped_manager_access_requests on public.access_requests
as restrictive to authenticated
using (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id))
with check (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id));

create policy scoped_manager_import_batches on public.import_batches
as restrictive to authenticated
using (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id))
with check (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id));

create policy scoped_manager_import_rows on public.import_rows
as restrictive to authenticated
using (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id))
with check (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id));

-- Queue push notifications currently carry property and unit details.
create policy scoped_manager_push_subscriptions on public.push_subscriptions
as restrictive to authenticated
using (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id))
with check (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id));

create policy scoped_manager_unit_history on public.unit_history
as restrictive to authenticated
using (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id))
with check (not public.trimax_is_scoped_property_manager() or public.trimax_is_business_admin(business_id));

commit;
