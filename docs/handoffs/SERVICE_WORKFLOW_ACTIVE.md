# Service workflow — active checkpoint

## Outcome and authorization
Production is unchanged. The recorded local gate says READY_FOR_CONTROLLED_DEPLOYMENT, but overall rollout readiness is HOLD pending hosted integration verification and rehearsed post-migration worker recovery. The latest user authorizes safe rollout preparation only, explicitly not production migrations or deployment. Do not convert the local gate result into overall readiness or request unconditional production approval before the remaining checks pass.

## Latest safe preflight — 2026-10-19 03:59 UTC
- Later connection update: user reports Vercel integration authorized. Plugin registry confirms Vercel 0.54.1 installed; its MCP manifest targets https://mcp.vercel.com. This chat's callable tool inventory contains no Vercel list_teams/list_projects/get_deployment tools. Separate Vercel CLI 64.5.0 whoami reports Logged out. Do not equate CLI login with integration OAuth, or send the user through repeated login/device-code flows. Prior CLI request was cancelled. Account/project access remains unverified from execution; refresh the host connection/tool loading first. Candidate source integrity was rechecked with zero failures. No production changes.
- Vercel session remains signed out. Google previously required sign-in; GitHub OAuth also requires sign-in. Git credential-manager access verifies GitHub status only, not protected Vercel previews. The page's Vercel plugin tool only opens a public plugin information page, not an authenticated connector.
- User action requested: sign into Vercel in the Codex browser using Continue with Google (last used), with the account belonging to trimax-s-projects; reply signed in. Login tab retained. No credentials or security controls changed.
- Authenticated Supabase aggregate-only READ ONLY transaction: 3 requests, 47 clients, 36 Queue items; zero unsupported urgency/channel values, request/type tenant mismatches, invalid time zones or candidate columns already present. One missing persistent owner notice would be backfilled. Delivery cron job count zero. No customer details exported and no business rows written.
- Remote rollback tags reconfirmed at the exact commits below; candidate local source integrity failures are empty. Existing schema rehearsal and full regression evidence remain valid for unchanged executable source. These checks do not guarantee every existing feature or prove a hosted transaction.
- Restoring Vercel login permits hosted UI checks only: marketing Preview intentionally rejects submission, internal workflow Preview uses synthetic in-memory records and protected mutation endpoints reject writes. Actual persisted hosted submission -> notices -> client -> Queue -> calendar verification requires an isolated test database/auth environment. Never enable these previews against production to satisfy this check.
- Post-migration worker rollback is not yet rehearsed/sealed. Retained web deployments/tags are recovery checkpoints, not sufficient proof of complete coordinated rollback. SMS remains excluded from dispatcher channels and must not block core work.

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
1. Restore Vercel browser sign-in and verify latest preview revision/UI. Refresh production/runtime evidence and required freshness checks immediately before rollout.
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
