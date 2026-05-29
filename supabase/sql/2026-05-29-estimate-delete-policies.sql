drop policy if exists "Allow authenticated estimate delete during development"
  on estimates;

drop policy if exists "Allow authenticated estimate line item delete during development"
  on estimate_line_items;

drop policy if exists "Allow authenticated queue estimate unlink during development"
  on queue_items;

create policy "Allow authenticated estimate delete during development"
  on estimates
  for delete
  to authenticated
  using (true);

create policy "Allow authenticated estimate line item delete during development"
  on estimate_line_items
  for delete
  to authenticated
  using (true);

create policy "Allow authenticated queue estimate unlink during development"
  on queue_items
  for update
  to authenticated
  using (true)
  with check (true);
