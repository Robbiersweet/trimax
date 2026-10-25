begin;
create table public.request_email_links(token_hash text primary key check(token_hash~'^[a-f0-9]{64}$'),business_id uuid not null references public.businesses(id),outbox_id uuid not null references public.public_scheduling_outbox(id),recipient text not null,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
alter table public.request_email_links enable row level security;
revoke all on public.request_email_links from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake;
grant all on public.request_email_links to service_role;
create function public.trimax_request_email_reply(p_hash text,p_key text,p_body text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare l public.request_email_links;o public.public_scheduling_outbox;r public.public_service_requests;reply_id uuid;slug text;
begin
 if p_hash is null or p_key is null or p_hash!~'^[a-f0-9]{64}$' or p_key!~'^[a-f0-9]{64}$' or p_body is null or length(trim(p_body)) not between 1 and 1600 then raise exception 'Invalid reply';end if;
 select * into l from public.request_email_links where token_hash=p_hash and expires_at>now() and revoked_at is null for update;if not found then raise exception 'Unavailable link';end if;
 select * into o from public.public_scheduling_outbox where id=l.outbox_id and business_id=l.business_id and channel='email' and audience='customer' and event_type='needs_information' and lower(recipient)=lower(l.recipient);if not found then raise exception 'Unavailable link';end if;
 select * into r from public.public_service_requests where id=o.request_id and business_id=l.business_id and lower(email)=lower(l.recipient) and contact_consent_at is not null and status='needs_information' for update;if not found then raise exception 'Unavailable request';end if;
 select id into reply_id from public.public_request_activity where business_id=r.business_id and request_id=r.id and event_type='customer_email_reply' and details->>'idempotencyKey'=p_hash||':'||p_key;if found then return reply_id;end if;
 if (select count(*) from public.public_request_activity where business_id=r.business_id and request_id=r.id and event_type='customer_email_reply' and created_at>now()-interval '1 hour')>=5 then raise exception 'Reply limit';end if;
 insert into public.public_request_activity(business_id,request_id,event_type,details) values(r.business_id,r.id,'customer_email_reply',jsonb_build_object('note',trim(p_body),'idempotencyKey',p_hash||':'||p_key)) returning id into reply_id;
 select public_slug into slug from public.public_scheduling_settings where business_id=r.business_id;
 insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,idempotency_key)
 select r.business_id,r.id,'request_customer_reply','push','internal',p.id::text,'service-request',jsonb_build_object('customer',r.customer_name,'category','Customer replied','requestedDate','Review reply','slug',slug),'email-reply-alert:'||reply_id||':'||p.id from public.push_subscriptions p where p.business_id=r.business_id and p.status='active' and exists(select 1 from public.business_users u where u.business_id=r.business_id and u.user_id=p.user_id and u.role in ('owner','admin')) on conflict do nothing;
 return reply_id;
end $$;
revoke all on function public.trimax_request_email_reply(text,text,text) from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake;
grant execute on function public.trimax_request_email_reply(text,text,text) to service_role;
create function public.trimax_enqueue_information_email() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r public.public_service_requests;s public.public_scheduling_settings;
begin
 if new.event_type<>'review_updated' or new.details->>'toStatus' is distinct from 'needs_information' or new.details->>'fromStatus'='needs_information' then return new;end if;
 select * into r from public.public_service_requests where id=new.request_id and business_id=new.business_id and status='needs_information' and email<>'' and contact_consent_at is not null;if not found then return new;end if;
 select * into s from public.public_scheduling_settings where business_id=r.business_id;
 insert into public.public_scheduling_outbox(business_id,request_id,event_type,channel,audience,recipient,template,parameters,consent_reference,idempotency_key) values(r.business_id,r.id,'needs_information','email','customer',r.email,'needs_information',jsonb_build_object('business',s.display_name,'reference',r.public_reference),'request:'||r.id||':'||r.contact_consent_at,'information-email:'||new.id) on conflict do nothing;return new;
end $$;
revoke all on function public.trimax_enqueue_information_email() from public,anon,authenticated,trimax_scheduling_web,trimax_scheduling_intake,service_role;
create trigger request_information_email after insert on public.public_request_activity for each row execute function public.trimax_enqueue_information_email();
commit;
