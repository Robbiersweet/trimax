# Service workflow — active checkpoint

## Outcome and authorization
Production is unchanged. The recorded local gate says READY_FOR_CONTROLLED_DEPLOYMENT, but overall rollout readiness is HOLD pending hosted integration verification and rehearsed post-migration worker recovery. The latest user authorizes safe rollout preparation only, explicitly not production migrations or deployment. Do not convert the local gate result into overall readiness or request unconditional production approval before the remaining checks pass.

## Latest access and readiness checkpoint — 2026-10-19 05:40 UTC
- Stop repeating plugin/OAuth installation troubleshooting. Vercel plugin is installed and skills load, but no account tools are exposed. Separate CLI whoami explicitly returns Logged out. No new login attempted.
- Supported GitHub credential-manager access works: both exact candidate commit/status endpoints returned HTTP 200 and the intended Vercel project status is success. Repo Actions workflows, repository secrets, and all six Preview/Production environment secret lists are empty; there is no existing GitHub Actions deployment credential route to reuse.
- Existing in-app browser can freshly navigate to BOTH deployment dashboards: internal ATWgCrmMiDRVep382fa1zakDaSWH Ready/Preview/source f47edbf; marketing F8kcxx4b8BwU4tsvxT9fwTnzXH7y Ready/Preview/source 7e0ca06. This verifies dashboard metadata access, not protected-preview access.
- Both exact hosted preview URLs redirect to Vercel sign-in. Existing dashboard-tab navigation also redirects. No protection disabled, bypass credentials created, or OAuth repeated. Browser inventory exposes only in-app browser and MCP Apps, not the user's authenticated regular browser. Asked user to connect that Chrome/Edge browser through Settings -> Computer use / ChatGPT browser extension; this reuses the existing session rather than requesting another Vercel login. Inspect browser discovery once user confirms; do not restart the plugin loop.
- Both remote rollback tags freshly match the exact commits below. Isolated recovery checkout created at C:/Users/robbi/.codex/worktrees/service-workflow-rollback-prep/trimax, branch codex/service-workflow-rollback-prep, retained revision 4e3d786. No executable or manifest changes made there. Offline contract preflight proves BOTH legacy and v2-shadow reject projected schema/RPC/trigger fingerprints. Changing only expected fingerprints in memory clears those comparisons but does NOT prove runtime compatibility or complete the recovery rehearsal. Evidence: %LOCALAPPDATA%/Trimax/service-workflow-recovery/contract-preflight.json. Reseal, regression and runtime rehearsal remain outstanding.
- Earlier read-only production data preflight (03:59 UTC): 3 requests, 47 clients, 36 Queue items; zero unsupported urgency/channel values, tenant mismatches, invalid time zones or candidate columns already present; one owner notice backfill; no delivery cron. Not a fresh data check at 05:40.
- Existing preview modes are synthetic/internal and submission-disabled/marketing. Even with browser access, full persisted hosted flow requires isolated test DB/auth; do not enable writes against production. No isolated hosted database currently established and no paid branch/infrastructure created.
- Production/data/worker processes/rollback checkpoints remain unchanged. SMS disabled and independent. Overall HOLD pending actual hosted verification and recovery rehearsal; do not request unconditional production approval.
## Exact candidate
- Main checkout: C:/Users/robbi/.codex/worktrees/service-request-workflow/trimax; branch codex/service-request-workflow.
- Executable revision: 13cc198 (full revision pinned in release/trimax-release-manifest.json).
- Sealed release: trimax-service-workflow-20261018-rc1; deployed metadata revision f47edbf013992b3ee76147516cf79c37122f08b6.
- Internal Preview deployment ATWgCrmMiDRVep382fa1zakDaSWH: https://trimax-d49v7lbd5-trimax-s-projects.vercel.app/book/workflow-preview.
- Marketing checkout: C:/Users/robbi/.codex/worktrees/rnl-service-urgency/trimax; branch codex/rnl-service-urgency; site sites/rnl.
- Marketing revision 7e0ca069a5cbbb2c38aa05e8705113a5cc769e18; Preview deployment F8kcxx4b8BwU4tsvxT9fwTnzXH7y: https://rnl-public-website-bb4gxzh1j-trimax-s-projects.vercel.app/schedule.
- Both intended preview builds succeeded, verified through authenticated GitHub deployment/status API. Each branch also triggered the other Vercel project, which failed; those are not target deployments and were not promoted.
- Vercel browser authentication expired. Hosted interaction of these latest revisions is pending sign-in; local production-built UI was verified. Do not label local UI checks as hosted verification.

## Implemented and verified
- Persistent owner alerts and direct request links; existing Queue VAPID subscription path reused for background delivery.
- Approval without booking; existing/new client matching, duplicate-safe Queue conversion; timed appointments in the existing Queue calendar; reschedule/cancel preserves unfinished work.
- Public preferred dates accept today, tomorrow, weekends and distant future dates. Invalid/past dates are rejected. Routine remains the default among four urgency choices.
- Owner conflict override requires a reason, included in the mutation hash and audit. Ordinary conflicts still reject by default. Same-day appointments verified.
- Six consent-gated customer email events, independent push/email dispatch, leases/backoff/dead-letter history; failed acknowledgements cannot count as success. Provider acceptance is not handset/inbox receipt.
- Supabase scheduler SQL prepared at supabase/sql/2026-10-18-service-request-scheduler.sql. Cron 1.6.4 and Vault 0.3.1 are already installed; pg_net 0.20.0 is available, not installed. Due/idle/expired-lease behavior tested with isolated extension stand-ins. No scheduler activated or paid plan added.
- Exact schema rehearsal reproduces all five current production fingerprints, then applies three candidate migrations using CRLF transport. The two existing restricted website RPC grants are included. See release/evidence/service-workflow-database-projection.json and run `node scripts/public-function-catalog-replay.cjs --workflow`.
- Full predeployment gate: 100 PASS, 2 expected DEPLOYMENT_PREREQUISITE (known prior DB and worker release), all 8 retained OCR cases passed both pipelines, lint/TS/production build/clean seals passed. Receipt release/evidence/service-workflow-preview-result.json; private run %LOCALAPPDATA%/Trimax/release-gates/2026-10-19T03-14-22-181Z.
- Disposable PostgreSQL: 70 workflow/scheduler checks. Real dispatcher orchestration tests cover provider, claim and acknowledgement failures independently.
- Marketing production build and 78 boundary/routing/security/SEO checks passed.
- Production-built local UI: same-day Sunday preference reaches review; approval, conversion, same-day scheduling and cancellation verified. At 390x844 no horizontal overflow. UI preview records are synthetic and do not persist to a database.
- Local Preview guards: workflow POST403, review PATCH403, delivery unauthenticated GET401, public submission POST503. No customer requests created.

## Production and recovery checkpoints
- Internal live https://app.rnlcreations.com remains deployment DbJBRGrnwsbdAC24egTmPahUN6LV; source 4e3d786e12092c5ffde86d8324cd6c23ce6670cf; immutable https://trimax-rgkyie9u5-trimax-s-projects.vercel.app.
- Marketing live https://rnlcreations.com remains deployment 8vAGJgTusxopqctycxSxVk7AueXZ; immutable https://rnl-public-website-hb9u5dnx1-trimax-s-projects.vercel.app.
- Remote rollback tags reverified: rollback/trimax-service-workflow-20261018 -> 4e3d786e12092c5ffde86d8324cd6c23ce6670cf; rollback/rnl-marketing-20261017 -> 34fa3b47f16890a9de09b253848ecf8a690f4e9b. Primary checkout unrelated edits untouched.
- Web recovery: in Vercel team trimax-s-projects, promote the retained deployment for the matching project above; verify its domain and revision. Before recovery disable SERVICE_REQUEST_DELIVERY_ENABLED and unschedule only cron job trimax-service-request-delivery. Disable workflow actions if reverting internal web.
- After migrations, old worker manifests will reject the additive catalog. Do not blindly restart old workers against it. Rehearse/reseal the retained executable revision against the retained additive schema and run the coordinated gate before worker restart. Keep request/client/Queue/audit data; do not drop columns or roll back customer writes to force an old fingerprint. No recovery is needed now because production was not changed.

## One controlled rollout after approval
1. Resolve the Codex plugin registration/tool-loading mismatch and verify account/project access and latest preview revision/UI. Refresh production/runtime evidence and required freshness checks immediately before rollout.
2. Obtain one explicit authorization covering the three candidate migrations, coordinated web/worker deployment, restricted scheduler activation/configuration, optional email activation and one owner-controlled synthetic acceptance request/recipient. Preserve rollback checkpoints above.
3. Apply the three sealed migrations in order: 20261018_service_request_workflow.sql, 20261018_service_request_delivery.sql, 20261018_request_urgency.sql. Use exactly rehearsed CRLF bytes and compare all five post-migration fingerprints before cutover. No business-data reset.
4. Deploy the sealed internal candidate and matching worker contract; enable SERVICE_REQUEST_WORKFLOW_ENABLED=enabled. Deploy only sites/rnl from the separate marketing candidate to its project. Production must not inherit SERVICE_REQUEST_PREVIEW or preview submission restrictions. Preserve existing intake credentials, origin/Turnstile/rate-limit configuration.
5. For push, enable SERVICE_REQUEST_DELIVERY_ENABLED=enabled; provision the existing CRON_SECRET in Vault securely and activate the prepared named scheduler. Do not expose secrets in chat, screenshots, source or retained SQL history. Validate actual pg_net execution and dispatcher response.
6. Email remains separately gated: verify the existing Resend sender/domain, set SERVICE_REQUEST_EMAIL_FROM and SERVICE_REQUEST_EMAIL_BUSINESS_ID, then enable SERVICE_REQUEST_EMAIL_ENABLED only within authorization. No real email sent yet.
7. Run postdeployment gate and one approved end-to-end test: customer submission -> persistent alert -> owner review -> repeat conversion -> one linked client/Queue item -> schedule -> existing calendar -> reschedule/cancel -> customer email. Verify no unintended customer requests/messages or protected business changes.
8. On the installed iPhone PWA, test both foreground persistent notice and locked/background OS push, tap its deep link, and confirm read state survives restart. Record actual device evidence; do not mark physical acceptance from browser fixtures or provider acceptance.

## SMS and remaining limits
See SERVICE_WORKFLOW_DELIVERY_AND_SMS.md. Provider/number eligibility, registration, verified sender, explicit SMS opt-in/STOP handling and live provider integration remain prerequisites; SMS is not active and must not delay the core rollout. No number was purchased/ported and no paid registration started. Existing phone-contact preference is not treated as completed SMS enrollment.

## Evidence and resume
Local UI proof: C:/Users/robbi/.codex/worktrees/service-request-workflow/workflow-flexible-preview.png and workflow-flexible-mobile.png. No production, actual iPhone push, real email receipt or SMS acceptance is claimed.
Resume from the sealed revisions and this checkpoint. Complete Vercel sign-in-dependent preview verification, then perform only the specifically authorized controlled rollout and physical acceptance. Do not repeat completed architecture/provider research or mistake predeployment readiness for the finished live business workflow.
