# Service workflow — production checkpoint, 2026-10-19

## Status
User explicitly approved the coordinated rollout. Three migrations, existing-secret provisioning, both production deployments, matching OCR workers, and push scheduler activation completed. Real live-form acceptance passed request intake, persistent notification/deep link/read state, new client and single Queue conversion, same-day appointment, reschedule, calendar export and cancellation. Physical iPhone acceptance and verified customer email delivery remain pending. SMS and customer email remain disabled. Do not repeat authentication or rotate credentials.

## Exact live identities
- Trimax https://app.rnlcreations.com — deployment BKhemYyB4BsrwbwnEku75okVKhxV, commit 6782f0f5e2b8cb3db8b6554e42232d79fa34dc03. Executable c0445bfc68d6d12e2a6a9748297a10f014794ce6, release trimax-service-workflow-20261019-rc3. Ready/current alias verified through authenticated Vercel dashboard.
- Website https://rnlcreations.com — deployment 7nhM28FWzouDAL8HwXyom7fX7VbB, commit 7e0ca069a5cbbb2c38aa05e8705113a5cc769e18. Production submission restriction absent. Homepage, gallery filters, photo viewer, navigation and submission verified.
- Matching legacy and shadow workers run from this checkout. Both completed retained no-payment health jobs with rc3 attestation; no payments applied. Full postdeployment gate: 103 PASS, all eight OCR cases passed both engines; lint, typecheck, build and source seal passed.

## Database and credential
Applied in order: 20261018_service_request_workflow.sql, 20261018_service_request_delivery.sql, 20261018_request_urgency.sql. All five public catalog fingerprints match the rehearsed release.
Existing May 30 CRON_SECRET transferred server-to-server into Vault trimax_service_request_cron_secret. No value revealed, rotated or overwritten. Temporary provisioning helper removed. TRIMAX_PROVISION_REQUEST_SCHEDULER is disabled for future builds; build hook is inactive unless explicitly approved-once. October 9 preview override does not affect production.

## Acceptance failure and data-preserving repair
First live submission failed HTTP503 because enabling managed pg_net exposed extra functions/tables to the restricted website login. No request was created. Supabase-owned PUBLIC grants could not be revoked. Unscheduling the new job and dropping the empty newly installed extension restored intake isolation; queue/response tables were verified empty and no database webhooks existed. No business data was removed.
Replacement: existing Supabase pg_cron + supported http 1.6 in private trimax_scheduler schema, inaccessible to anon/authenticated/trimax_scheduling_web. No new service or cost. Fixed HTTPS endpoint authenticates from Vault at execution time, with bounded 55-second timeout and sanitized failures. Handshake returned HTTP200. No queue stores credential headers.
ACTIVE job 3, trimax-service-request-delivery, every minute, push-only due predicate. Successful cron execution and both push-provider acknowledgments verified. Email remains disabled independently.
Use SERVICE_WORKFLOW_SCHEDULER_HTTP_20261019.sql for current scheduler activation. The older supabase/sql/2026-10-18-service-request-scheduler.sql pg_net procedure is SUPERSEDED and must not be rerun.

## Controlled live acceptance
- Request c27947e5-168e-4876-8110-620f8662a190; receipt REQ-aab75cfd2daa4d6c8ec8937255629bba; Rollout Acceptance 20261019.
- Client da9b4dcb-7bd1-4dfc-8c38-3f0e580094c3; Queue 0a947bc1-802a-430f-8bb6-a0659783a125. Exactly one linked client and Queue item. Existing-customer matching also passed the isolated regression suite; live acceptance created the synthetic client.
- Approval alone did not book/create work. Conversion explicitly linked client/Queue. Same-day October 19 09:00 booked, rescheduled to15:00 America/Los_Angeles. Browser Playwright time fill did not commit native input; native setValue verified the reschedule correctly.
- Work Calendar displayed one appointment; exported ICS UID is Queue ID, DTSTART20261019T220000Z, DTEND20261019T230000Z. Calendar integration is ICS export, not continuous external synchronization.
- Appointment cancelled, start/end cleared, Queue unfinished and audit retained. No real dispatch or billing.
- Persistent owner alert unread increased then decreased on opening its direct link, persisted across navigation. Two push subscriptions delivered in one attempt each, provider reference push-service-accepted. This does not establish physical iPhone display.
- Five synthetic email records retained as dead_letter, error acceptance_test_email_suppressed, attempts0, audit reason retained; prevents accidental future delivery. All customer email remains disabled; sender not yet verified. SMS disabled.
- All19 pre-existing business-table row counts and SHA256 fingerprints equal baseline after excluding only the three named new test records. Existing customer data unchanged.

## Evidence
Private directory: C:/Users/robbi/AppData/Local/Trimax/workflow-rollout-20261019. Includes baseline and final data fingerprints, acceptance-links.json, final-scheduler-audit.json, acceptance-calendar.ics, request-received.png, calendar-verified.png, worker/runtime records.
Full gate: C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-19T08-29-04-720Z/gate-result.json.
Final targeted runtime check must pass after committing this documentation-only checkpoint; an intermediate run correctly rejected the uncommitted operator documentation as dirty, not a database or executable fault.

## Data-preserving recovery procedure
1. Disable SERVICE_REQUEST_WORKFLOW_ENABLED and SERVICE_REQUEST_DELIVERY_ENABLED for Trimax production; keep email/SMS disabled. Apply through a verified production build if runtime flags need to change.
2. In existing Supabase project run: select cron.unschedule('trimax-service-request-delivery'); stop only the two matching local OCR worker processes before code switch.
3. Preserve all migrations, Vault credential, request/client/Queue/audit records. Never drop business columns or restore old data to force prior hashes.
4. Use prepared recovery checkout C:/Users/robbi/.codex/worktrees/service-workflow-rollback-prep/trimax (retained executable c6205c13e8e8fded7914789020a3095b0e0a4639, recovery metadata6d3b618, receipt3f6004d). It was rehearsed against additive schema with97PASS/two predeployment prerequisites. Refresh recovery serving-release context, verify current catalog and seal, deploy recovery web with workflow/delivery disabled, restart matching recovery workers, complete actual startup/postdeployment attestation before declaring recovery. Do not blindly promote the old manifest and start incompatible workers.
5. Public website can independently restore retained Vercel deployment8vAGJgTusxopqctycxSxVk7AueXZ in rnl-public-website; verify rnlcreations.com alias and intake compatibility. Prior internal deploymentDbJBRGrnwsbdAC24egTmPahUN6LV remains retained as a checkpoint, not a complete post-migration worker recovery.
Rollback tags preserved: rollback/trimax-service-workflow-20261018 ->4e3d786e12092c5ffde86d8324cd6c23ce6670cf; rollback/rnl-marketing-20261017 ->34fa3b47f16890a9de09b253848ecf8a690f4e9b. No tag modifications.

## Remaining acceptance
Physical iPhone: installed Trimax PWA, correct workspace, notifications allowed, phone locked/backgrounded. Confirm banner for marked test, tap to correct request, read state survives reopening. User was asked when ready; no reply yet. Arrange another clearly marked controlled push only when ready if original notification unavailable. Do not equate provider acceptance with device acceptance.
Email: verify existing sender/domain and SERVICE_REQUEST_EMAIL_FROM/SERVICE_REQUEST_EMAIL_BUSINESS_ID, test delivery to an owner-controlled inbox, then activate separately and include email in scheduler wakeup predicate. No new subscription or login requested during rollout. Do not enable before sender and delivery verified.
