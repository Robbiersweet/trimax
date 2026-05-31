alter table public.recurring_invoice_templates
  add column if not exists next_run_date date,
  add column if not exists auto_create_drafts boolean not null default true,
  add column if not exists last_generated_for_date date,
  add column if not exists last_error text;

update public.recurring_invoice_templates
set next_run_date = current_date
where next_run_date is null;
