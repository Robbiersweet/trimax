-- Additive scope snapshot; no existing request, Queue, finance or history rewrite.
begin;
alter table public.queue_items add column apartment_turn jsonb;
create function public.trimax_validate_apartment_turn(p jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare k text;v text;max_length integer;d date;
begin
 if p is null or jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>17 then raise exception 'Invalid apartment-turn details';end if;
 for k in select jsonb_object_keys(p) loop
  if k not in ('building','unitLayout','carpet','vinyl','paintType','paintingScope','specialRequirements','smokedIn','primerRequested','wallPaintColor','paintCode','priority','priorRenovation','priorRenovationDetails','renovationNeeded','renovationNeededDetails','moveOutDate') then raise exception 'Unexpected turn field';end if;
  if k in ('smokedIn','primerRequested','priorRenovation','renovationNeeded') then
   if jsonb_typeof(p->k) is distinct from 'boolean' then raise exception 'Invalid turn boolean';end if;
  else
   max_length=case when k in ('specialRequirements','priorRenovationDetails','renovationNeededDetails') then 1000 when k='paintingScope' then 500 when k='wallPaintColor' then 200 else 100 end;
   if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'Invalid turn text';end if;
   v=p->>k;
   if length(v)>max_length or v ~ '[[:cntrl:]]' and k not in ('paintingScope','specialRequirements','priorRenovationDetails','renovationNeededDetails') or regexp_replace(v,E'[\n\r\t]','','g') ~ '[[:cntrl:]]' then raise exception 'Invalid turn text';end if;
   if v is distinct from btrim(replace(v,E'\r\n',E'\n')) then raise exception 'Unnormalized turn text';end if;
  end if;
 end loop;
 if p->>'carpet' not in ('Keep','Replace','To Be Determined') or p->>'vinyl' not in ('Keep','Replace','To Be Determined') or p->>'paintType' not in ('Classic','Color Change','Touch-Up','Full Repaint','Primer + Paint','Reno Paint') or p->>'priority' not in ('Low','Normal','High','Urgent') or p->>'unitLayout' not in ('','2x2 - 2 Bed / 2 Bath','2x1 - 2 Bed / 1 Bath','Confirm with manager') then raise exception 'Invalid turn option';end if;
 if p->>'paintCode'<>'' and p->>'paintCode' !~ '^SW ?[0-9]{4}$' then raise exception 'Invalid paint code';end if;
 if p->>'moveOutDate'<>'' then
  if p->>'moveOutDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid move-out date';end if;
  d=(p->>'moveOutDate')::date;
  if not isfinite(d) or d::text<>p->>'moveOutDate' then raise exception 'Invalid move-out date';end if;
 end if;
 return p;
end $$;
revoke all on function public.trimax_validate_apartment_turn(jsonb) from public,anon,authenticated,service_role;
create or replace function public.trimax_submit_maintenance_qr(p_label_id uuid,p_payload jsonb,p_key text,p_capability_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare q public.maintenance_qr_labels;s public.public_scheduling_settings;r jsonb;bound_payload jsonb;u text;area text;addr text;turn jsonb;
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
 if p_payload ? 'apartmentTurn' then
  if q.scope<>'property' then raise exception 'Apartment turns require an Office QR';end if;
  turn=public.trimax_validate_apartment_turn(p_payload->'apartmentTurn');
 end if;
 bound_payload=(p_payload-'unit'-'specificArea'-'apartmentTurn')||jsonb_build_object('address',addr||', Unit '||u);
 r=public.trimax_submit_public_service_request(s.public_slug,bound_payload,encode(sha256(convert_to('qr:'||q.id::text||':'||p_key,'UTF8')),'hex'),p_capability_hash);
 if exists(select 1 from public.maintenance_qr_requests b join public.public_service_requests x on x.id=b.request_id where b.request_id=(r->>'id')::uuid and coalesce(x.integration_references->>'specificArea','') is distinct from area) then raise exception 'Idempotency conflict';end if;
 if exists(select 1 from public.maintenance_qr_requests b join public.public_service_requests x on x.id=b.request_id where b.request_id=(r->>'id')::uuid and coalesce(x.integration_references->'apartmentTurn','null'::jsonb) is distinct from coalesce(turn,'null'::jsonb)) then raise exception 'Idempotency conflict';end if;
 insert into public.maintenance_qr_requests(request_id,label_id) values((r->>'id')::uuid,q.id) on conflict(request_id) do nothing;
 update public.public_service_requests set integration_references=coalesce(integration_references,'{}'::jsonb)||jsonb_build_object('maintenanceQrId',q.id,'property',q.property_name,'propertyUnit',u,'specificArea',area)||case when turn is not null then jsonb_build_object('apartmentTurn',turn) else '{}'::jsonb end where id=(r->>'id')::uuid and business_id=q.business_id;
 return r;
end $$;

create or replace function public.trimax_office_qr_queue_location() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare location record;t jsonb;
begin
 select q.property_name,r.integration_references->>'propertyUnit' unit,r.integration_references->'apartmentTurn' turn,r.preferred_date into location
 from public.public_service_requests r join public.maintenance_qr_requests b on b.request_id=r.id join public.maintenance_qr_labels q on q.id=b.label_id
 where r.id=new.source_request_id and r.business_id=new.business_id and q.business_id=r.business_id and q.scope='property';
 if not found then return new;end if;
 if length(coalesce(location.unit,'')) between 1 and 100 then new.property=location.property_name;new.unit=location.unit;end if;
 if location.turn is not null then
  t=public.trimax_validate_apartment_turn(location.turn);
  new.apartment_turn=t;new.paint_type=t->>'paintType';new.unit_layout=nullif(t->>'unitLayout','');
  new.wall_paint_color=concat_ws(' ',nullif(t->>'wallPaintColor',''),case when t->>'paintCode'<>'' and position((t->>'paintCode') in (t->>'wallPaintColor'))=0 then t->>'paintCode' end);
  new.flooring=case when t->>'carpet'='Keep' and t->>'vinyl'='Keep' then 'Keep Carpet & Keep Vinyl' when t->>'carpet'='Replace' and t->>'vinyl'='Keep' then 'Keep Vinyl & Replace Carpet' when t->>'carpet'='Keep' and t->>'vinyl'='Replace' then 'Keep Carpet & Replace Vinyl' when t->>'carpet'='Replace' and t->>'vinyl'='Replace' then 'Replace Carpet & Replace Vinyl' else 'To Be Determined' end;
  new.smoked_in=(t->>'smokedIn')::boolean;new.primer_requested=(t->>'primerRequested')::boolean;
  new.prior_renovation=(t->>'priorRenovation')::boolean;new.prior_renovation_details=nullif(t->>'priorRenovationDetails','');
  new.renovation_needed=(t->>'renovationNeeded')::boolean;new.renovation_needed_details=nullif(t->>'renovationNeededDetails','');
  new.move_out_date=nullif(t->>'moveOutDate','')::date;new.ready_date=location.preferred_date;new.priority=t->>'priority';
  -- A requested priority never writes another job or assigns priority_order/scheduling.
 end if;
 return new;
end $$;
notify pgrst,'reload schema';
commit;
