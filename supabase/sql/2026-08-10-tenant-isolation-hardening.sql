-- Tenant isolation hardening for the controlled second-business pilot.
-- Removes live development-open policies and replaces them with business-scoped rules.
-- Run in Supabase SQL editor before creating a second production organization.

create or replace function public.trimax_current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

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
      and (
        bu.user_id = auth.uid()
        or lower(bu.email) = public.trimax_current_user_email()
      )
  );
$$;

create or replace function public.trimax_has_business_role(
  target_business_id uuid,
  allowed_roles text[]
)
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
      and bu.role = any(allowed_roles)
      and (
        bu.user_id = auth.uid()
        or lower(bu.email) = public.trimax_current_user_email()
      )
  );
$$;

create or replace function public.trimax_is_business_admin(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.trimax_has_business_role(target_business_id, array['owner', 'admin']);
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
        'property_manager',
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
        'property_manager',
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
        'property_manager',
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

create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);

create index if not exists business_settings_business_key_idx
  on public.business_settings (business_id, key);

alter table public.business_settings enable row level security;

drop policy if exists "Allow business settings read" on public.business_settings;
drop policy if exists "Allow business settings manage" on public.business_settings;

create policy "Allow business settings read"
on public.business_settings
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business settings manage"
on public.business_settings
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

insert into public.business_settings (business_id, key, value, updated_at, updated_by)
select
  b.id,
  'email_settings',
  s.value,
  coalesce(s.updated_at, now()),
  s.updated_by
from public.app_settings s
join public.businesses b
  on s.key = ('email_settings:' || b.slug)
where jsonb_typeof(s.value) = 'object'
on conflict (business_id, key) do update
set
  value = excluded.value,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;

drop policy if exists "Enable public insert access for businesses" on public.businesses;
drop policy if exists "Enable public update access for businesses" on public.businesses;
drop policy if exists "Allow owner admin business update" on public.businesses;

create policy "Allow owner admin business update"
on public.businesses
for update
to authenticated
using (public.trimax_is_business_admin(id))
with check (public.trimax_is_business_admin(id));

drop policy if exists "Allow authenticated business users manage during development" on public.business_users;
drop policy if exists "Allow business user self read" on public.business_users;
drop policy if exists "Allow owner admin business user manage" on public.business_users;

create policy "Allow business user self read"
on public.business_users
for select
to authenticated
using (
  user_id = auth.uid()
  or lower(email) = public.trimax_current_user_email()
  or public.trimax_is_business_admin(business_id)
);

create policy "Allow owner admin business user manage"
on public.business_users
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated property users manage during development" on public.property_users;
drop policy if exists "Allow property user scoped read" on public.property_users;
drop policy if exists "Allow owner admin property user manage" on public.property_users;

create policy "Allow property user scoped read"
on public.property_users
for select
to authenticated
using (
  auth.uid() = user_id
  or lower(email) = public.trimax_current_user_email()
  or public.trimax_is_business_admin(business_id)
);

create policy "Allow owner admin property user manage"
on public.property_users
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated activity logs" on public.activity_logs;
drop policy if exists "Allow authenticated activity insert during development" on public.activity_logs;
drop policy if exists "Allow authenticated activity read during development" on public.activity_logs;
drop policy if exists "Allow authenticated activity manage during development" on public.activity_logs;
drop policy if exists "Allow business activity read" on public.activity_logs;
drop policy if exists "Allow business activity insert" on public.activity_logs;

create policy "Allow business activity read"
on public.activity_logs
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business activity insert"
on public.activity_logs
for insert
to authenticated
with check (public.trimax_has_business_access(business_id));

drop policy if exists "Allow authenticated client delete during development" on public.clients;
drop policy if exists "Enable public delete access for clients" on public.clients;
drop policy if exists "Enable public insert access for clients" on public.clients;
drop policy if exists "Enable public read access for clients" on public.clients;
drop policy if exists "Enable public update access for clients" on public.clients;
drop policy if exists "Allow business client read" on public.clients;
drop policy if exists "Allow business client manage" on public.clients;

create policy "Allow business client read"
on public.clients
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business client manage"
on public.clients
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Allow authenticated estimate delete during development" on public.estimates;
drop policy if exists "Allow public delete estimates" on public.estimates;
drop policy if exists "Allow public insert estimates" on public.estimates;
drop policy if exists "Enable public insert access for estimates" on public.estimates;
drop policy if exists "Allow public read estimates" on public.estimates;
drop policy if exists "Enable public read access for estimates" on public.estimates;
drop policy if exists "Allow public update estimates" on public.estimates;
drop policy if exists "Enable public update access for estimates" on public.estimates;
drop policy if exists "Allow business estimate read" on public.estimates;
drop policy if exists "Allow business estimate manage" on public.estimates;

create policy "Allow business estimate read"
on public.estimates
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business estimate manage"
on public.estimates
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Allow authenticated estimate line item access" on public.estimate_line_items;
drop policy if exists "Allow authenticated estimate line item delete during developmen" on public.estimate_line_items;
drop policy if exists "Allow authenticated estimate line item delete during development" on public.estimate_line_items;
drop policy if exists "Allow public estimate line item reads" on public.estimate_line_items;
drop policy if exists "Allow business estimate line item read" on public.estimate_line_items;
drop policy if exists "Allow business estimate line item manage" on public.estimate_line_items;

create policy "Allow business estimate line item read"
on public.estimate_line_items
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business estimate line item manage"
on public.estimate_line_items
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Enable public delete access for invoices" on public.invoices;
drop policy if exists "Enable public insert access for invoices" on public.invoices;
drop policy if exists "Enable public read access for invoices" on public.invoices;
drop policy if exists "Enable public update access for invoices" on public.invoices;
drop policy if exists "Allow business invoice read" on public.invoices;
drop policy if exists "Allow business invoice manage" on public.invoices;

create policy "Allow business invoice read"
on public.invoices
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business invoice manage"
on public.invoices
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Allow authenticated invoice line item access" on public.invoice_line_items;
drop policy if exists "Allow public invoice line item reads" on public.invoice_line_items;
drop policy if exists "Allow business invoice line item read" on public.invoice_line_items;
drop policy if exists "Allow business invoice line item manage" on public.invoice_line_items;

create policy "Allow business invoice line item read"
on public.invoice_line_items
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business invoice line item manage"
on public.invoice_line_items
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Allow authenticated queue items" on public.queue_items;
drop policy if exists "Allow public delete access" on public.queue_items;
drop policy if exists "Allow public insert access" on public.queue_items;
drop policy if exists "Allow public read access" on public.queue_items;
drop policy if exists "Allow authenticated queue estimate unlink during development" on public.queue_items;
drop policy if exists "Allow public update access" on public.queue_items;
drop policy if exists "Allow scoped queue item read" on public.queue_items;
drop policy if exists "Allow scoped queue item insert" on public.queue_items;
drop policy if exists "Allow scoped queue item update" on public.queue_items;
drop policy if exists "Allow admin queue item delete" on public.queue_items;

create policy "Allow scoped queue item read"
on public.queue_items
for select
to authenticated
using (public.trimax_can_access_property(business_id, property));

create policy "Allow scoped queue item insert"
on public.queue_items
for insert
to authenticated
with check (public.trimax_can_create_property_queue(business_id, property));

create policy "Allow scoped queue item update"
on public.queue_items
for update
to authenticated
using (public.trimax_can_manage_property_queue(business_id, property))
with check (public.trimax_can_manage_property_queue(business_id, property));

create policy "Allow admin queue item delete"
on public.queue_items
for delete
to authenticated
using (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated internal note manage during development" on public.internal_notes;
drop policy if exists "Allow authenticated internal note read during development" on public.internal_notes;
drop policy if exists "Allow business internal note read" on public.internal_notes;
drop policy if exists "Allow business internal note manage" on public.internal_notes;

create policy "Allow business internal note read"
on public.internal_notes
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business internal note manage"
on public.internal_notes
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Allow authenticated property manage during development" on public.properties;
drop policy if exists "Allow authenticated property read during development" on public.properties;
drop policy if exists "Allow scoped property read" on public.properties;
drop policy if exists "Allow admin property manage" on public.properties;

create policy "Allow scoped property read"
on public.properties
for select
to authenticated
using (public.trimax_can_access_property(business_id, name));

create policy "Allow admin property manage"
on public.properties
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated property unit manage during development" on public.property_units;
drop policy if exists "Allow authenticated property unit read during development" on public.property_units;
drop policy if exists "Allow scoped property unit read" on public.property_units;
drop policy if exists "Allow admin property unit manage" on public.property_units;

create policy "Allow scoped property unit read"
on public.property_units
for select
to authenticated
using (
  exists (
    select 1
    from public.properties p
    where p.id = property_units.property_id
      and public.trimax_can_access_property(property_units.business_id, p.name)
  )
);

create policy "Allow admin property unit manage"
on public.property_units
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated recurring invoice template manage during de" on public.recurring_invoice_templates;
drop policy if exists "Allow authenticated recurring invoice template manage during development" on public.recurring_invoice_templates;
drop policy if exists "Allow authenticated recurring invoice template read during deve" on public.recurring_invoice_templates;
drop policy if exists "Allow authenticated recurring invoice template read during development" on public.recurring_invoice_templates;
drop policy if exists "Allow business recurring template read" on public.recurring_invoice_templates;
drop policy if exists "Allow admin recurring template manage" on public.recurring_invoice_templates;

create policy "Allow business recurring template read"
on public.recurring_invoice_templates
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow admin recurring template manage"
on public.recurring_invoice_templates
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Allow authenticated service item access" on public.service_items;
drop policy if exists "Allow public service item reads" on public.service_items;
drop policy if exists "Allow business service item read" on public.service_items;
drop policy if exists "Allow business service item manage" on public.service_items;

create policy "Allow business service item read"
on public.service_items
for select
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

create policy "Allow business service item manage"
on public.service_items
for all
to authenticated
using (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']))
with check (public.trimax_has_business_role(business_id, array['owner', 'admin', 'accountant']));

drop policy if exists "Allow authenticated app settings read" on public.app_settings;
drop policy if exists "Allow owner admin app settings update" on public.app_settings;
drop policy if exists "Allow owner admin app settings insert" on public.app_settings;

create policy "Allow authenticated platform settings read"
on public.app_settings
for select
to authenticated
using (key in ('maintenance_mode', 'maintenance_message'));

create policy "Allow owner admin platform settings insert"
on public.app_settings
for insert
to authenticated
with check (
  key in ('maintenance_mode', 'maintenance_message')
  and exists (
    select 1
    from public.business_users bu
    where (
      bu.user_id = auth.uid()
      or lower(bu.email) = public.trimax_current_user_email()
    )
      and bu.role in ('owner', 'admin')
  )
);

create policy "Allow owner admin platform settings update"
on public.app_settings
for update
to authenticated
using (
  key in ('maintenance_mode', 'maintenance_message')
  and exists (
    select 1
    from public.business_users bu
    where (
      bu.user_id = auth.uid()
      or lower(bu.email) = public.trimax_current_user_email()
    )
      and bu.role in ('owner', 'admin')
  )
)
with check (
  key in ('maintenance_mode', 'maintenance_message')
  and exists (
    select 1
    from public.business_users bu
    where (
      bu.user_id = auth.uid()
      or lower(bu.email) = public.trimax_current_user_email()
    )
      and bu.role in ('owner', 'admin')
  )
);
