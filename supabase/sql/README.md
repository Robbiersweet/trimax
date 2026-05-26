# Trimax Supabase SQL

Run these scripts in the Supabase SQL editor when the app needs the matching database structure.

The current scripts are development-friendly. Before a public SaaS launch, tighten RLS so users can only read/write rows for workspaces and properties they are allowed to access.

## Recommended Order

1. `2026-05-24-business-users.sql`
2. `2026-05-24-seed-business-users.sql`
3. `2026-05-25-allow-pending-business-invites.sql`
4. `2026-05-26-property-users.sql`
5. `2026-05-26-activity-logs.sql`
6. `2026-05-26-invoice-updated-at.sql`
7. `2026-05-26-outlook-draft-workflow.sql`

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

## Invoice Updated Dates

Run `2026-05-26-invoice-updated-at.sql` so invoice lists, payment screens, and dashboard recent-invoice views can sort by the latest invoice changes.

## Outlook Draft Workflow

Run `2026-05-26-outlook-draft-workflow.sql` before storing email templates, Outlook connection records, or document send history.

Outlook is planned as a draft-first workflow:

1. Trimax prepares the PDF, recipient, subject, and message.
2. Microsoft Graph creates an Outlook draft.
3. The user reviews and sends from Outlook.

Do not store raw Microsoft access or refresh tokens in production without encryption.
