-- Explicit property names for clients whose billing name differs from the property.
-- Aliases are metadata; they never replace a user's persisted client selection.
alter table public.clients
  add column if not exists property_aliases text[] not null default '{}';
