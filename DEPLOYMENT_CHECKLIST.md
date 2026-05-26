# Trimax Deployment Checklist

Use this checklist before the first Vercel deployment and before major production updates.

## Local Checks

```bash
npm run check
```

This runs lint and the production build.

## Supabase

- Confirm Supabase Auth works for Robbie and Lyubov.
- Confirm `business_users` has the correct business memberships.
- Confirm `business_id` exists and is populated on business-owned records.
- Run needed SQL from `supabase/sql` in order.
- Confirm `property_users`, `activity_logs`, and invoice `updated_at` setup scripts have run successfully.
- Keep development RLS only while testing with trusted users.
- Tighten production RLS before selling Trimax as SaaS.

## Vercel Environment Variables

Required now:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Copy `NEXT_PUBLIC_SUPABASE_URL` from Supabase Project Settings -> API -> Project URL.
Copy `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase Project Settings -> API -> anon public key.
Add both in Vercel for Production, Preview, and Development.

Future Outlook draft integration:

```text
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_TENANT_ID
MICROSOFT_REDIRECT_URI
OUTLOOK_TOKEN_ENCRYPTION_KEY
```

Only use `NEXT_PUBLIC_` for values that are safe in the browser. Microsoft secrets and encryption keys must stay server-only.

## Manual Smoke Test

Test both workspaces:

```text
/?business=rnl-creations
/?business=just-kleen
```

For R&L:

- Login as Robbie.
- Open Dashboard, Queue, Estimates, Invoices, Payments, Reports, Activity, Settings.
- Create a test queue item.
- Convert queue item to estimate if needed.
- Create or open an invoice.
- Print invoice page.
- Confirm Activity shows new actions.

For Just Kleen:

- Login as Lyubov.
- Open Dashboard, Clients, Services, Estimates, Invoices, Settings.
- Create a test invoice.
- Confirm Just Kleen wording and special 5 Star / BOA workflow still appears when appropriate.

## Do Not Break

- Preserve `?business=rnl-creations`.
- Preserve `?business=just-kleen`.
- Preserve `business_id` filtering.
- Preserve queue bypass for normal estimates and invoices.
- Preserve split invoice workflow for apartment paint work.
- Preserve Just Kleen special invoice print/export.

## Known Production Hardening

- Replace development-friendly RLS with role/property-aware policies.
- Encrypt Outlook tokens before enabling live Microsoft draft creation.
- Add production logging/monitoring.
- Decide on attachment/photo storage rules.
- Add stronger property-manager portal boundaries for property managers, assistant managers, maintenance managers, and similar users.
