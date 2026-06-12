alter table public.invoices
  add column if not exists deposit_requested_amount numeric default 0,
  add column if not exists deposit_requested_at timestamptz,
  add column if not exists deposit_status text default 'none',
  add column if not exists deposit_note text;

create index if not exists invoices_deposit_status_idx
  on public.invoices (business_id, deposit_status);
