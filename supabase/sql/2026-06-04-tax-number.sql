alter table public.estimates
  add column if not exists tax_number text;

alter table public.invoices
  add column if not exists tax_number text;
