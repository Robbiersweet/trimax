-- Candidate only. Apply after 20261025_property_request_intake.sql.
begin;
create function public.trimax_set_property_request_access(p_assignment_id uuid,p_client_id uuid,p_direct boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare a public.property_users;
begin
 select * into a from public.property_users where id=p_assignment_id for update;
 if not found or auth.uid() is null or not exists(select 1 from public.business_users where business_id=a.business_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Not authorized';end if;
 if p_direct is null or (p_direct and p_client_id is null) then raise exception 'Direct Queue access requires a mapped client';end if;
 if p_client_id is not null and not exists(select 1 from public.clients where id=p_client_id and business_id=a.business_id) then raise exception 'Client must belong to the same workspace';end if;
 update public.property_users set request_client_id=p_client_id,can_create_queue_items=p_direct where id=a.id and business_id=a.business_id;
end $$;
revoke all on function public.trimax_set_property_request_access(uuid,uuid,boolean) from public,anon,service_role;
grant execute on function public.trimax_set_property_request_access(uuid,uuid,boolean) to authenticated;
commit;
