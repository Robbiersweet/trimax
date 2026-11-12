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

commit;
