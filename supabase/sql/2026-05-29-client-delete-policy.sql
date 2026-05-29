drop policy if exists "Allow authenticated client delete during development"
  on clients;

create policy "Allow authenticated client delete during development"
  on clients
  for delete
  to authenticated
  using (true);
