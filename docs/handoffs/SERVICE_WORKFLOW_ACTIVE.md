# Service request workflow — active checkpoint

## Objective and boundary
Complete October 18 request integration, isolated verification and preview. No production writes, migration installation, customer messages or production deployment authorized for this task. Preserve OCR/payments/invoices/Queue completion/Job Sessions and the live marketing portfolio.

## Workspace and release
- Candidate: `C:/Users/robbi/.codex/worktrees/service-request-workflow/trimax`, branch `codex/service-request-workflow`.
- Verified internal production: `4e3d786e12092c5ffde86d8324cd6c23ce6670cf`, Vercel `DbJBRGrnwsbdAC24egTmPahUN6LV`, `https://app.rnlcreations.com`.
- Remote rollback tag verified: `rollback/trimax-service-workflow-20261018`, same commit.
- Public marketing remains separately deployed at `c949e86ca95c8289c654344239312c55a930bc27`; preserve `rollback/rnl-marketing-20261017`.

## Verified diagnosis
Read-only production SQL on October 18: notification table exists; INSERT trigger enabled. October 18 request has exactly one stored notification for a current owner, already read. October 17 later request likewise has one read notification; earlier request has none. Previous migration deliberately omitted historical backfill. Two active push subscriptions belong to owners. Three in-app outbox events remain pending. Deployed source has no service-request push dispatcher, though Queue uses web-push/VAPID/subscriptions. Thus background push was never connected; database notification persistence works for the two later requests. Exact cause of the owner's visual observation is not established by this evidence. No physical-device acceptance yet.

## Completion report — October 18, 2026

Implementation, isolated verification and preview deployment completed. Production remains unchanged. No production migrations, customer submissions/messages, paid services, SMS registration or worker switches occurred. Installed-iPhone acceptance remains pending; the production notification defect is not declared fixed.

### Ready previews and identities

- Internal: https://trimax-9hb5ffvk2-trimax-s-projects.vercel.app/book/workflow-preview
- Vercel `trimax`, deployment `H281BunwgUTq4fWRnAewA53EKyAi`, Ready, Preview. Source `9feddfb0ac219fe79ebdd090ddaf2aab2f179ea2`; executable `006e7fc31034c0f75fc21d511359c4a4437cd900`.
- Release `trimax-service-workflow-20261018-preview`; bundle SHA-256 `1384cbf6e3ea202ba57b2a4c47797e5e75226912dca11cb0a59c205de9fe1036`.
- Public urgency form: https://rnl-public-website-4780tveir-trimax-s-projects.vercel.app/schedule
- Vercel `rnl-public-website`, deployment `EqypParfDHbQs9Yzq9iseRSwSfPM`, Ready, Preview. Source `aa76c47c4204d7ba58e3b255642e5f17adecc5c6`, branch `codex/rnl-service-urgency`, based on the approved marketing site.

Internal preview uses the real owner UI with synthetic in-memory fixtures, resets on reload, and makes no database writes or provider calls. It retains Vercel access protection. Queue/calendar links lead to authenticated routes; synthetic IDs are not persisted records. Public preview submissions are disabled. Neither preview proves production persistence or handset delivery.

Only branch-specific Preview settings were added: `SERVICE_REQUEST_PREVIEW=enabled` and `TRIMAX_RELEASE_GATE_RESULT=release/evidence/service-workflow-preview-result.json`. Production settings were not changed. The initial automatic internal build correctly failed against the older inherited receipt; the redeployment above used the matching receipt and passed. The public branch also triggered an unrelated internal-project build that failed its guard; it is not the successful internal preview above.

### Changes and status

| Area | Status | Scope and limits |
|---|---|---|
| Request/owner notification uniqueness | Verified in isolated PostgreSQL | Duplicate submissions return the same request; persistent owner alert uniqueness and workspace isolation pass. Production persistence was inspected read-only. |
| In-app notification UI | Verified in automated UI tests; physical acceptance pending | Requested date and stale-auth-response protection; preserved unread count, history, acknowledgement and request deep links. Candidate backfill restores missing persistent history without historical push/email. |
| Background push | Implemented but awaiting activation and acceptance | Reuses existing Queue VAPID/subscriptions/web-push; validates owner/workspace at delivery; stable request tag. Scheduler and device acceptance pending. |
| Approval/client/Queue | Verified in isolated SQL and hosted synthetic UI | Atomic owner RPC; email/normalized-phone match or new client, explicit ambiguous-match choice; unique request relationship and mutation replay; preserved original details. |
| Scheduling | Verified in isolated SQL and hosted synthetic UI | Existing Queue/calendar, actual date/time/duration, timezone/DST validation, conflict checks, explicit Approve & Schedule, reschedule/cancel audit. Approval alone remains unbooked. |
| Public urgency | Verified in preview | Four neutral labels, Routine default, no immediate-service guarantee; candidate migration supports time_sensitive. Not live. |
| Customer email | Implemented but awaiting configuration/acceptance | Six templates using existing Resend; leases, retries, idempotency and attempt audit. No messages sent. |
| SMS | Research/plan complete; sending not implemented | No purchase, port, campaign, credentials or activation. |
| Provider delivery/bounce webhooks | Not implemented | UI labels Provider accepted, not delivered to a handset/inbox. |
| Production and installed iPhone | Awaiting authorization/acceptance | Three candidate migrations remain uninstalled. |

Conversion retains contact details, address, description, preferred contact, urgency and requested date in the linked request/Queue notes. Existing client details are not overwritten. Cancellation keeps unfinished Queue work open. Timed calendar exports were added while date-only behavior remains. Legacy date-only edits clear contradictory timestamps with an audit event; they do not send appointment email. Existing Queue completion, invoices/payments, Job Sessions, OCR authority and floating controls were preserved.

The in-app path uses persistent records, 30-second polling and focus/visibility refresh independently of provider delivery; no realtime subscription claim is made. Channels have separate claims/failure handling. Resend uses persisted idempotency keys. A crash after push acceptance can still retry; a stable tag reduces duplicate display but does not guarantee exactly-once OS delivery. Templates exclude internal notes and unrelated customer information.

### Test evidence

- Full gate: **READY_FOR_CONTROLLED_DEPLOYMENT**, **CODE_GATE_PASSED**, **RETAINED_REAL_GATE_PASSED**, **PHYSICAL_ACCEPTANCE_PENDING**.
- Receipt: `release/evidence/service-workflow-preview-result.json`; full private run `%LOCALAPPDATA%/Trimax/release-gates/2026-10-19T00-22-29-746Z`.
- 101 checks PASS; one expected production-runtime DEPLOYMENT_PREREQUISITE records the prior serving release. This is not final production postdeployment PASS.
- Eight retained OCR cases passed both existing pipelines. Queue, Job Sessions, invoices, payments, authorization/workspace isolation, lint, TypeScript, production build and clean source seals passed.
- New isolated PostgreSQL suite: 60 checks including repeated request/conversion, existing/new/foreign client, approval without booking, conflict rejection, reschedule/cancel audit, owner isolation, leases/retry/dead-letter and email privacy.
- Public website build and 78 boundary/routing/security/SEO checks passed; preview no-write checks passed.
- Hosted synthetic UI: approve-only, conversion, scheduling, rescheduling, cancellation, combined approval/scheduling, decline and activity history passed. Desktop and 390x844 mobile inspected with no horizontal overflow. Fixtures are not database acceptance.
- Local production build running with Preview environment: workflow POST403, review PATCH403, unauthenticated delivery GET401. External probes were intercepted by Vercel authentication; they are not claimed as hosted application-route acceptance.
- Live marketing homepage, `/gallery`, `/schedule`, and Trimax homepage returned HTTP200; no requests created.
- Earlier gate failed due to SQL test-runtime resolution and stale generated route types. Supplied runtime resolution, moved stale generated files outside the checkout, then reran the whole gate without weakening assertions.

Screenshots outside Git: `C:/Users/robbi/.codex/worktrees/service-request-workflow/preview-deployment.png`, `workflow-desktop-preview.png`, `workflow-mobile-preview.png`; public `C:/Users/robbi/.codex/worktrees/rnl-service-urgency/urgency-preview.png`.

### Remaining activation requirements

1. Explicit production authorization, reviewed migration catalog projection and coordinated web/worker release. The candidate retains current production catalog fingerprints intentionally; do not simply promote this synthetic preview after installing migrations.
2. Supported recurring scheduler for `/api/public-scheduling/deliver`. Vercel Hobby is daily-only. Use an approved existing external scheduler or owner-approved plan change. Persistent alerts and client/Queue/calendar work do not depend on this scheduler.
3. Verify the R&L sender/domain, configure `SERVICE_REQUEST_EMAIL_FROM` and `SERVICE_REQUEST_EMAIL_BUSINESS_ID`, and explicitly activate delivery/email flags. Existing credential names were observed without revealing values; sender verification/live sending were not tested.
4. Physical iPhone foreground/background acceptance and an approved test recipient. SMS is independently inactive.

SMS recommendation: evaluate Telnyx hosted messaging for an eligible existing number while keeping voice service; otherwise consider a separately approved Twilio number. Plivo's current US onboarding minimum is unsuitable for low volume. Verified pricing, registration, consent/STOP, reminder invalidation, webhooks and two-way plan: [Delivery and SMS report](SERVICE_WORKFLOW_DELIVERY_AND_SMS.md). Number eligibility remains unverified.

### One physical-device acceptance procedure

After a separately approved coordinated rollout, sign into the installed iPhone PWA as the correct workspace owner and confirm notification permission. Submit one explicitly authorized synthetic request with a unique reference and owner-controlled contact details. Verify exactly one request/owner alert, unread update within the refresh interval, correct deep link, and acknowledgement surviving restart. Separately background/lock the phone and verify OS push and its deep link; an in-app alert does not substitute for this test.

Approve without scheduling and confirm no appointment. Convert twice and confirm one matched/new client and one Queue item with preserved details. Schedule a future slot, open the existing calendar/Queue item, reschedule and cancel; check audit history and retained unfinished work. Test email states only with the approved recipient; missing SMS must not block the workflow. Record release/deployment, reference, timestamps, iOS version and actual pass/fail observations. Do not mark physical acceptance passed from this preview.

### Exact continuation

Review the previews and resolve production authorization/configuration. Prepare reviewed migration catalog projection and coordinated release contract against current production, rerun required gates for that final candidate, perform only the authorized rollout, and execute physical acceptance. Do not repeat completed provider research or treat fixture success as production acceptance.

## Recovery
Before a later authorized release, retain the exact Vercel production deployment above. Web recovery: promote that retained deployment in the Trimax project (not the marketing project). No database migration has been installed by this task, so no database rollback is currently necessary.

Exact web recovery after any later authorized rollout: Vercel team `trimax-s-projects` → project `trimax` → deployment `DbJBRGrnwsbdAC24egTmPahUN6LV` → its production promotion/rollback action. Verify `app.rnlcreations.com` serves that deployment and commit `4e3d786e12092c5ffde86d8324cd6c23ce6670cf`. Retained immutable URL: https://trimax-rgkyie9u5-trimax-s-projects.vercel.app. Disable newly activated dispatcher flags/scheduler before recovery, and restore the coordinated worker contract if switched. A web rollback cannot undo database writes or sent messages; use reviewed data-preserving recovery, not deletion of clients, Queue items or audit history.

Remote tags reverified: internal `rollback/trimax-service-workflow-20261018` → `4e3d786e12092c5ffde86d8324cd6c23ce6670cf`; public `rollback/rnl-marketing-20261017` → `34fa3b47f16890a9de09b253848ecf8a690f4e9b`. Public production remains deployment `8vAGJgTusxopqctycxSxVk7AueXZ`. No production recovery is needed for this preview-only task. Rollback tags are source checkpoints, not database backups.
