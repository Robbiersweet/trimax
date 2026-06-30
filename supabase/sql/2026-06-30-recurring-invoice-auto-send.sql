alter table public.recurring_invoice_templates
  add column if not exists auto_send_enabled boolean not null default false,
  add column if not exists recipient_email text,
  add column if not exists cc_email text,
  add column if not exists bcc_email text,
  add column if not exists end_type text not null default 'forever'
    check (end_type in ('forever', 'until_date', 'after_occurrences')),
  add column if not exists end_date date,
  add column if not exists max_occurrences integer,
  add column if not exists occurrences_sent integer not null default 0,
  add column if not exists last_sent_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_send_error text;
