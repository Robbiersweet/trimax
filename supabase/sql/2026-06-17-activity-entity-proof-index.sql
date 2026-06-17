create index if not exists activity_logs_business_entity_created_idx
  on public.activity_logs (business_id, entity_type, entity_id, created_at desc);
