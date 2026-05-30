create table if not exists public.recurring_invoice_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  customer_name text not null,
  project_title text not null,
  service_address text,
  reference text,
  delivery_format text not null default 'standard' check (delivery_format in ('standard', '5stars_boa')),
  frequency text not null default 'monthly' check (frequency in ('monthly')),
  day_of_month integer not null default 1 check (day_of_month between 1 and 28),
  due_days integer not null default 30 check (due_days between 0 and 120),
  tax_label text,
  tax_rate numeric not null default 0,
  terms text,
  notes text,
  email_subject text,
  email_body text,
  line_items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  last_generated_invoice_id uuid references public.invoices(id) on delete set null,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_invoice_templates_business_idx
  on public.recurring_invoice_templates (business_id, is_active);

alter table public.recurring_invoice_templates enable row level security;

drop policy if exists "Allow authenticated recurring invoice template read during development"
  on public.recurring_invoice_templates;
create policy "Allow authenticated recurring invoice template read during development"
  on public.recurring_invoice_templates
  for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated recurring invoice template manage during development"
  on public.recurring_invoice_templates;
create policy "Allow authenticated recurring invoice template manage during development"
  on public.recurring_invoice_templates
  for all
  to authenticated
  using (true)
  with check (true);
