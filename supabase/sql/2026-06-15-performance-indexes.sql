-- Performance indexes for Trimax's highest-traffic screens.
-- Safe to run more than once. These indexes support workspace-scoped
-- dashboards, invoice lists, payment matching, queue views, and reports.

create index if not exists businesses_slug_idx
  on public.businesses (slug);

create index if not exists clients_business_created_idx
  on public.clients (business_id, created_at desc);

create index if not exists clients_business_name_idx
  on public.clients (business_id, name);

create index if not exists estimates_business_created_idx
  on public.estimates (business_id, created_at desc);

create index if not exists estimates_business_status_idx
  on public.estimates (business_id, status);

create index if not exists estimates_business_client_idx
  on public.estimates (business_id, client_id);

create index if not exists invoices_business_created_idx
  on public.invoices (business_id, created_at desc);

create index if not exists invoices_business_status_idx
  on public.invoices (business_id, status);

create index if not exists invoices_business_issue_display_idx
  on public.invoices (business_id, issue_date desc, display_id desc);

create index if not exists invoices_business_client_idx
  on public.invoices (business_id, client_id);

create index if not exists invoices_business_estimate_idx
  on public.invoices (business_id, estimate_id);

create index if not exists invoices_business_due_idx
  on public.invoices (business_id, due_date);

create index if not exists invoices_split_parent_idx
  on public.invoices (split_parent_invoice_id)
  where split_parent_invoice_id is not null;

create index if not exists queue_items_business_created_idx
  on public.queue_items (business_id, created_at desc);

create index if not exists queue_items_business_status_idx
  on public.queue_items (business_id, status);

create index if not exists queue_items_business_ready_idx
  on public.queue_items (business_id, ready_date);

create index if not exists queue_items_business_scheduled_idx
  on public.queue_items (business_id, scheduled_date);

create index if not exists queue_items_business_completed_idx
  on public.queue_items (business_id, completed_date);

create index if not exists queue_items_business_estimate_idx
  on public.queue_items (business_id, linked_estimate_id);

create index if not exists activity_logs_business_action_created_idx
  on public.activity_logs (business_id, action, created_at desc);
