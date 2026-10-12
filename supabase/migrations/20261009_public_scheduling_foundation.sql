-- LOCAL REVIEW ONLY. Not applied to any database. No production business rows seeded.
begin;
create table public.public_scheduling_settings (
 business_id uuid primary key references public.businesses(id),
 public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 display_name text not null check(length(display_name) between 1 and 120),
 description text not null default '', logo_reference text, public_phone text, public_email text,
 enabled boolean not null default false,
 mode text not null default 'request-only' check(mode in ('request-only','immediately-bookable')),
 owner_approval_required boolean not null default true,
 time_zone text not null default 'America/Los_Angeles',
 business_hours jsonb not null default '{}', available_weekdays integer[] not null default '{1,2,3,4,5}',
 blocked_dates date[] not null default '{}', minimum_lead_hours integer not null default 24 check(minimum_lead_hours>=0),
 maximum_horizon_days integer not null default 90 check(maximum_horizon_days between 1 and 365),
 appointment_windows jsonb not null default '[]', updated_at timestamptz not null default now()
);
create table public.public_service_request_types (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.public_scheduling_settings(business_id),
 public_key text not null, public_label text not null,internal_label text not null,description text not null default '',
 active boolean not null default true,display_order integer not null default 0,
 estimated_duration_minutes integer check(estimated_duration_minutes>0),scheduling_eligible boolean not null default false,
 unique(business_id,public_key),unique(business_id,id)
);
create table public.public_service_requests (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.public_scheduling_settings(business_id),
 request_type_id uuid not null,public_reference text not null unique,
 idempotency_hash text not null,payload_hash text not null,
 customer_name text not null check(length(customer_name) between 1 and 120),phone text not null default '',email text not null default '',
 preferred_contact text not null check(preferred_contact in ('phone','email','sms')),
 service_address text not null check(length(service_address) between 1 and 500),description text not null check(length(description) between 1 and 3000),
 preferred_date date,time_window_id text,flexibility text not null check(flexibility in ('flexible','preferred','fixed')),
 urgency text not null check(urgency in ('routine','soon','urgent')),
 customer_notes text not null default '' check(length(customer_notes)<=2000),internal_notes text not null default '',
 contact_consent_at timestamptz not null,status text not null default 'pending_confirmation' check(status in ('pending_confirmation','needs_information','approved','rejected','cancelled','converted')),
 confirmation_status text not null default 'unconfirmed',notification_status text not null default 'not_configured',
 submitted_at timestamptz not null default now(),source text not null default 'public-web',
 -- Relationship IDs deliberately omitted until reviewed, tenant-safe conversion RPC exists.
 integration_references jsonb not null default '{}',
 foreign key(business_id,request_type_id) references public.public_service_request_types(business_id,id),
 unique(business_id,idempotency_hash),unique(business_id,id)
);
create table public.public_request_activity (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,request_id uuid not null,
 event_type text not null,actor_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now(),
 foreign key(business_id,request_id) references public.public_service_requests(business_id,id)
);
create index public_service_requests_intake on public.public_service_requests(business_id,status,submitted_at desc);
create index public_request_activity_history on public.public_request_activity(business_id,request_id,created_at);
alter table public.public_scheduling_settings enable row level security;
alter table public.public_service_request_types enable row level security;
alter table public.public_service_requests enable row level security;
alter table public.public_request_activity enable row level security;
revoke all on public.public_scheduling_settings,public.public_service_request_types,public.public_service_requests,public.public_request_activity from anon,authenticated;
grant select on public.public_scheduling_settings,public.public_service_request_types,public.public_service_requests,public.public_request_activity to authenticated;
-- No anonymous SELECT or INSERT policy. A future narrow server/RPC adapter must
-- resolve the public slug, enforce abuse controls and insert atomically. Not wired here.
create policy scheduling_owner_read on public.public_scheduling_settings for select to authenticated using(exists(select 1 from public.business_users m where m.business_id=public_scheduling_settings.business_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
create policy scheduling_types_owner_read on public.public_service_request_types for select to authenticated using(exists(select 1 from public.business_users m where m.business_id=public_service_request_types.business_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
create policy scheduling_requests_owner_read on public.public_service_requests for select to authenticated using(exists(select 1 from public.business_users m where m.business_id=public_service_requests.business_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
create policy scheduling_activity_owner_read on public.public_request_activity for select to authenticated using(exists(select 1 from public.business_users m where m.business_id=public_request_activity.business_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
commit;
