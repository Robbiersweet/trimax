alter table invoices
add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_invoices_updated_at on invoices;

create trigger set_invoices_updated_at
before update on invoices
for each row
execute function set_updated_at();
