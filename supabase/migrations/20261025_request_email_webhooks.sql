begin;
alter table public.public_scheduling_outbox add column email_delivery_status text,add column email_delivery_updated_at timestamptz;
create table public.request_email_webhook_receipts(event_id text primary key,business_id uuid not null references public.businesses(id),created_at timestamptz not null default now());
create table public.request_email_suppressions(business_id uuid not null references public.businesses(id),recipient text not null,reason text not null,created_at timestamptz not null default now(),primary key(business_id,recipient));
alter table public.request_email_webhook_receipts enable row level security;alter table public.request_email_suppressions enable row level security;
revoke all on public.request_email_webhook_receipts,public.request_email_suppressions from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake;
grant all on public.request_email_webhook_receipts,public.request_email_suppressions to service_role;
create function public.trimax_request_email_status(p_business uuid,p_event text,p_provider text,p_recipient text,p_status text) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare o public.public_scheduling_outbox;
begin
 if p_event is null or length(p_event) not between 1 and 200 or p_status is null or p_status not in ('email.delivered','email.bounced','email.complained','email.failed') then raise exception 'Invalid event';end if;
 select * into o from public.public_scheduling_outbox where business_id=p_business and channel='email' and provider_message_id=p_provider and lower(recipient)=lower(p_recipient) for update;if not found then raise exception 'Delivery not matched';end if;
 insert into public.request_email_webhook_receipts(event_id,business_id) values(p_event,p_business) on conflict do nothing;if not found then return false;end if;
 if o.email_delivery_status in ('email.bounced','email.complained','email.failed') and p_status='email.delivered' then return true;end if;
 update public.public_scheduling_outbox set email_delivery_status=p_status,email_delivery_updated_at=now(),last_error_code=case when p_status='email.delivered' then last_error_code else p_status end,delivery_history=delivery_history||jsonb_build_array(jsonb_build_object('at',now(),'providerEvent',p_status)) where id=o.id;
 if p_status in ('email.bounced','email.complained') then
 insert into public.request_email_suppressions(business_id,recipient,reason) values(p_business,lower(o.recipient),p_status) on conflict(business_id,recipient) do update set reason=excluded.reason;
 end if;return true;
end $$;
revoke all on function public.trimax_request_email_status(uuid,text,text,text,text) from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake;
grant execute on function public.trimax_request_email_status(uuid,text,text,text,text) to service_role;
commit;
