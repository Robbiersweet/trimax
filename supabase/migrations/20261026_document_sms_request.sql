-- Candidate only. Explicit owner action; no financial writes, activation or backfill.
begin;
create function public.trimax_queue_document_sms(p_business uuid,p_kind text,p_document uuid,p_key uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare doc jsonb;c public.clients;s public.communication_settings;prior public.communication_messages;mid uuid;phone_normal text;
begin
 if auth.uid() is null or not exists(select 1 from public.business_users where business_id=p_business and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Owner access required';end if;
 if p_key is null or p_document is null or p_kind not in ('estimate','invoice') or p_kind is null then raise exception 'Invalid document request';end if;
 select * into s from public.communication_settings where business_id=p_business for share;
 if not found or not s.enabled or not ((p_kind||'_sent')=any(s.milestones)) then raise exception 'Document SMS is disabled';end if;
 if p_kind='estimate' then
 select to_jsonb(e) into doc from public.estimates e where id=p_document and business_id=p_business for share;
 if doc is null or lower(coalesce(doc->>'status','')) not in ('sent','accepted','approved') then raise exception 'Issue the estimate before sharing';end if;
 else
 select to_jsonb(i) into doc from public.invoices i where id=p_document and business_id=p_business for share;
 if doc is null or lower(coalesce(doc->>'status','')) not in ('sent','partial','paid','overdue') then raise exception 'Issue the invoice before sharing';end if;
 end if;
 select * into c from public.clients where id=(doc->>'client_id')::uuid and business_id=p_business for share;
 phone_normal=public.trimax_normalize_sms_phone(c.phone);
 if not found or phone_normal is null or not exists(select 1 from public.communication_consent where business_id=p_business and client_id=c.id and phone=phone_normal and opted_in_at is not null and suppressed_at is null) then raise exception 'Current client SMS consent required';end if;
 select * into prior from public.communication_messages where business_id=p_business and idempotency_key='document-manual:'||p_key;
 if found then
 if prior.entity_type is distinct from p_kind or prior.entity_id is distinct from p_document or prior.client_id is distinct from c.id or prior.recipient is distinct from phone_normal then raise exception 'Document retry mismatch';end if;
 return prior.id;
 end if;
 insert into public.communication_messages(business_id,client_id,entity_type,entity_id,event_type,idempotency_key,recipient)
 values(p_business,c.id,p_kind,p_document,p_kind||'_sent','document-manual:'||p_key,phone_normal)
 on conflict(business_id,idempotency_key) do nothing returning id into mid;
 if mid is null then
 select * into prior from public.communication_messages where business_id=p_business and idempotency_key='document-manual:'||p_key;
 if prior.entity_type is distinct from p_kind or prior.entity_id is distinct from p_document or prior.client_id is distinct from c.id or prior.recipient is distinct from phone_normal then raise exception 'Document retry mismatch';end if;
 return prior.id;
 end if;
 insert into public.communication_audit(business_id,message_id,event_type,details) values(p_business,mid,'document_sms_requested',jsonb_build_object('actor',auth.uid(),'kind',p_kind,'documentId',p_document));
 return mid;
end $$;
-- Revalidate manual document eligibility when a message is leased; customer links also revalidate on every read.
create function public.trimax_manual_document_sms_current() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare available boolean;
begin
 if new.status='leased' and new.idempotency_key like 'document-manual:%' then
 if new.entity_type='estimate' then select exists(select 1 from public.estimates where id=new.entity_id and business_id=new.business_id and client_id=new.client_id and lower(coalesce(status,'')) in ('sent','accepted','approved')) into available;
 elsif new.entity_type='invoice' then select exists(select 1 from public.invoices where id=new.entity_id and business_id=new.business_id and client_id=new.client_id and lower(coalesce(status,'')) in ('sent','partial','paid','overdue')) into available;
 else available=false;end if;
 if not available then new.status='suppressed';new.error_code='document_unavailable';new.lease_token=null;new.lease_expires_at=null;end if;
 end if;return new;
end $$;
create trigger communication_manual_document_current before update on public.communication_messages for each row execute function public.trimax_manual_document_sms_current();
-- Remove inherited execute grants, including restricted website roles.
do $$ declare a record;begin
 for a in select distinct x.grantee,p.oid::regprocedure signature from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where p.oid in ('public.trimax_queue_document_sms(uuid,text,uuid,uuid)'::regprocedure,'public.trimax_manual_document_sms_current()'::regprocedure) and x.grantee<>p.proowner loop
 execute format('revoke all on function %s from %s',a.signature,case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end);
 end loop;
end $$;
grant execute on function public.trimax_queue_document_sms(uuid,text,uuid,uuid) to authenticated;
commit;
