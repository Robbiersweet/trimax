# TriMax extended workflow session — implementation and release handoff

## 1. Outcome and authorization boundary

The candidate now includes authenticated manager photos, timing preferences, improved owner retry handling, email-only reply/calendar links, delivery-status reporting, and isolated preview adapters. It is not yet approved for production: actual hosted laboratory lifecycle acceptance is now authorized after Robbie approved the exact isolated lab setup; execution is in progress.

Production remains TriMax885d01f18b1811de7f2be8fe33ec9d8858056d20 / Vercel6G2N5TMoymwBRm48NKrtt8Qbr7Xc and website7e0ca069a5cbbb2c38aa05e8705113a5cc769e18 /7nhM28FWzouDAL8HwXyom7fX7VbB. This newer production baseline includes protected remittance/auth work and supersedes October19 as the release baseline. No production migration, deployment, worker switch, credential change, customer message or synthetic production submission occurred in this session. Existing push subscriptions/scheduler, data and dirty primary checkout were preserved.

Exact final candidate, gate and deployment identities are maintained in WORKFLOW_UPGRADE_ACTIVE.md; that checkpoint supersedes historical source references in older reports.

## 2. Already implemented before this session

- Existing public Option C restricted PostgreSQL intake, owner push/in-app notifications, client matching/creation, atomic Queue conversion, approved scheduling/reschedule/cancellation and ICS.
- Candidate owner workflow actions, schedule blocks/travel buffers/types, manager request/direct-Queue permissions, customer document/reply capabilities and disabled SMS outbox/provider implementation.
- Candidate optional public photo scrubber/private-storage proposal,4MiB input boundary,5MiB processed quota.
- Website favicon, touch icons and sharing metadata; reviewed Next16.4.3/sharp0.35.5 security/runtime pins.
- Historical rc4 evidence was reread:141 checks passed plus two named production prerequisites,8/8 retained documents and56/56 photo cases. App483074f and marketing8ee2d20 Ready previews were verified. Those receipts do not authorize the changed candidate.
- October19 physical iPhone banner-to-request navigation PASSED by Robbie with screenshot for Rollout Acceptance20261019. It remains historical; no candidate-specific physical test has passed in this session.

## 3. Completed during this extended session

### Manager intake and owner workflow

Authenticated managers can submit property/building/unit, category/description, urgency, preferred time window/flexibility and multiple photos. The shared uploader provides progress, bounded files, retry and independent request receipt. Reserve/complete and viewing enforce current exact assignment and business/property boundaries; revocation cannot be bypassed through raw photo capability calls. Photos remain associated with the originating request and linked Queue item. Existing source of client/property identity is preserved.

Urgency and timing use existing request columns and business-specific allowed windows. Owner review now prevents same-tick duplicate saves and preserves the mutation identity when retrying a lost response; changed input receives a new identity. Actual component and SQL regressions cover these behaviors. Production photo activation remains off pending hosted storage acceptance.

### Email and internal notifications

Added exact-lab email simulation, current-recipient/consent/state checks, stale backlog suppression and obsolete reminder cancellation. Durable first-attempt timing stops automatic retry before Resend's24h idempotency expiry. Unknown old attempts require reconciliation.

Email-only request/reply/calendar capabilities work independently of SMS consent. Tokens bind business/outbox/current recipient, expire after30days, honor revocation and support idempotent additional-information replies. Replies reuse request activity and request-targeted owner notification. ICS uses current appointment state, stable UID and revision/cancellation fields.

Signed Resend callback support records provider acceptance separately from recipient-server delivery, bounce, complaint or failure. It checks signature/time/message/recipient/business, deduplicates events, suppresses bounced/complained addresses and retries early callbacks. Existing owner Delivery history displays these distinctions. Real outbound delivery and webhook activation remain disabled; production CRON_SECRET is preserved.

### Preview integration and laboratory preparation

Existing FREE lab yzyfmvoswucyauogueca is active; one original Auth identity, no buckets and only the original public sentinel were observed. The approved isolated provisioning is now in progress; consult the active checkpoint for committed hosted stages.

Prepared25 resumable atomic stages for actual schema plus13 candidate migrations, with hashes, previous-stage checks, exact project guard and repeatable recovery. Local double replay matches all five candidate catalog fingerprints. Four synthetic identities/two businesses, namespace collision checks, private photo setup, restricted two-RPC website login and storage→data→identity cleanup are prepared. No production customer or financial data is required.

The app preview adapter retains real JWT/RLS authorization and existing RPCs. The website adapter uses the actual Option C PostgreSQL handler, only the approved lab role/project and synthetic emails; simulated CAPTCHA/rate-provider behavior is explicitly labeled. Public website lab photos remain disabled to avoid the existing production photo endpoint.

Prepared actual financial acceptance uses existing browser estimate/completion/invoice controls and /api/payments/apply-batch. It verifies request→Queue→estimate→invoice relationships,125 synthetic total, active-session completion denial, owner-only validate/apply and duplicate-payment rejection. No direct financial inserts substitute for UI behavior.

## 4. Evidence levels and limits

| Area | Evidence completed | Still required |
| --- | --- | --- |
| Candidate database | Actual885 baseline catalog reproduced;13 migrations replayed; restricted two-RPC/no-table and tenant checks | Approved hosted lab install, independent-session concurrency, production attestation after approved cutover |
| Manager photos/timing | SQL/API/uploader/actual React tests;390px and1024px local CSS layouts without horizontal overflow | Actual hosted upload/storage/platform limits, current-assignment revocation and manager/owner review in browser |
| SMS | Simulated provider/signatures/templates;40 base SQL,21 Queue,21 replies; consent, STOP/HELP/START, retries, suppression, quiet hours, outdated events and financial milestones | Real provider account/sender/registration, signed callback/handset acceptance, activation approval |
| Email |51 adapter/origin/current-state assertions,20 link SQL,22 status SQL,6 signature checks; templates/retry/status/UI | Verified sender, owner-address controlled delivery, actual signed callback and mailbox evidence |
| Website |82 retained checks, build/lint/TypeScript, brand/light-dark16/32/48px review, actual Ready preview and disabled schedule page | Actual isolated hosted submission; physical Safari cache/touch behavior not claimed |
| Financial/OCR/Queue/Job Sessions | Existing regression suites retained; full current release run recorded in active checkpoint | Hosted end-to-end lifecycle and candidate production/device gates |
| Hosted full lifecycle | No complete hosted lifecycle passed this session | Public submission→review→client→Queue→appointment→estimate→completion→invoice→payment; estimate-first and manager direct paths |
| iPhone push | Historical October19 physical acceptance retained | Candidate-specific installed-device acceptance after approved rollout |

Local visual fixtures use actual CSS but inert controls and some stubbed children; they are layout evidence, not hosted authenticated acceptance. Mocked/synthetic provider tests do not establish carrier or mailbox delivery. A Ready preview proves deployment/build, not production readiness.

## 5. Remaining release work and recovery

1. Execute the already-approved isolated lab setup. Bind lab-only keys to codex/workflow-upgrade and codex/rnl-brand-icons Preview scopes; no production/provider secrets.
2. Run actual hosted browser/API lifecycle including two customers, manager request/direct paths/photos, cross-business/property denial, matching and retry, unapproved appointment denial, conflicts/buffers, same-day/reschedule/cancel/ICS, estimate-first, session completion, invoice and synthetic payment. Repair observed failures and reseal/retest changed code.
3. Complete fresh release evidence and exact previews (current status in active checkpoint). Resolve production schema/runtime prerequisites only through approved coordinated database/web/native cutover; do not manufacture a PASS from local rehearsal.
4. Present one exact coordinated production approval after hosted prerequisites pass. Include13 ordered migrations, any private storage/named manager grants, optional paused SMS scheduler, app/website/native source identities, controlled acceptance and recovery limitations.
5. After approved deployment, POSTDEPLOYMENT attestations/live worker health and candidate-specific physical acceptance remain mandatory. SMS carrier setup must not delay unrelated verified core release work.

Detailed reviewed sequence: C:/Users/robbi/AppData/Local/Trimax/scheduling-security-release/workflow-upgrade-20261025/ROLLOUT_RECOVERY.md. Preserve both rollback refs. After schema changes, old Vercel promotion alone is insufficient: retain records/audits, prefer forward repair or seal a compatible recovery executable against the measured retained catalog. No destructive down migrations, snapshot overwrite, secret rotation or suppression reset.

## 6. SMS and email activation

SMS: owner selects/approves provider account, sender/number use and chargeable registration; complete10DLC or toll-free verification, inbound STOP/HELP/START and signed status callbacks; store server-only credentials; test owner handset/private links/obsolete reminders; set business consent/timezone/cap then approve activation. Current implementation uses Twilio. Telnyx was researched, not implemented or purchased.

Official checked base rates: Twilio US$0.0083/inbound or outbound segment plus$1.15/month long-code or$2.15 toll-free and carrier/registration fees. Telnyx$0.004/part plus separate fees. At1000parts/month base messaging is$8.30 versus$4 before carrier/number/registration/tax/inbound traffic. Long capability URLs can increase segments. See linked official sources and exact flags in COMMUNICATIONS_ACCEPTANCE_20261025.md; this is an estimate, not a guaranteed spending cap.

Email: verify sender domain/address and reply handling, configure existing Resend key/business/from and exact production link origin securely, configure signed webhook secret, approve controlled owner-address delivery and verify mailbox/callback outcome. Then set activation timestamp and separately approve customer enablement. Historical backlog stays suppressed. Existing estimate/invoice send routes are preserved; request email does not claim a new payment portal or electronic signature system.

## 7. Owner-only actions

Robbie approved the exact isolated lab setup on2026-10-25. No additional setup approval or login is needed within that scope. Production and provider activation remain separately protected.

Later: exact coordinated production deployment approval, named manager access decisions, candidate physical-device acceptance, and independently scoped email/provider/SMS registration/delivery activation. No real customer messages or new paid service has been authorized here.

## 8. Evidence and continuation

- Active source/deployments/full gate: WORKFLOW_UPGRADE_ACTIVE.md.
- Photos/access details: PROPERTY_REQUEST_PHOTOS_CANDIDATE.md.
- Communications/provider sources/flags: COMMUNICATIONS_ACCEPTANCE_20261025.md.
- Private lab bundle: C:/Users/robbi/AppData/Local/Trimax/hosted-lab-acceptance-20261026/README.md and FINANCIAL_ACCEPTANCE.md.
- Private actual-catalog projection: C:/Users/robbi/AppData/Local/Trimax/scheduling-security-release/workflow-upgrade-20261025/candidate.json.
- Local visual proof: C:/Users/robbi/AppData/Local/Trimax/workflow-extended-20261025/.

Resume from the active checkpoint, preserve working branches and rollback tags, and use existing authenticated browser sessions. No background execution is promised after the turn ends.
