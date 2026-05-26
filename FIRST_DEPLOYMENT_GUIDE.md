# Trimax First Deployment Guide

This guide is for the first time Trimax goes from your computer to the internet with GitHub, Vercel, and Supabase.

## What Deployment Means

Right now Trimax runs on your computer at:

```text
http://localhost:3000
```

Deployment means Vercel will run the app online from your GitHub code. Supabase will still hold the database, login users, and business data.

## Step 1: Confirm The App Works Locally

In VS Code Terminal:

```bash
npm run check
```

You want both lint and build to pass.

## Step 2: Confirm Supabase Is Ready

In Supabase:

1. Open the Trimax project.
2. Open SQL Editor.
3. Run any missing SQL from `supabase/sql`.
4. Confirm Authentication has users for Robbie and Lyubov.
5. Confirm `business_users` gives Robbie R&L access and Lyubov Just Kleen access.

Use this order for current SQL:

```text
2026-05-24-business-users.sql
2026-05-24-seed-business-users.sql
2026-05-25-allow-pending-business-invites.sql
2026-05-26-property-users.sql
2026-05-26-activity-logs.sql
2026-05-26-invoice-updated-at.sql
2026-05-26-outlook-draft-workflow.sql
```

If a script has already been run successfully, do not worry. Most current scripts are written to be safe to re-run, but ask Codex before re-running anything that looks destructive.

## Step 3: Push To GitHub

In VS Code Source Control or Terminal:

```bash
git status
git push
```

If GitHub says there is no remote repository yet, create the GitHub repository first, then connect this folder to it.

## Step 4: Create The Vercel Project

In Vercel:

1. Choose New Project.
2. Import the Trimax GitHub repository.
3. Framework should be Next.js.
4. Build command should be:

```text
npm run build
```

5. Install command should be:

```text
npm install
```

## Step 5: Add Vercel Environment Variables

In Vercel Project Settings, add:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Copy these from Supabase Project Settings.

Future Outlook draft integration will also use:

```text
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_TENANT_ID
MICROSOFT_REDIRECT_URI
OUTLOOK_TOKEN_ENCRYPTION_KEY
```

Do not add Microsoft secrets until we are wiring the real Microsoft sign-in.

## Step 6: Deploy

Click Deploy in Vercel.

If Vercel fails, copy the error text and ask Codex. Most first deployment errors are missing environment variables or a database table that has not been created yet.

## Step 7: Smoke Test The Live Site

Open the Vercel URL.

Test:

```text
/?business=rnl-creations
/?business=just-kleen
```

For R&L:

1. Login as Robbie.
2. Open Dashboard.
3. Open Queue.
4. Open Estimates.
5. Open Invoices.
6. Open Reports.
7. Open Settings.

For Just Kleen:

1. Login as Lyubov.
2. Open Dashboard.
3. Open Clients.
4. Open Invoices.
5. Open Services.
6. Open Settings.

## Step 8: Do Not Share Broadly Yet

The app is close, but before this becomes public SaaS, Trimax still needs:

- Production RLS tightening
- Role/property security review
- Outlook token encryption before live Microsoft integration
- Final mobile pass
- A production data backup plan

It is okay to deploy for controlled internal use first.
