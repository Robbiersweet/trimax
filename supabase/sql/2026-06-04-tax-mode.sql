alter table public.estimates
  add column if not exists tax_mode text not null default 'taxable';

alter table public.invoices
  add column if not exists tax_mode text not null default 'taxable';
