insert into business_users (
  business_id,
  user_id,
  email,
  role
)
select
  businesses.id,
  users.id,
  users.email,
  'owner'
from auth.users as users
cross join businesses
where lower(users.email) = lower('robbie@rnlcreations.com')
  and businesses.slug = 'rnl-creations'
on conflict (business_id, user_id)
do update set
  email = excluded.email,
  role = excluded.role,
  updated_at = now();

insert into business_users (
  business_id,
  user_id,
  email,
  role
)
select
  businesses.id,
  users.id,
  users.email,
  'owner'
from auth.users as users
cross join businesses
where lower(users.email) = lower('lyuba@justkleen.com')
  and businesses.slug = 'just-kleen'
on conflict (business_id, user_id)
do update set
  email = excluded.email,
  role = excluded.role,
  updated_at = now();

