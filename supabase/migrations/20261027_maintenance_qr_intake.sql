-- Additive candidate. Requires the existing property/photo intake migrations.
-- No anonymous table access, new credentials, financial writes or message sends.
begin;
create table public.maintenance_qr_labels (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 property_name text not null check(length(property_name) between 1 and 200),
 unit text not null check(length(unit) between 1 and 100),
 service_address text not null check(length(service_address) between 1 and 500),
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(business_id,property_name,unit)
);
create table public.maintenance_qr_requests (
 request_id uuid primary key references public.public_service_requests(id),
 label_id uuid not null references public.maintenance_qr_labels(id),
 created_at timestamptz not null default now()
);
alter table public.maintenance_qr_labels enable row level security;
alter table public.maintenance_qr_requests enable row level security;
revoke all on public.maintenance_qr_labels,public.maintenance_qr_requests from public,anon,authenticated,service_role;

-- Only workspace owners/admins may create/list labels. The property must already
-- be authorized in this workspace; no caller-supplied business/property override.
create function public.trimax_manage_maintenance_qr(p_business_id uuid,p_assignment_id uuid default null,p_unit text default null,p_address text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a public.property_users; label public.maintenance_qr_labels;
begin
 if auth.uid() is null or not exists(select 1 from public.business_users where business_id=p_business_id and user_id=auth.uid() and lower(role) in ('owner','admin')) then raise exception 'Not authorized';end if;
 if p_assignment_id is not null then
  select * into a from public.property_users where id=p_assignment_id and business_id=p_business_id for share;
  if not found or length(btrim(coalesce(p_unit,''))) not between 1 and 100 or length(btrim(coalesce(p_address,''))) not between 1 and 500 then raise exception 'Choose an authorized property, unit and address';end if;
  insert into public.maintenance_qr_labels(business_id,property_name,unit,service_address,created_by)
  values(a.business_id,a.property_name,btrim(p_unit),btrim(p_address),auth.uid())
  on conflict(business_id,property_name,unit) do nothing;
 end if;
 return jsonb_build_object('labels',coalesce((select jsonb_agg(jsonb_build_object('id',id,'property',property_name,'unit',unit,'address',service_address,'active',active) order by property_name,unit) from public.maintenance_qr_labels where business_id=p_business_id),'[]'::jsonb),
 'properties',coalesce((select jsonb_agg(jsonb_build_object('id',id,'property',property_name) order by property_name) from public.property_users where business_id=p_business_id),'[]'::jsonb));
end $$;

-- An opaque QR is an intake location, NOT authorization to view requests, photos,
-- tenant/contact data, or to create Queue work. Server returns only this context.
create function public.trimax_maintenance_qr_context(p_label_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('id',q.id,'businessId',q.business_id,'property',q.property_name,'unit',q.unit,'address',q.service_address,'slug',s.public_slug)
 from public.maintenance_qr_labels q join public.public_scheduling_settings s on s.business_id=q.business_id
 where q.id=p_label_id and q.active and s.enabled;
$$;

create function public.trimax_submit_maintenance_qr(p_label_id uuid,p_payload jsonb,p_key text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare q public.maintenance_qr_labels; s public.public_scheduling_settings; r jsonb; bound_payload jsonb;
begin
 select * into q from public.maintenance_qr_labels where id=p_label_id and active for share;
 if not found then raise exception 'Label unavailable';end if;
 select * into s from public.public_scheduling_settings where business_id=q.business_id and enabled for share;
 if not found or p_key !~ '^[A-Za-z0-9_-]{16,100}$' or p_key is null then raise exception 'Intake unavailable';end if;
 -- The existing RPC owns validation, idempotency, lifecycle and owner notices.
 -- Location is always taken from the label; never trust a hidden form field.
 bound_payload=p_payload || jsonb_build_object('address',q.service_address||', Unit '||q.unit);
 r=public.trimax_submit_public_service_request(s.public_slug,bound_payload,encode(sha256(convert_to('qr:'||q.id::text||':'||p_key,'UTF8')),'hex'),p_capability_hash);
 insert into public.maintenance_qr_requests(request_id,label_id) values((r->>'id')::uuid,q.id) on conflict(request_id) do nothing;
 update public.public_service_requests set integration_references=coalesce(integration_references,'{}'::jsonb)||jsonb_build_object('maintenanceQrId',q.id,'property',q.property_name,'propertyUnit',q.unit) where id=(r->>'id')::uuid and business_id=q.business_id;
 return r;
end $$;

create function public.trimax_submit_manager_maintenance_qr(p_label_id uuid,p_assignment_id uuid,p_key text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare q public.maintenance_qr_labels; r jsonb;
begin
 select * into q from public.maintenance_qr_labels where id=p_label_id and active for share;
 if not found or auth.uid() is null or not exists(select 1 from public.property_users a where a.id=p_assignment_id and a.user_id=auth.uid() and a.business_id=q.business_id and a.property_name=q.property_name) then raise exception 'Not authorized';end if;
 -- Existing manager function rechecks assignment/direct-Queue permission and
 -- client binding in the same transaction. The QR grants no additional access.
 r=public.trimax_submit_property_request(p_assignment_id,encode(sha256(convert_to('qr-manager:'||q.id::text||':'||p_key,'UTF8')),'hex'),p_payload||jsonb_build_object('unit',q.unit));
 insert into public.maintenance_qr_requests(request_id,label_id) values((r->>'id')::uuid,q.id) on conflict(request_id) do nothing;
 update public.public_service_requests set integration_references=coalesce(integration_references,'{}'::jsonb)||jsonb_build_object('maintenanceQrId',q.id) where id=(r->>'id')::uuid and business_id=q.business_id;
 return r;
end $$;
revoke all on function public.trimax_manage_maintenance_qr(uuid,uuid,text,text),public.trimax_maintenance_qr_context(uuid),public.trimax_submit_maintenance_qr(uuid,jsonb,text,text),public.trimax_submit_manager_maintenance_qr(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.trimax_manage_maintenance_qr(uuid,uuid,text,text),public.trimax_submit_manager_maintenance_qr(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.trimax_maintenance_qr_context(uuid),public.trimax_submit_maintenance_qr(uuid,jsonb,text,text) to service_role;
commit;
