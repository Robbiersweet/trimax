# Trimax Operations Platform

Trimax is a Next.js operations platform for R&L Creations, Just Kleen, and future workspace-based service businesses.

It currently supports:

- Supabase Auth login
- Multi-business workspaces with `business_users`
- R&L Creations apartment turn queue workflow
- Just Kleen workspace support
- Clients, services, estimates, invoices, payments, reports, and activity logs
- Split invoice workflow for apartment paint work
- Print-ready estimate and invoice pages
- 5 Star / Bank of America style invoice export for Just Kleen
- Early Outlook draft workflow foundation

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example`, then add the Supabase values.

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/?business=rnl-creations
http://localhost:3000/?business=just-kleen
```

## Required Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Future Outlook integration will also need Microsoft/Azure values. Keep those server-only in Vercel, not exposed with `NEXT_PUBLIC_`.

## Pre-Deployment Checks

Run these before pushing to GitHub or deploying to Vercel:

```bash
npm run check
```

This runs lint and the production build. Both should pass before deployment.

## Supabase SQL

Database setup scripts live in:

```text
supabase/sql
```

Run them from the Supabase SQL editor when a feature needs new tables or policies. Development RLS is intentionally friendly right now; production RLS tightening is still a required deployment-hardening task.

## Current Deployment Notes

- Keep `?business=rnl-creations` and `?business=just-kleen` routing intact.
- Keep all data queries scoped by `business_id`.
- Do not remove queue bypass behavior for normal estimates/invoices.
- Do not expose company financials to future property-manager portal users.
- Outlook draft creation should create drafts for review first, not auto-send.
- Calendar buttons download `.ics` files for Outlook, Apple Calendar, Google Calendar, and phone calendars.

## Vercel

For the beginner-friendly walkthrough, use `FIRST_DEPLOYMENT_GUIDE.md`.

Deploy from GitHub to Vercel after:

1. Supabase SQL is current.
2. Supabase Auth users/workspace memberships are current.
3. Vercel environment variables are set.
4. `npm run check` passes.
