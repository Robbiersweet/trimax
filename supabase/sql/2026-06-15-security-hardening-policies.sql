-- Security hardening pass for Trimax.
-- Replaces broad development policies with business-scoped access checks.
-- Review and run in Supabase SQL editor before inviting broader outside access.

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

create or replace function public.trimax_is_business_admin(target_business_id uuid)
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
      and bu.role in ('owner', 'admin')
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
    public.trimax_has_business_access(target_business_id)
    and (
      public.trimax_is_business_admin(target_business_id)
      or exists (
        select 1
        from public.business_users bu
        where bu.business_id = target_business_id
          and bu.role in ('owner', 'admin', 'accountant')
          and (
            bu.user_id = auth.uid()
            or lower(bu.email) = public.trimax_current_user_email()
          )
      )
      or exists (
        select 1
        from public.property_users pu
        where pu.business_id = target_business_id
          and lower(pu.email) = public.trimax_current_user_email()
          and lower(pu.property_name) = lower(coalesce(target_property, ''))
      )
    );
$$;

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

drop policy if exists "Allow authenticated activity read during development" on public.activity_logs;
drop policy if exists "Allow authenticated activity insert during development" on public.activity_logs;
drop policy if exists "Allow authenticated activity manage during development" on public.activity_logs;
drop policy if exists "Allow business activity read" on public.activity_logs;
drop policy if exists "Allow business activity insert" on public.activity_logs;

create policy "Allow business activity read"
on public.activity_logs
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business activity insert"
on public.activity_logs
for insert
to authenticated
with check (public.trimax_has_business_access(business_id));

drop policy if exists "Allow authenticated import batch read during development" on public.import_batches;
drop policy if exists "Allow authenticated import batch manage during development" on public.import_batches;
drop policy if exists "Allow business import batch read" on public.import_batches;
drop policy if exists "Allow admin import batch manage" on public.import_batches;

create policy "Allow business import batch read"
on public.import_batches
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow admin import batch manage"
on public.import_batches
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated import row read during development" on public.import_rows;
drop policy if exists "Allow authenticated import row manage during development" on public.import_rows;
drop policy if exists "Allow business import row read" on public.import_rows;
drop policy if exists "Allow admin import row manage" on public.import_rows;

create policy "Allow business import row read"
on public.import_rows
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow admin import row manage"
on public.import_rows
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated internal note read during development" on public.internal_notes;
drop policy if exists "Allow authenticated internal note manage during development" on public.internal_notes;
drop policy if exists "Allow business internal note read" on public.internal_notes;
drop policy if exists "Allow business internal note manage" on public.internal_notes;

create policy "Allow business internal note read"
on public.internal_notes
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business internal note manage"
on public.internal_notes
for all
to authenticated
using (public.trimax_has_business_access(business_id))
with check (public.trimax_has_business_access(business_id));

drop policy if exists "Allow authenticated recurring invoice template read during development" on public.recurring_invoice_templates;
drop policy if exists "Allow authenticated recurring invoice template manage during development" on public.recurring_invoice_templates;
drop policy if exists "Allow business recurring template read" on public.recurring_invoice_templates;
drop policy if exists "Allow admin recurring template manage" on public.recurring_invoice_templates;

create policy "Allow business recurring template read"
on public.recurring_invoice_templates
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow admin recurring template manage"
on public.recurring_invoice_templates
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated push subscription read during development" on public.push_subscriptions;
drop policy if exists "Allow authenticated push subscription manage during development" on public.push_subscriptions;
drop policy if exists "Allow business push subscription read" on public.push_subscriptions;
drop policy if exists "Allow business push subscription manage" on public.push_subscriptions;

create policy "Allow business push subscription read"
on public.push_subscriptions
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business push subscription manage"
on public.push_subscriptions
for all
to authenticated
using (public.trimax_has_business_access(business_id))
with check (public.trimax_has_business_access(business_id));

drop policy if exists "Allow authenticated email template read during development" on public.email_templates;
drop policy if exists "Allow authenticated email template manage during development" on public.email_templates;
drop policy if exists "Allow business email template read" on public.email_templates;
drop policy if exists "Allow admin email template manage" on public.email_templates;

create policy "Allow business email template read"
on public.email_templates
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow admin email template manage"
on public.email_templates
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated outlook connection read during development" on public.outlook_connections;
drop policy if exists "Allow authenticated outlook connection manage during development" on public.outlook_connections;
drop policy if exists "Allow admin outlook connection read" on public.outlook_connections;
drop policy if exists "Allow admin outlook connection manage" on public.outlook_connections;

create policy "Allow admin outlook connection read"
on public.outlook_connections
for select
to authenticated
using (public.trimax_is_business_admin(business_id));

create policy "Allow admin outlook connection manage"
on public.outlook_connections
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated send log read during development" on public.document_send_logs;
drop policy if exists "Allow authenticated send log insert during development" on public.document_send_logs;
drop policy if exists "Allow business send log read" on public.document_send_logs;
drop policy if exists "Allow business send log insert" on public.document_send_logs;

create policy "Allow business send log read"
on public.document_send_logs
for select
to authenticated
using (public.trimax_has_business_access(business_id));

create policy "Allow business send log insert"
on public.document_send_logs
for insert
to authenticated
with check (public.trimax_has_business_access(business_id));

drop policy if exists "Allow authenticated access request read during development" on public.access_requests;
drop policy if exists "Allow authenticated access request manage during development" on public.access_requests;
drop policy if exists "Allow admin access request read" on public.access_requests;
drop policy if exists "Allow admin access request manage" on public.access_requests;

create policy "Allow admin access request read"
on public.access_requests
for select
to authenticated
using (public.trimax_is_business_admin(business_id));

create policy "Allow admin access request manage"
on public.access_requests
for all
to authenticated
using (public.trimax_is_business_admin(business_id))
with check (public.trimax_is_business_admin(business_id));

drop policy if exists "Allow authenticated property read during development" on public.properties;
drop policy if exists "Allow authenticated property manage during development" on public.properties;
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

drop policy if exists "Allow authenticated property unit read during development" on public.property_units;
drop policy if exists "Allow authenticated property unit manage during development" on public.property_units;
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

drop policy if exists "Allow authenticated unit history read during development" on public.unit_history;
drop policy if exists "Allow authenticated unit history manage during development" on public.unit_history;
drop policy if exists "Allow scoped unit history read" on public.unit_history;
drop policy if exists "Allow business unit history insert" on public.unit_history;

create policy "Allow scoped unit history read"
on public.unit_history
for select
to authenticated
using (
  exists (
    select 1
    from public.property_units pu
    join public.properties p on p.id = pu.property_id
    where pu.id = unit_history.property_unit_id
      and public.trimax_can_access_property(unit_history.business_id, p.name)
  )
);

create policy "Allow business unit history insert"
on public.unit_history
for insert
to authenticated
with check (public.trimax_has_business_access(business_id));
