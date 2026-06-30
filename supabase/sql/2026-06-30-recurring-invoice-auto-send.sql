alter table public.recurring_invoice_templates
  add column if not exists auto_send_enabled boolean not null default false,
  add column if not exists recipient_email text,
  add column if not exists last_sent_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_send_error text;
