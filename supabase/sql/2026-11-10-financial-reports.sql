begin;

create table public.financial_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  business_date date not null,
  vendor text not null check (length(trim(vendor)) between 1 and 240),
  description text not null default '' check (length(description) <= 1000),
  category text check (category in ('materials','supplies','tools','fuel','vehicle','insurance','software','helper labor','subcontractors','miscellaneous')),
  classification text not null check (classification in ('expense','business refund','transfer','owner draw','credit-card payment','personal','unclassified')),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  source_key text check (source_key is null or source_key ~ '^[a-f0-9]{64}$'),
  receipt_name text check (length(receipt_name) <= 200),
  receipt_type text check (receipt_type in ('application/pdf','image/png','image/jpeg')),
  receipt_data text check (length(receipt_data) <= 1024000),
  voided boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, source_key),
  check ((classification in ('expense','business refund')) = (category is not null)),
  check ((receipt_name is null and receipt_type is null and receipt_data is null) or
         (receipt_name is not null and receipt_type is not null and receipt_data is not null))
);
create index financial_expenses_period on public.financial_expenses(business_id,business_date,id);

create table public.financial_expense_history (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id),
  expense_id uuid not null references public.financial_expenses(id),
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  previous jsonb,
  current jsonb not null
);
create index financial_expense_history_expense on public.financial_expense_history(business_id,expense_id,id);

create table public.financial_report_coverage (
  business_id uuid not null references public.businesses(id),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  id bigint generated always as identity primary key,
  verified_by uuid not null default auth.uid() check (verified_by = auth.uid()),
  verified_at timestamptz not null default clock_timestamp()
);

alter table public.financial_expenses enable row level security;
alter table public.financial_expense_history enable row level security;
alter table public.financial_report_coverage enable row level security;
revoke all on public.financial_expenses, public.financial_expense_history, public.financial_report_coverage from public, anon, authenticated;
grant select on public.financial_expenses, public.financial_expense_history, public.financial_report_coverage to authenticated;
grant insert (business_id,business_date,vendor,description,category,classification,amount_cents,source_key,receipt_name,receipt_type,receipt_data)
  on public.financial_expenses to authenticated;
grant update (business_date,vendor,description,category,classification,amount_cents,voided) on public.financial_expenses to authenticated;
grant insert (business_id,period_start,period_end) on public.financial_report_coverage to authenticated;

create policy financial_expense_read on public.financial_expenses for select to authenticated using (public.trimax_is_business_admin(business_id));
create policy financial_expense_add on public.financial_expenses for insert to authenticated with check (public.trimax_is_business_admin(business_id));
create policy financial_expense_edit on public.financial_expenses for update to authenticated using (public.trimax_is_business_admin(business_id)) with check (public.trimax_is_business_admin(business_id));
create policy financial_history_read on public.financial_expense_history for select to authenticated using (public.trimax_is_business_admin(business_id));
create policy financial_coverage_read on public.financial_report_coverage for select to authenticated using (public.trimax_is_business_admin(business_id));
create policy financial_coverage_add on public.financial_report_coverage for insert to authenticated with check (public.trimax_is_business_admin(business_id) and verified_by = auth.uid());

create function public.trimax_financial_expense_revision() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  new.revision := old.revision + 1;
  return new;
end $$;
revoke all on function public.trimax_financial_expense_revision() from public, anon, authenticated;
create trigger financial_expense_revision before update on public.financial_expenses
  for each row execute function public.trimax_financial_expense_revision();

create function public.trimax_financial_expense_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.financial_expense_history(business_id,expense_id,changed_by,previous,current)
  values(new.business_id,new.id,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old)-'receipt_data' end,to_jsonb(new)-'receipt_data');
  return new;
end $$;
revoke all on function public.trimax_financial_expense_audit() from public, anon, authenticated;
create trigger financial_expense_audit after insert or update on public.financial_expenses
  for each row execute function public.trimax_financial_expense_audit();

commit;
