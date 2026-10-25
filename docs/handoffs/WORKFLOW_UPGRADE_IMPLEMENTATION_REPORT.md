# Workflow upgrade — October 25 implementation and acceptance

## Release boundary
This is a candidate implementation, not a production release or an operational SMS claim. Current production remains TriMax 885d01f18b1811de7f2be8fe33ec9d8858056d20 / Vercel6G2N5TMoymwBRm48NKrtt8Qbr7Xc and marketing7e0ca069a5cbbb2c38aa05e8705113a5cc769e18 /7nhM28FWzouDAL8HwXyom7fX7VbB. No production migrations, credentials, flags, native worker switches, customer messages or test submissions were performed. Original rollback tags remain intact. Dirty primary checkout is untouched.

## Existing behavior preserved
Existing request intake, owner push/in-app notifications, atomic client/Queue conversion, appointments/reschedule/cancellation/ICS, Queue completion rules and financial/OCR pipelines were extended rather than replaced. Marketing /schedule is the active Option C restricted-PostgreSQL entry point; the legacy app /book/rnl-creations route is not activated. The owner's October19 iPhone notification navigation PASS is preserved; this candidate has no new physical acceptance.

## Implemented
- Approval-to-Queue/schedule actions, retry-safe conversion, trustworthy client matching and ambiguity review; blocks, buffers, appointment types, same-day decisions and multi-day jobs; stable ICS identity/revisions.
- Property-scoped manager request/direct-Queue permissions and owner access controls, without automatic appointment confirmation.
- Disabled-by-default Twilio/test adapters, tenant outbox, consent/suppression, current-state reminders, bounded retries, uncertain-send reconciliation, signed status/inbound callbacks, audit/inbox and estimated usage/cost. No provider number, campaign or credentials purchased/configured.
- Expiring customer appointment/calendar/document/reply capabilities. Detailed read-only estimate/invoice HTML uses existing financial helpers. Additional-information replies are idempotent and notify the owner without approving or scheduling jobs.
- Optional public request photos: capability-bound intake, bounded decode/metadata stripping, private storage proposal, retry reconciliation and owner-authorized viewing. No existing OCR bucket reuse.
- Public website favicon, touch/PWA icons and branded share preview; optional consent/photo UI remains gated. TriMax installed-PWA branding/service worker preserved.
- Next16.4.3 and compatible dependency security fixes; exact sharp0.35.5 runtime pin review. npm audit reports zero vulnerabilities at verification time.

## Evidence levels
Local: actual-catalog replay of all eight candidate migrations and retained grants, synthetic SQL and real React tests, real image decoder tests, Final rc4 56-case photo matrix PASS. Full predeployment gate READY_FOR_CONTROLLED_DEPLOYMENT with141 passed checks,two named deployment prerequisites,eightretained/lint/TypeScript/build; physical and deployed schema/runtime acceptance remain separate. Full release-gate status and preview identity are recorded in WORKFLOW_UPGRADE_ACTIVE.md and its referenced receipt.
Hosted marketing: exact8ee2d20c6d8bde2b89a504c8ed663d8e5ecbbe1d, Ready previewDTXmAkPUpnPZ4aPb88fPcQMnXA7G, https://rnl-public-website-ep4dqxknw-trimax-s-projects.vercel.app. Metadata and /schedule inspected; no real submission/upload.
Provider/device: no actual SMS send, carrier callback, STOP/HELP handset or candidate iPhone acceptance. Historical Oct19 push navigation remains accepted independently.

## Hosted verification prerequisite
The existing FREE trimax-scheduling-auth-lab (yzyfmvoswucyauogueca) was resumed successfully. Its public schema contains only lab_scheduling_requests; it is not a complete TriMax test environment. No schema/grants/credentials/bucket/users were added. Before hosted mutation tests, approve a separately reviewed setup containing schema-only baseline plus the eight candidate migrations, synthetic tenants/clients/owner/manager identities, exact least-privilege roles and a dedicated private photo bucket. Do not copy production customer/financial data. Configure only the candidate preview with isolated database credentials via approved secure transfer, never chat/logs. No new paid infrastructure is needed.

After isolated setup, test anonymous request/retry, new/existing/ambiguous client conversion and exactly one Queue item; manager request/direct/cross-tenant denial; block/buffer/same-day/reschedule/cancel/ICS; test-provider milestone/STOP/signature/retry/uncertain-send behavior; reply expiration/retry and owner notification; representative document totals; upload CORS/platform body ceiling/expiry/retry and independent-session PostgreSQL concurrency. Preview must not write to production or send real email/SMS.

## Remaining limitations and activation requirements
- Authenticated manager photo UI is not implemented; public-request photos are implemented but disabled pending hosted storage acceptance. HEIC unsupported; JPEG/PNG/WebP only. Validate iPhone conversion and hosting request ceiling. Retention/orphan cleanup and reserved-slot recovery need an explicit data-preserving policy.
- Customer document HTML is not an e-signature/payment portal or immutable PDF archive. Existing emailed PDFs are unchanged.
- Unlinked inbound SMS has Communications history/alerts but no fabricated service request to force a request-only push. Real handset behavior remains unverified.
- Cost is an estimate, not carrier billing reconciliation or a guaranteed spend cap. Provider acceptance is not delivery. Unknown send outcomes require reconciliation before retry.
- Customer email remains unactivated: verify sender, controlled delivery and separate activation. Its masked live flag was not freshly revealed; no configuration was changed. SMS global flag was absent/default-disabled and workspace activation remains separate.
- No production approval requested until isolated hosted tests and exact coordinated deployment plan are ready. Production schema changes require a coordinated web/native-worker contract and data-preserving recovery; an old Vercel promotion alone is insufficient after migrations.

## Source and recovery
App executablec591ae875a24e5523be89414d475a5dea2a6f9d5; release trimax-workflow-communications-20261025-rc4. Marketing executable8ee2d20c6d8bde2b89a504c8ed663d8e5ecbbe1d. Final metadata/preview commits are in the active checkpoint. Detailed private procedure: %LOCALAPPDATA%/Trimax/scheduling-security-release/workflow-upgrade-20261025/ROLLOUT_RECOVERY.md. Preserve all additive data and audit history during recovery; no destructive down migrations, secret rotation or snapshot overwrite.

## Photo hosting follow-up
Vercel documents a4.5MB Function body limit (https://vercel.com/docs/functions/limitations). Isolated follow-up cdf2046b2fb7b7dcc3f7ae8cdd72f5f4e66d811a lowers client/server raw input to4MiB while retaining5MiB processed-output/SQL quotas. Exact-boundary and overflow tests plus existing photo regression/lint pass. Integrated in root c591ae8/rc4 and marketing8ee2d20. Marketing local checks and exact hosted preview pass; app final gates and exact preview build passed. Photos stay disabled in the current candidate. Hosted body-size and storage acceptance remain required; local boundary tests are not hosted upload acceptance.




## Final preview result
TriMax source483074fee304e6716a1a5d70933be1bf93b529e9 is Ready Preview5WmGB5Jm94qYuXgqBAVhhhHi6Ch5 at https://trimax-huofvq7ky-trimax-s-projects.vercel.app. Hosted root login and protected Service Requests login destination verified. This is an authentication smoke check, not hosted workflow acceptance. Production remains885d01f, rechecked after publication. Initial build was blocked by inherited receipt; branch-only gate configuration and same-source redeploy resolved it without code bypass.

Isolated lab setup is prepared privately, not executed. Managed dependencies exist; one Auth identity and no buckets. Separate adaptera531351/e30f1e4 locally tested but not integrated/deployed. A second test identity, approved isolated schema/access/configuration and optional private bucket are required; no production data or delivery credentials should enter this lab. See active checkpoint for precise continuation.
