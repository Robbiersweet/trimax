# In-app scheduling notifications — implementation and approval package

## Checkpoint (2026-10-17, America/Los_Angeles)

Candidate: codex/scheduling-in-app-notifications, worktree C:/Users/robbi/.codex/worktrees/trimax-scheduling-notifications. Executable commit c5ab977 (full identity and file hashes in SCHEDULING_NOTIFICATIONS_PACKAGE.json). Based on deployed internal Trimax seal 9f4c172. Production unchanged; public scheduling stays LIVE. No new customer request, notification delivery, credential operation or hosted SQL was performed.

## Implemented

One new table scheduling_owner_notifications, unique(request_id,recipient_id), one index, two RLS policies, one narrowly bound insert trigger/function. Each successful new request atomically creates one minimal notification for each current owner/admin with a registered user ID in that business. No historical backfill. Retries returning an existing request cannot fire another INSERT trigger. Transaction rollback removes both request and notification. The function is SECURITY DEFINER owned by postgres, intentionally privileged to insert recipient records; FORCE RLS is NOT claimed to constrain postgres. Its EXECUTE is revoked from PUBLIC and all runtime roles, its search_path is pg_catalog, all data references are schema qualified, and trigger table/operation plus NEW business/request/type constrain its writes. No dynamic SQL, signing material, service-role runtime use or changes to the two existing intake RPCs.

Recipient authorization requires auth.uid plus current owner/admin membership on every SELECT/UPDATE. Authenticated users can SELECT authorized rows and UPDATE only read_at. Cannot insert/delete/change recipient/payload. An owner cannot mark another owner's alert read. Removed membership loses access. Anonymous, intake and service-role direct grants are denied. Fail-closed migration assertions reject unexpected creator ACLs instead of changing global defaults.

Navigation now includes a notification center, exact unread count, 50-item history pages, mark-read controls, and minimal name/type/time display. Visible tabs poll every30seconds and refresh on focus. Read state is in PostgreSQL across devices/sessions. Logout/auth changes clear cached notifications and invalidate pending loads. Workspace component remounts prevent old-workspace display. Errors are sanitized and direct operators to Service Requests.

Notification links open the exact request automatically. Owner intake lookup includes an explicitly requested authorized record beyond the normal200-row inbox, without broadening RLS. Existing manual review, private notes/history and no-conversion behavior preserved. No email/SMS/push, auto appointment, Queue/job/invoice/payment creation or new dependency.

## Actual validation

- Local PGlite SQL acceptance: PASS23 checks, real trigger/RLS/grants/rollback logic, two owners, manager/cross-workspace denial, per-owner durable read state, repeat insert, rollback, revoked membership, forbidden writes and unexpected default ACL rollback. Local synthetic fixtures only, not hosted acceptance.
- React component execution: PASS unread/display, deep link, mark read/remount, poll arrival, logout, manager denial and sanitized storage outage. Synthetic adapters; not a production browser acceptance claim.
- Existing public scheduling suite: all7 scripts PASS.
- Owner-server-auth and cross-tab session-isolation regressions PASS.
- TypeScript noEmit PASS; focused ESLint PASS; git diff check PASS.
- Next production build compiled and generated48pages PASS using synthetic build-only Supabase environment. Initial missing-build-env failure preserved in task trace and corrected without accessing credentials. No deployment receipt was fabricated; full protected release/seal still requires reviewed database fingerprint and production prerequisites.

## Exact approval requested

Approve the hash-bound candidate migration and coordinated protected internal Trimax release, conditional on fresh production preflight/owner memberships and all required release gates, then exactly ONE clearly synthetic public scheduling submission with no external communications or business conversions to verify notification/inbox persistence, unread badge, direct navigation and read-state across reload/session. Preserve the audit record. Existing public marketing deployment needs no source change. Do not disable live scheduling merely to test UI.

Migration: supabase/migrations/20261017_scheduling_owner_notifications.sql (SHA256 in manifest). One transaction; unexpected grants abort. Before execution verify actual project, existing table/role/function baseline, at least one registered owner/admin for live R&L, and that proposed names are absent. Stop on differences; no expanded privileges. Reconcile new table/policy/trigger/function hashes through existing coordinated rc11 release process so OCR workers do not encounter unapproved fingerprint drift. Keep all pre-existing function definitions/ACLs and business checksums unchanged. Do not edit live manifests or bypass checks. This source candidate is NOT yet sealed for production and is not itself permission to deploy.

## Rollout and rollback

1. Preflight plus reviewed coordinated release contract, clean source and applicable code/retained/runtime gates; no stale receipt reuse.
2. Install exact migration in approved maintenance sequence; audit effective privileges, policies and trigger. Atomic failure rolls back. Notification insert failure also rolls back a customer request: this is a deliberate consistency boundary and must be tested/monitored.
3. Deploy internal Trimax through protected process; verify OCR runtime/health, owner navigation and public scheduling remain healthy. No public-site rebuild, credentials or DNS changes required.
4. Authorized single synthetic acceptance: real public form providers, request once, alert once per recipient, proper workspace/user denials, exact link, mark read and refresh, protected business checksums unchanged. Do not send customer messages. Existing historical request is not backfilled.
5. On failure stop acceptance; rollback trigger using supplied reviewed rollback SQL, preserve notification/request audit rows, restore prior internal web through the release process and reconcile fingerprints. Never weaken startup gates. If trigger blocks live submissions, disable just the trigger under the approved rollback scope; no data deletion.

Recurring added service cost: none; polling uses existing Supabase request/database capacity. No paid dependency. Current recipient membership controls visibility; alerts are not reassigned to future owners. No external owner delivery promised.

Next mandatory action: approve this bounded migration/coordinated release/one-request acceptance package. Resume from this worktree and manifest; do not repeat unchanged passing development tests or touch the public scheduling deployment.
