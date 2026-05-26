-- Outlook draft workflow foundation for Trimax.
-- This stores per-business email templates and future Microsoft Outlook
-- connection records. Tokens should be encrypted before production use.

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  template_key text not null,
  name text not null,
  document_type text not null check (document_type in ('invoice', 'estimate', 'follow_up')),
  subject_template text not null,
  body_template text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, template_key)
);

create table if not exists public.outlook_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  connected_by_email text,
  microsoft_user_id text,
  microsoft_email text,
  tenant_id text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'disabled', 'error')),
  scopes text[] not null default array[]::text[],
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, microsoft_email)
);

create table if not exists public.document_send_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_type text not null check (document_type in ('invoice', 'estimate')),
  document_id uuid not null,
  template_id uuid references public.email_templates(id) on delete set null,
  outlook_connection_id uuid references public.outlook_connections(id) on delete set null,
  recipient_email text,
  subject text,
  status text not null default 'draft_prepared' check (status in ('draft_prepared', 'draft_created', 'sent', 'error')),
  outlook_message_id text,
  error_message text,
  created_by_email text,
  created_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
alter table public.outlook_connections enable row level security;
alter table public.document_send_logs enable row level security;

drop policy if exists "Allow authenticated email template read during development" on public.email_templates;
create policy "Allow authenticated email template read during development"
  on public.email_templates
  for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated email template manage during development" on public.email_templates;
create policy "Allow authenticated email template manage during development"
  on public.email_templates
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated outlook connection read during development" on public.outlook_connections;
create policy "Allow authenticated outlook connection read during development"
  on public.outlook_connections
  for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated outlook connection manage during development" on public.outlook_connections;
create policy "Allow authenticated outlook connection manage during development"
  on public.outlook_connections
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated send log read during development" on public.document_send_logs;
create policy "Allow authenticated send log read during development"
  on public.document_send_logs
  for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated send log insert during development" on public.document_send_logs;
create policy "Allow authenticated send log insert during development"
  on public.document_send_logs
  for insert
  to authenticated
  with check (true);

insert into public.email_templates (
  business_id,
  template_key,
  name,
  document_type,
  subject_template,
  body_template,
  is_default
)
select
  businesses.id,
  defaults.template_key,
  defaults.name,
  defaults.document_type,
  defaults.subject_template,
  defaults.body_template,
  true
from public.businesses
cross join (
  values
    (
      'rnl_invoice',
      'R&L Invoice',
      'invoice',
      'Invoice {{document_number}} - {{customer_name}}',
      'Hi {{customer_name}},

Attached is invoice {{document_number}} for {{project_title}}.

Amount due: {{amount_due}}
Due date: {{due_date}}

Please let me know if you have any questions.

Thank you,
R&L Creations'
    ),
    (
      'rnl_estimate',
      'R&L Estimate',
      'estimate',
      'Estimate {{document_number}} - {{customer_name}}',
      'Hi {{customer_name}},

Attached is estimate {{document_number}} for {{project_title}}.

Please let me know if you have any questions.

Thank you,
R&L Creations'
    ),
    (
      'just_kleen_invoice',
      'Just Kleen Invoice',
      'invoice',
      'Invoice {{document_number}} - {{customer_name}}',
      'Hi {{customer_name}},

Attached is invoice {{document_number}} for {{project_title}}.

Amount due: {{amount_due}}
Due date: {{due_date}}

Please let us know if you have any questions.

Thank you,
Just Kleen'
    ),
    (
      'follow_up',
      'General Follow-up',
      'follow_up',
      'Following up - {{customer_name}}',
      'Hi {{customer_name}},

I wanted to follow up with you on {{project_title}}.

Thank you,
{{business_name}}'
    )
) as defaults(template_key, name, document_type, subject_template, body_template)
on conflict (business_id, template_key) do nothing;
