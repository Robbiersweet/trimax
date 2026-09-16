-- User-verified contact/address update for the existing Glen client.
-- Run as one transaction. Reruns do not duplicate clients or audit entries.
begin;
lock table clients, estimates, invoices, activity_logs, payment_attachments
  in share row exclusive mode;

create temp table glen_profile_before on commit drop as
select id, to_jsonb(c) snapshot from clients c
where id in ('bb7a2c43-916e-4a4e-9336-d567c3e6ec39',
             '6a8b2efb-7a28-49a3-b58f-a9a61ab0e5f4');
create temp table glen_documents_before on commit drop as
select 'estimate' kind, id, to_jsonb(e) snapshot from estimates e
where client_id = 'bb7a2c43-916e-4a4e-9336-d567c3e6ec39'
union all
select 'invoice', id, to_jsonb(i) from invoices i
where client_id = 'bb7a2c43-916e-4a4e-9336-d567c3e6ec39';

create temp table glen_refresh_targets on commit drop as
select d.* from glen_documents_before d
where d.snapshot->>'status' = 'Draft'
  and d.snapshot->>'customer_name' = 'Glen North Creek'
  and coalesce((d.snapshot->>'amount_paid')::numeric, 0) = 0
  and not exists (select 1 from activity_logs a where a.entity_id = d.id
    and a.action ~ '(sent|paid|payment|delivered)')
  and not exists (select 1 from payment_attachments p
    where d.id::text = any(p.matched_invoice_ids::text[]))
  and not exists (select 1 from invoices i where d.kind = 'estimate'
    and i.estimate_id = d.id and (i.status <> 'Draft' or coalesce(i.amount_paid,0) > 0
      or exists (select 1 from activity_logs a where a.entity_id = i.id
        and a.action ~ '(sent|paid|payment|delivered)')));

do $$ begin
  if not exists (select 1 from clients where id = 'bb7a2c43-916e-4a4e-9336-d567c3e6ec39'
    and name = 'Glen North Creek' and business_id = 'f31adfa1-26ad-4e74-ad94-a4668d7ad57d')
  then raise exception 'Authoritative Glen client not found'; end if;
end $$;

update clients set
  service_address = E'12115 Meridian Avenue S\r\nEverett, WA 98208',
  contact_name = 'Devon',
  email = 'manager@glenatnorthcreek.com',
  cc_email = 'manager@northcreekateverett.com'
where id = 'bb7a2c43-916e-4a4e-9336-d567c3e6ec39'
  and (service_address, contact_name, email, cc_email) is distinct from
      (E'12115 Meridian Avenue S\r\nEverett, WA 98208', 'Devon',
       'manager@glenatnorthcreek.com', 'manager@northcreekateverett.com');

update estimates e set service_address = E'12115 Meridian Avenue S\r\nEverett, WA 98208'
from glen_refresh_targets t where t.kind = 'estimate' and e.id = t.id
  and e.service_address is distinct from E'12115 Meridian Avenue S\r\nEverett, WA 98208';
update invoices i set service_address = E'12115 Meridian Avenue S\r\nEverett, WA 98208'
from glen_refresh_targets t where t.kind = 'invoice' and i.id = t.id
  and i.service_address is distinct from E'12115 Meridian Avenue S\r\nEverett, WA 98208';

insert into activity_logs (business_id, action, entity_type, entity_id, entity_label, details)
select c.business_id, 'client.profile_updated', 'client', c.id, c.name,
  jsonb_build_object('reason','User-verified Glen address, Devon contact and default CC',
    'before',b.snapshot,'after',to_jsonb(c),'source','2026-09-16-glen-client-profile')
from clients c join glen_profile_before b on b.id=c.id
where c.id='bb7a2c43-916e-4a4e-9336-d567c3e6ec39' and to_jsonb(c)<>b.snapshot;

insert into activity_logs (business_id, action, entity_type, entity_id, entity_label, details)
select (t.snapshot->>'business_id')::uuid, t.kind||'.address_refreshed', t.kind, t.id,
  t.snapshot->>'display_id', jsonb_build_object('reason','User-verified Glen property address',
    'before',t.snapshot,'service_address',E'12115 Meridian Avenue S\r\nEverett, WA 98208',
    'recipient_source','Persisted Glen client','to','manager@glenatnorthcreek.com',
    'cc','manager@northcreekateverett.com','source','2026-09-16-glen-client-profile')
from glen_refresh_targets t
where t.snapshot->>'service_address' is distinct from E'12115 Meridian Avenue S\r\nEverett, WA 98208';

do $$ begin
  if exists (select 1 from clients c join glen_profile_before b on b.id=c.id
    where c.id='6a8b2efb-7a28-49a3-b58f-a9a61ab0e5f4' and to_jsonb(c)<>b.snapshot)
  then raise exception 'North Creek changed'; end if;
  if exists (select 1 from clients c join glen_profile_before b on b.id=c.id
    where c.id='bb7a2c43-916e-4a4e-9336-d567c3e6ec39'
      and (to_jsonb(c)-array['service_address','contact_name','email','cc_email','updated_at'])
        <> (b.snapshot-array['service_address','contact_name','email','cc_email','updated_at']))
  then raise exception 'Glen settings outside requested profile fields changed'; end if;
  if exists (
    select 1 from glen_documents_before b join (
      select 'estimate' kind,id,to_jsonb(e) snapshot from estimates e
      union all select 'invoice',id,to_jsonb(i) from invoices i
    ) d on d.kind=b.kind and d.id=b.id
    where case when exists (select 1 from glen_refresh_targets t where t.id=b.id and t.kind=b.kind)
      then (d.snapshot-array['service_address','updated_at'])<>(b.snapshot-array['service_address','updated_at'])
      else d.snapshot<>b.snapshot end)
  then raise exception 'Document history or financial snapshot changed'; end if;
end $$;

select kind, snapshot->>'display_id' document, id from glen_refresh_targets order by kind,id;
commit;
