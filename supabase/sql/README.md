# Trimax Supabase SQL

Run these scripts in the Supabase SQL editor when the app needs the matching database structure.

The current scripts are development-friendly. Before a public SaaS launch, tighten RLS so users can only read/write rows for workspaces and properties they are allowed to access.

Supabase may warn that a setup query includes destructive operations. For these Trimax scripts, that warning is expected when a script recreates policies or triggers with `drop policy if exists` or `drop trigger if exists`. Those statements replace database rules; they do not delete business records.

Do not run SQL that includes `drop table`, `delete from`, or `truncate` unless you are intentionally removing data.

## Recommended Order

1. `2026-05-24-business-users.sql`
2. `2026-05-24-seed-business-users.sql`
3. `2026-05-25-allow-pending-business-invites.sql`
4. `2026-05-26-property-users.sql`
5. `2026-05-26-activity-logs.sql`
6. `2026-05-26-invoice-updated-at.sql`
7. `2026-05-26-outlook-draft-workflow.sql`
8. `2026-05-26-queue-renovation-fields.sql`
9. `2026-06-15-performance-indexes.sql`

## Workspace Access

After `business_users` exists:

1. Create Auth users for Robbie and Lyubov in Supabase Authentication.
2. Open `2026-05-24-seed-business-users.sql`.
3. Keep Robbie's email as `robbie@rnlcreations.com` if that is the login email.
4. Replace Lyubov's placeholder email with her real login email.
5. Run the seed script.

After this, Robbie lands in the R&L workspace and Lyubov lands in the Just Kleen workspace.

## Property Portal Access

Run `2026-05-26-property-users.sql` before inviting property managers, assistant managers, maintenance managers, or future property staff. Property users should be scoped to their property and should not see company-wide invoices, financials, or unrelated clients.

## Activity Logs

Run `2026-05-26-activity-logs.sql` before relying on the Activity page. Activity logging starts prospectively; old actions are not backfilled.

## Queue Renovation Fields

Run `2026-05-26-queue-renovation-fields.sql` before using prior renovation memory or current renovation notes on queue items. This keeps apartment history available for estimates and property-level reports.

## Invoice Updated Dates

Run `2026-05-26-invoice-updated-at.sql` so invoice lists, payment screens, and dashboard recent-invoice views can sort by the latest invoice changes.

## Performance Indexes

Run `2026-06-15-performance-indexes.sql` after the core tables exist. It adds safe, repeatable indexes for the dashboard, invoices, payments, queue, reports, and client pages so workspace-scoped lists stay fast as Trimax grows.

## Outlook Draft Workflow

Run `2026-05-26-outlook-draft-workflow.sql` before storing email templates, Outlook connection records, or document send history.

Outlook is planned as a draft-first workflow:

1. Trimax prepares the PDF, recipient, subject, and message.
2. Microsoft Graph creates an Outlook draft.
3. The user reviews and sends from Outlook.

Do not store raw Microsoft access or refresh tokens in production without encryption.
