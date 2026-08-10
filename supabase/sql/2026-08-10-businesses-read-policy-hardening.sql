-- Final business row visibility hardening for the controlled second-business pilot.
-- Removes broad public business enumeration while preserving workspace and property-user loading.

create or replace function public.trimax_can_read_business(target_business_id uuid)
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
      and (
        bu.user_id = auth.uid()
        or lower(bu.email) = public.trimax_current_user_email()
      )
  )
  or exists (
    select 1
    from public.property_users pu
    where pu.business_id = target_business_id
      and (
        pu.user_id = auth.uid()
        or lower(pu.email) = public.trimax_current_user_email()
      )
  );
$$;

drop policy if exists "Enable public read access for businesses" on public.businesses;
drop policy if exists "Allow public read access for businesses" on public.businesses;
drop policy if exists "Allow authenticated business read" on public.businesses;
drop policy if exists "Allow scoped business read" on public.businesses;

create policy "Allow scoped business read"
on public.businesses
for select
to authenticated
using (public.trimax_can_read_business(id));
