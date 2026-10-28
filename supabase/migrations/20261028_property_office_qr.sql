-- Property-wide office intake extends existing QR tables; no card inventory.
-- Existing unit labels, financial records and request history remain intact.
begin;
alter table public.property_users add column is_test_fixture boolean not null default false;
-- This is the verified production acceptance assignment, not a name heuristic.
update public.property_users set is_test_fixture=true
where id='915178a8-1776-4c44-991c-65e600350430' and business_id='f31adfa1-26ad-4e74-ad94-a4668d7ad57d' and property_name='QR RC3 ACCEPTANCE — SYNTHETIC ONLY';
alter table public.maintenance_qr_labels add column scope text not null default 'unit' check(scope in ('unit','property'));
alter table public.maintenance_qr_labels alter column unit drop not null;
alter table public.maintenance_qr_labels drop constraint maintenance_qr_labels_unit_check;
alter table public.maintenance_qr_labels add constraint maintenance_qr_labels_location_check check((scope='unit' and unit is not null and length(unit) between 1 and 100) or (scope='property' and unit is null));
create unique index maintenance_qr_one_active_property on public.maintenance_qr_labels(business_id,lower(btrim(property_name))) where active and scope='property';

-- Private helper: resolve one unambiguous saved service address within this
-- workspace. A conflicting/missing address needs review, never caller override.
create function public.trimax_qr_property_choices(p_business_id uuid)
returns table(id uuid,property text,address text,address_issue text)
language sql stable security definer set search_path=pg_catalog as $$
 with groups as (
  select (array_agg(a.id order by a.id))[1] id,min(btrim(a.property_name)) property,lower(btrim(a.property_name)) normalized
  from public.property_users a where a.business_id=p_business_id and not a.is_test_fixture group by lower(btrim(a.property_name))
 )
 select g.id,g.property,case when cardinality(c.addresses)=1 then c.addresses[1] end,
 case when cardinality(c.addresses)=1 then null when cardinality(c.addresses)>1 then 'Conflicting saved service addresses. Review the property client records.' else 'No saved service address. Update the property client record first.' end
 from groups g cross join lateral (
  select array_agg(distinct btrim(x.service_address)) filter(where nullif(btrim(x.service_address),'') is not null) addresses
  from public.clients x where x.business_id=p_business_id and (
   lower(btrim(x.name))=g.normalized or exists(select 1 from public.property_users a where a.business_id=p_business_id and lower(btrim(a.property_name))=g.normalized and not a.is_test_fixture and a.request_client_id=x.id)
  )
 ) c;
$$;
revoke all on function public.trimax_qr_property_choices(uuid) from public,anon,authenticated,service_role;

create or replace function public.trimax_manage_maintenance_qr(p_business_id uuid,p_assignment_id uuid default null,p_unit text default null,p_address text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare assignment_row public.property_users;
begin
 if auth.uid() is null or not exists(select 1 from public.business_users where business_id=p_business_id and user_id=auth.uid() and lower(role) in ('owner','admin')) then raise exception 'Not authorized';end if;
 if p_assignment_id is not null then
  select * into assignment_row from public.property_users where id=p_assignment_id and business_id=p_business_id and not is_test_fixture for share;
  if not found or length(btrim(coalesce(p_unit,''))) not between 1 and 100 or length(btrim(coalesce(p_address,''))) not between 1 and 500 then raise exception 'Choose an authorized property, unit and address';end if;
  insert into public.maintenance_qr_labels(business_id,property_name,unit,service_address,created_by)
  values(assignment_row.business_id,assignment_row.property_name,btrim(p_unit),btrim(p_address),auth.uid()) on conflict(business_id,property_name,unit) do nothing;
 end if;
 return jsonb_build_object('labels',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'property',q.property_name,'unit',q.unit,'scope',q.scope,'address',q.service_address,'active',q.active) order by q.property_name,q.unit) from public.maintenance_qr_labels q where q.business_id=p_business_id and exists(select 1 from public.property_users a where a.business_id=q.business_id and lower(btrim(a.property_name))=lower(btrim(q.property_name)) and not a.is_test_fixture)),'[]'::jsonb),
 'properties',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'property',c.property,'address',c.address,'addressIssue',c.address_issue) order by c.property) from public.trimax_qr_property_choices(p_business_id) c),'[]'::jsonb));
end $$;

create function public.trimax_manage_property_maintenance_qr(p_business_id uuid,p_assignment_id uuid,p_action text default 'create',p_label_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a public.property_users;c record;current_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.business_users where business_id=p_business_id and user_id=auth.uid() and lower(role) in ('owner','admin')) then raise exception 'Not authorized';end if;
 select * into a from public.property_users where id=p_assignment_id and business_id=p_business_id and not is_test_fixture for share;
 if not found or p_action is null or p_action not in ('create','replace') then raise exception 'Choose an authorized property';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||lower(btrim(a.property_name)),0));
 select * into c from public.trimax_qr_property_choices(p_business_id) where lower(btrim(property))=lower(btrim(a.property_name));
 if c.address is null or length(c.address)>390 then raise exception 'Review the saved property service address';end if;
 select id into current_id from public.maintenance_qr_labels where business_id=p_business_id and lower(btrim(property_name))=lower(btrim(a.property_name)) and scope='property' and active for update;
 if p_action='replace' then
  if current_id is null or p_label_id is distinct from current_id then raise exception 'QR changed. Reload before replacing.';end if;
  update public.maintenance_qr_labels set active=false where id=current_id;
  current_id=null;
 end if;
 if current_id is null then
  insert into public.maintenance_qr_labels(business_id,property_name,scope,unit,service_address,created_by) values(p_business_id,c.property,'property',null,c.address,auth.uid());
 end if;
 return public.trimax_manage_maintenance_qr(p_business_id);
end $$;
revoke all on function public.trimax_manage_property_maintenance_qr(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trimax_manage_property_maintenance_qr(uuid,uuid,text,uuid) to authenticated;

create or replace function public.trimax_maintenance_qr_context(p_label_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('id',q.id,'businessId',q.business_id,'property',q.property_name,'unit',q.unit,'scope',q.scope,'address',case when q.scope='property' then c.address else q.service_address end,'slug',s.public_slug)
 from public.maintenance_qr_labels q join public.public_scheduling_settings s on s.business_id=q.business_id
 left join lateral(select address from public.trimax_qr_property_choices(q.business_id) where lower(btrim(property))=lower(btrim(q.property_name))) c on q.scope='property'
 where q.id=p_label_id and q.active and s.enabled and (q.scope='unit' or c.address is not null);
$$;

create or replace function public.trimax_submit_maintenance_qr(p_label_id uuid,p_payload jsonb,p_key text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare q public.maintenance_qr_labels;s public.public_scheduling_settings;r jsonb;bound_payload jsonb;u text;area text;addr text;
begin
 select * into q from public.maintenance_qr_labels where id=p_label_id and active for share;
 if not found then raise exception 'Label unavailable';end if;
 select * into s from public.public_scheduling_settings where business_id=q.business_id and enabled for share;
 if not found or p_key !~ '^[A-Za-z0-9_-]{16,100}$' or p_key is null then raise exception 'Intake unavailable';end if;
 u=q.unit;area='';addr=q.service_address;
 if q.scope='property' then
  if jsonb_typeof(p_payload->'unit') is distinct from 'string' or (p_payload ? 'specificArea' and jsonb_typeof(p_payload->'specificArea') is distinct from 'string') then raise exception 'Enter a unit';end if;
  u=btrim(p_payload->>'unit');area=btrim(coalesce(p_payload->>'specificArea',''));
  select address into addr from public.trimax_qr_property_choices(q.business_id) where lower(btrim(property))=lower(btrim(q.property_name));
  if addr is null then raise exception 'Property unavailable';end if;
 end if;
 if length(coalesce(u,'')) not between 1 and 100 or length(area)>100 or (u||area) ~ '[[:cntrl:]]' then raise exception 'Enter a valid unit and specific area';end if;
 bound_payload=(p_payload-'unit'-'specificArea')||jsonb_build_object('address',addr||', Unit '||u);
 r=public.trimax_submit_public_service_request(s.public_slug,bound_payload,encode(sha256(convert_to('qr:'||q.id::text||':'||p_key,'UTF8')),'hex'),p_capability_hash);
 if exists(select 1 from public.maintenance_qr_requests b join public.public_service_requests x on x.id=b.request_id where b.request_id=(r->>'id')::uuid and coalesce(x.integration_references->>'specificArea','') is distinct from area) then raise exception 'Idempotency conflict';end if;
 insert into public.maintenance_qr_requests(request_id,label_id) values((r->>'id')::uuid,q.id) on conflict(request_id) do nothing;
 update public.public_service_requests set integration_references=coalesce(integration_references,'{}'::jsonb)||jsonb_build_object('maintenanceQrId',q.id,'property',q.property_name,'propertyUnit',u,'specificArea',area) where id=(r->>'id')::uuid and business_id=q.business_id;
 return r;
end $$;

create or replace function public.trimax_submit_manager_maintenance_qr(p_label_id uuid,p_assignment_id uuid,p_key text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare q public.maintenance_qr_labels;r jsonb;u text;
begin
 select * into q from public.maintenance_qr_labels where id=p_label_id and active for share;
 if not found or auth.uid() is null or not exists(select 1 from public.property_users a where a.id=p_assignment_id and a.user_id=auth.uid() and a.business_id=q.business_id and lower(btrim(a.property_name))=lower(btrim(q.property_name))) then raise exception 'Not authorized';end if;
 u=case when q.scope='property' then btrim(p_payload->>'unit') else q.unit end;
 if length(coalesce(u,'')) not between 1 and 100 or u ~ '[[:cntrl:]]' then raise exception 'Enter a valid unit';end if;
 r=public.trimax_submit_property_request(p_assignment_id,encode(sha256(convert_to('qr-manager:'||q.id::text||':'||p_key,'UTF8')),'hex'),p_payload||jsonb_build_object('unit',u));
 insert into public.maintenance_qr_requests(request_id,label_id) values((r->>'id')::uuid,q.id) on conflict(request_id) do nothing;
 update public.public_service_requests set integration_references=coalesce(integration_references,'{}'::jsonb)||jsonb_build_object('maintenanceQrId',q.id,'property',q.property_name,'propertyUnit',u) where id=(r->>'id')::uuid and business_id=q.business_id;
 return r;
end $$;

-- Preserve the location when the existing owner-approval workflow creates work.
-- This applies only to requests bound to a property-wide QR; no auto approval.
create function public.trimax_office_qr_queue_location() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare location record;
begin
 select q.property_name,r.integration_references->>'propertyUnit' unit into location
 from public.public_service_requests r join public.maintenance_qr_requests b on b.request_id=r.id join public.maintenance_qr_labels q on q.id=b.label_id
 where r.id=new.source_request_id and r.business_id=new.business_id and q.business_id=r.business_id and q.scope='property';
 if found and length(coalesce(location.unit,'')) between 1 and 100 then new.property=location.property_name;new.unit=location.unit;end if;
 return new;
end $$;
revoke all on function public.trimax_office_qr_queue_location() from public,anon,authenticated,service_role;
create trigger trimax_office_qr_queue_location before insert on public.queue_items for each row execute function public.trimax_office_qr_queue_location();
notify pgrst,'reload schema';
commit;
