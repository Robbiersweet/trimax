# TriMax extended workflow — implementation and acceptance draft

## Scope and production boundary
The candidate adds manager intake/photos/preferences, owner retry safety, email-only capabilities and delivery diagnostics, isolated Preview adapters and a fresh Job Session completion check. Existing public scheduling uses Option C restricted PostgreSQL and the existing backend. No production deployment, migration, worker switch, credential change, real customer message, paid service or synthetic production payment occurred.

Production app remains `885d01f18b1811de7f2be8fe33ec9d8858056d20`, Vercel `6G2N5TMoymwBRm48NKrtt8Qbr7Xc`; website `7e0ca069a5cbbb2c38aa05e8705113a5cc769e18`, deployment `7nhM28FWzouDAL8HwXyom7fX7VbB`. Existing push configuration and unrelated checkout changes remain preserved. Real SMS/email delivery and public photo activation remain disabled.

## Current source and evidence identities
Corrected rc8 executable `65f21b79da5928b8125dfcf278d9018c216a277d`; seal `86b0f82`; bundle `38e11b3504897e2e91d473bb15a4a383d7c6f182874669f03fcf0311bb587733`; manifest `5bda467e6ec9cafefc6c73406105c6b0d435c806839ee10cd439e0c7c8f4ae37`.

Gate `2026-10-26T00-24-02-036Z` failed lint only: a new CommonJS regression lacked the standard directive. Eight retained documents, regressions, TypeScript, build and clean-end passed, but the failed gate was not exported as success. The correction passed lint. Source-bound matrix `matrix-2026-10-26T00-46-34-742Z` completed FINAL PASS56/56; receipt commit `c65fbe1`. Fullgate82491 is running; its result must be filled from actual completion. No new Ready preview is claimed.

Hosted evidence below used rc7 metadata `405535153b946d3514b9ed86b82b885f585745c7`, Ready deployment `4t41zhCHom8nrHtT8ZUfRQKTzpo7`, not the rc8 repair. Marketing `b631b5867552bf66813ff88cbf0d34108d933ad9` is Ready on `7uRNCvJeo6pHm1XAGLcwR2D8qjrj`. Historical rc7 gate passed154checks/eight retained documents; those receipts do not authorize changed source.

## Lab provisioned and actual hosted acceptance
Existing free lab `yzyfmvoswucyauogueca` now contains the25 approved schema stages/13 candidate migrations, four synthetic identities, two businesses, private JPEG bucket and restricted two-RPC SQL login with verified TLS. Seven catalog comparisons passed after reviewed lab-only grant normalization. Original sentinel/RPCs preserved. Normal synthetic owner/manager browser login works. No production data copied.

- **A:** actual website request `22832082-1e1f-48a7-a86f-9ce7c027a35f`, existing client201, one Queue `9fe0c001-153a-40ff-a8bf-1001938a8bb3`, same-day appointment, normal estimate→invoice→one synthetic$125 bookkeeping payment. Scoped graph and single payment audit verified. No real funds or email. Full lifecycle is not PASS because the completion guard failed.
- **Manager:** request `9f9ce1ba-63f2-4bbb-9c6b-48f9d1cf2197`, A-101/afternoon/flexible/soon; two actual browser PNG uploads became private8×8 JPEGs with verified hashes. Both known objects rejected public access. Anonymous, owner/manager direct access and unrelated authenticated customers A/B were denied. Owner normal UI displayed both signed photos; manager owner-workspace access denied. Conversion to Queue `78aee2f9-2c93-4486-b7e2-4cbffc85ad41` preserved request/client/photo association.
- **Estimate-first:** same manager Queue estimate `7f5f099f-bc39-4cc8-b158-8d6ed564d2fc` created00:36:02Z, Draft$125/tax-exempt/client201. Independent snapshot before booking proved null appointment. Booking followed00:37:11Z for October25,20:00–21:00Los Angeles. Job remains incomplete for repair acceptance.
- **B:** restricted retry reused request `eba99cbb-0629-41d3-8ad8-4de453302469`; one new client/Queue. Same-day site visit rescheduled and cancelled. Browser ICS retained UID, revisions1→2→3 and cancellation time. Physical calendar import remains unverified. A15-minute buffer conflicting with an18:00–18:30 block was rejected; zero-buffer boundary accepted, then cancelled, finalrevision5/open Queue. Block retained; cleanup was not authorized. Notification deep-link opened exact B request, unread1→0; not physical push.
- **Communications:**13 hosted database checks passed leases/retries/cutoff/STOP/HELP/START/duplicates/order/tenant denial. Disabled/test settings restored. This is database simulation, not hosted worker HTTP or provider delivery.

## Verified defect, repair and limits
rc7 completed a job despite an active session because its rendered prop was stale. Failure preserved; session ended normally. rc8 queries current sessions at action time, fails closed on missing business/query error/null count/active session, and includes actual callback regression. Hosted corrected-source retest is still required. Query/update is not atomic; reviewed SQL draft remains unapplied/outside13 migrations. Technician/edit paths do not use this new helper; no universal atomic completion guarantee claimed.

## Channel activation, cost and lifecycle limits
SMS stays off until owner-approved account/sender and chargeable registration, applicable 10DLC/toll-free verification, server-only Twilio credential/business mapping, exact HTTPS origin and signed inbound/status callbacks pass controlled handset acceptance: delivery, STOP/HELP/START, private links and superseded reminders. Business consent, milestones, timezone/quiet hours, cap and activation timestamp must be reviewed before separate global enablement. Twilio is implemented; Telnyx is research only.

Historical October 25 estimates—not newly verified rates—from docs/handoffs/COMMUNICATIONS_ACCEPTANCE_20261025.md and its official pricing links: Twilio $0.0083/segment plus $1.15/month long-code or $2.15 toll-free; Telnyx $0.004/part. 1,000 parts estimate $8.30/$4 before carrier, registration, number, tax and inbound costs. Private URLs can increase segment counts. No purchase authorized here.

Email separately requires verified sender domain/address/reply handling, existing Resend key/business/from configuration, exact origin/activation timestamp, approved owner-mailbox delivery and signed callbacks. Provider acceptance, mail-server delivery and human receipt remain distinct. Preserve production CRON_SECRET and reconcile uncertain sends before retrying.

Private SMS_LIFECYCLE_COMPLETENESS_REVIEW.md identifies limits: document SMS requires a successful existing email-send audit, not manual Mark Sent or SMS-first issuance; payment acknowledgment requires the verified payment audit; operational payment reminders are not implemented. Hosted DB simulation is not worker HTTP/carrier acceptance. Reviewed HTTP backlog hazards remain unexecuted: global email claims may include other synthetic rows; SMS retry preclaim exclusivity, quiet-hour boundaries and partial-run journals need checking before serial acceptance. Do not rewrite historical activation times or reset outboxes.

## Remaining gates and recovery
Finish corrected-source matrix/fullgate, verify exact Ready preview/alias, and retest completion on the existing manager Queue. Automated HTTP is still Vercel-protected. A temporary token was revoked unused after unexpected environment designation; revised narrow approval for temporary automatic environment designation and lab-only use is granted; token not yet created or used; revoke before any deployment. Prepared B communications and A validate-only duplicate-payment helpers require fresh Ready evidence and approved access; never reapply payment.

Prepared bounded manager permission/revocation runner awaits scoped approval; it pins assignment501, permits one direct Queue test, restores exact fields in finally and records timeout/error recovery. It has not executed; direct Queue remains denied. Candidate installed-iPhone/push/calendar acceptance, verified email sender/mailbox/signed callbacks, SMS provider/handset and production catalog/native runtime attestations remain separate.

Preserve rollback refs `34fa3b47f16890a9de09b253848ecf8a690f4e9b` and `4e3d786e12092c5ffde86d8324cd6c23ce6670cf`. Follow private ROLLOUT_RECOVERY.md:13 ordered migrations only after coordinated approval, preserve data/audits, reseal actual retained catalog, prefer forward repair. Old deployment promotion cannot undo migrated state. No destructive down migrations, snapshot replacement or silent activation.

## Final local release result
Corrected rc8 gate2026-10-26T01-02-25-148Z is READY_FOR_CONTROLLED_DEPLOYMENT:155 checks/eight retained documents, lint/TypeScript/build/clean-end PASS. Matrix56/56 PASS, c65fbe1; sanitized gate receipt efa6f91. Corrected hosted preview and repair/worker HTTP acceptance remain pending. This supersedes draft running-state language above.


