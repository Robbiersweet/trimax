# COMPLETE — Office QR live and production acceptance verified

Final 2026-10-29 UTC / 2026-10-28 Pacific. Status LIVE_VERIFIED.
Production app https://app.rnlcreations.com source
5f8ddc055ab617fa36942ac264e6ea31cdd9e634, deployment
dpl_Amcg5JhtK2PZux3WJU6nTCCgHW5V.
Common executable 6a5762177b254fea9056d07f1c89dc4963093433; bundle 53292dddc0dd7ee2cbbb5fdd2f37b816af4139f753b7586b46c5f2039c35c716.
Website remains verified live 811b7b3. Existing coupon URLs unchanged and working.

Full POST: PASS, 136/136 checks and 8/8 retained cases. Live database and runtime
attestations PASS; no remaining deployment prerequisite. Report:
%LOCALAPPDATA%/Trimax/release-gates/2026-10-29T05-34-26-987Z/gate-result.json.
Exact source/project/Ready reverified after acceptance. Existing native supervisor
running both validated workers from office-coupon-rc1, artifact 5f8ddc0. Both
persisted synthetic diagnostic identities match release/source/bundle/database;
legacy review and shadow completed, payment write capability false.

Single reviewed office migration committed after all five canonical fingerprints
and 47 existing public table values matched. Corrected search_path and reviewed
raw CRLF transport; application/migration bytes unchanged. Initial stopped
attempts were rolled back and old app/intake/workers verified before retries.
Do not rerun migrations or successful tests. Source and expected manifest remain
frozen; private deployment helper preserves raw reviewed SQL bytes. Catalog
comparisons remain strict, explicitly qualified and pinned public,pg_catalog.

## Permanent North Creek card

https://rnlcreations.com/maintenance/876c0409-1d58-4633-80df-45c7db119a1a
One active property QR; create/find repeated in actual owner UI returned same ID.
Normal Menu → Maintenance QR Labels was clicked and verified. North Creek appears
once; saved service address comes from existing client. Existing synthetic choice
hidden without deleting assignment/history; legacy unit URL still HTTP200.
Owner tab 14 left at live manager for printing. Print cards → select 5 copies.
Actual hosted SVG decoded at 256 and 512 pixels. Physical print/iPhone scan not
performed. No additional test submission is required merely to verify the scan.

## Actual production browser acceptance

Anonymous public form submitted Unit Z07, specific area Kitchen — synthetic
release test, timing/urgency, invalid test contact, explicit NO DISPATCH/BILL/
CUSTOMER CONTACT instructions. Reference REQ-30c07b8ac2094a91ac88780ffa0acd65,
request e1e4090c-221b-47c9-b8d0-d3defd340803. One photo uploaded and completed.
Readback BEFORE owner approval: correct property/trusted address/Z07, one owner
notice, two provider push deliveries, zero automatic Queue. Owner opened actual
notification link into exact request, saved Approved review, explicitly selected
existing North Creek client, then clicked Match client & add to Queue.
One Queue da8194a0-6701-460b-829b-e7c5e7bad9b3; correct property/Z07, no appointment,
no new client, no invoice, no financial amounts/payments modified. Actual Queue
page and synthetic instructions verified. Keep this labeled synthetic record for
audit; it does not authorize real work. Do not dispatch, bill, or send messages.

Final read-only acceptance verified unchanged invoice/line-item/client/payment-
attachment/job-session/recurring records and all existing activity_logs rows.
New authorized review/conversion history remains. Customer delivery count zero.
Service-request SMS/email flags disabled on both projects; owner push remains on.
Physical iPhone push receipt/scan not claimed. Owner session had expired after the
long PRE run; one required sign-in restored it and all UI testing then passed.

## Evidence / recovery

OPS = %LOCALAPPDATA%/Trimax/invoice-lifecycle-20261026/office-coupon-20261028.
OFFICE_QR_PRODUCTION_COMPLETE.json is final exact deployment/gate/acceptance receipt.
production-office-browser-acceptance.json and production-office-after-owner.json
retain actual UI and read-only results. Actual screenshots: production-office-
label-final.png, production-office-owner-approved.png, production-office-queue.png,
production-office-guest-receipt.png; original SVG production-office-label.svg.
Screenshot clipping was ineffective; invalid clipped artifact removed. Use the
full actual manager screenshot as proof. Do not claim simulated mobile viewport.

Fresh pre-cutover snapshot 20261029T052241Z: all 88 restored table hashes matched,
38 Storage objects / 64,697,988 bytes verified against DB count. Isolated restore
had no network/ports/cron and is stopped. Later test adds one diagnostic capture
and one request photo; preserve them and all records during app recovery.
Backup/credential/Storage/crash evidence and historical rollback tags intact.

Exact data-preserving recovery (only if required; not executed on healthy live app):
1. Use protected Invoke-OfficeApprovedCutover.ps1 -Mode recovery-pause, which gates
   on exact committed office schema and preserves current intake setting in a
   separate recovery journal. Do NOT use baseline-only Mode pause after migration.
2. worker-office-cutover.ps1 -Mode pause (identity-checked current supervisor).
3. node OPS/promote-office.cjs recover, target recovery deployment
   dpl_4ei3HzM1HQB2nrKi72X4Vf78BHHG,
   https://trimax-8rcs2rcku-trimax-s-projects.vercel.app,
   source 62a48eeeb02509ec7e601cb1453b9877cfd12e98. Canonical new-schema manifest;
   unchanged RC4 executable 8b2838621a89bb88bc92f19d46d17d21b45e3bc2.
4. worker-office-cutover.ps1 -Mode recover, exact clean office-coupon-recovery.
5. Invoke-OfficeApprovedCutover.ps1 -Mode restore restores the separately saved
   recovery intake state. Reverify alias/runtime and records afterward.
Retain additive database schema and new requests/audit. Never downmigrate or restore
old DB over current financial data. Revalidate source/current state before future
recovery; existing journal collision deliberately stops repeated operations.

Remaining owner-only action: print the cards and scan one on the physical iPhone.
No release approval, login, provider activation, or further deployment is pending.

---
# LIVE Office QR cutover — final acceptance in progress

2026-10-29 UTC / 2026-10-28 Pacific. Owner explicitly authorized continuation after
all checks. Both full canonical PRE gates passed, all 8 retained cases each;
source/executable and reviewed migration unchanged. Correct staged/live core:
5f8ddc055ab617fa36942ac264e6ea31cdd9e634 / dpl_Amcg5JhtK2PZux3WJU6nTCCgHW5V
https://trimax-cccf0dpye-trimax-s-projects.vercel.app
Live custom URL https://app.rnlcreations.com verified exact source/project/Ready.
Recovery: 62a48eeeb02509ec7e601cb1453b9877cfd12e98 /
dpl_4ei3HzM1HQB2nrKi72X4Vf78BHHG /
https://trimax-8rcs2rcku-trimax-s-projects.vercel.app . Recovery is for NEW schema.
Website still live 811b7b3, no website redeployment needed.

Two independent serialization issues are now diagnosed and addressed:
1. Canonical search_path public,pg_catalog, explicit catalog schemas; direct
   installed runtime RPC matches all five expected fingerprints in isolated DB.
2. Python read_text silently normalized reviewed CRLF SQL to LF, changing stored
   function bodies. A second attempted transaction rolled back on RPC mismatch.
   Exact LF failure hash reproduced in isolation; raw reviewed CRLF matches all
   five canonical expectations. Actual SSL read-only psycopg query transport
   confirmed preservation. Deployment helper now read_bytes().decode('utf8'),
   asserts reviewed raw SHA256 before stripping outer BEGIN/COMMIT only.
   Migration source and application/manifests need no further changes for this fix.

Both stopped attempts restored original schema/intake/RC4 workers and protected
financial/client/Queue/audit rows before retry. Preserve attempt archives in OPS.
Final attempt COMMITTED single 20261028_property_office_qr.sql, reviewed raw hash
97eb4f42fb5148444b29f829d5d84686831789de8d8ed6fe67a36ab6261b2fc0.
All five target fingerprints matched and 47 existing public tables preserved
before commit. Exact new app promoted, existing supervisor switched to prepared
native office-coupon-rc1 source 5f8ddc0; original intake enablement restored.
Task identity/triggers and credentials preserved. SMS/customer email disabled.

Fresh snapshot 20261029T052241Z: all 88 restored hashes matched, canonical migration
rehearsal passed, 38 Storage objects / 64,697,988 bytes verified against DB count.
Private recovery remains network-none/no ports/no cron, stopped after checks.
OPS/canonical-cutover-backup-ready.json records exact proof. No financial restore.
One controlled nonpayment OCR diagnostic pair: legacy REVIEW, shadow COMPLETED;
both new release identities/expected canonical fingerprint/payment capability
false verified. Complete POST gate running via run-canonical-post-gate.cjs;
log canonical-production-post-gate.log (session 15153). Do not repeat successful
PRE or 56-photo matrix; source bundle remains byte-identical common 6a57621.

Production browser tab 14 could not restore owner session after app refresh and
shows actual login form. One async sign-in question issued; wait/reuse that tab,
no new OAuth/password reset. Owner session WAS verified before long PRE runs.
Pending actual owner QR creation, guest Z07+photo submission, owner approve and
existing-client Queue conversion, public readback and final POST report. Do not
claim these passed yet. Physical iPhone/paper scan remains owner-only afterward.

Private prepared tools: promote-office.cjs (promote/recover), worker-office-cutover.ps1
(switch/recover AFTER committed schema), Invoke-OfficeProductionAcceptance.ps1
(before-owner/after-owner). Acceptance requires production-office-fixture.json
with actual labelId/reference. Keep test labeled synthetic; no actual jobs/messages.
If any critical final test fails, pause intake/workers and recover compatible
app/native source 62a48ee; retain additive DB and new records, restore original
intake state. Never restore old DB/downmigrate. Preserve backup/checkpoint history.

---
# Canonical fingerprint correction — continuation in progress

Owner explicitly authorized corrected rollout after all critical checks pass.
Checkpoint e187e3d preserved; original production remains RC4 while PRE gates run.
Candidate manifest correction 74902a2; recovery manifest correction 69d3c4b.
Executable and migration bytes unchanged. Only schema and policy expected hashes
changed to the exact output of the EXISTING installed trimax_release_runtime RPC.

OPS/canonical-fingerprint-query.sql explicitly qualifies pg_catalog catalog
relations/deparser functions and pins public,pg_catalog at every comparison.
OPS/canonical-fingerprint-verification.json records query SHA256, unchanged RC4
baseline and canonical office target. Three incoming paths converge; direct
owner-gated runtime RPC in network-isolated restored DB matches all five target
fingerprints. Rehearsal rolled back and container stopped. No checks weakened.

Complete candidate then recovery PRE gates running via run-canonical-pre-gates.cjs;
prepare-canonical-artifacts.cjs waits for BOTH successful reports before exporting
receipts, committing metadata, staging matching builds and preparing exact native
runtimes. Sessions are independent Windows processes; inspect process journals
and actual artifacts before retrying after interruption. Do not repeat or promote
old unreconciled artifacts. Production owner browser tab 14 is authenticated.

Before cutover: refresh backup/Storage, rerun canonical restore/rehearsal,
revalidate disabled messaging/current baseline, archive prior RESTORED pause
journal without deleting history, use existing approval for single migration.
Stop and perform schema-state-appropriate recovery on any critical failure.

---
# Latest result — approved cutover stopped and recovered

2026-10-28 Pacific (2026-10-29 UTC). Owner approved the coordinated office rollout.
Do not ask again for routine preparation. Critical schema gate failed before
migration COMMIT; obeyed stop/rollback condition. No application promotion occurred.

Fresh snapshot 20261029T042015Z: all 88 restored table hashes matched; exact RC4
catalog restored with source ACL supplement; isolated container stopped. Separate
Storage refresh: 38 objects / 64,697,988 bytes verified. Vault supplement unchanged.
Reviewed migration raw SHA256 matched. Original production schema/current app,
disabled SMS/customer email, and idle queues passed initial preflight.

Intake was paused and native workers stopped; migration target fingerprint differed
from manifest. Transaction rolled back without commit. Original intake enablement
restored and original qr-rc4 native task restarted preserving principal/triggers.
Live app remains dpl_8GBEb5E6FXNKqYeamAP2BWGHALW3; website coupon version unchanged.

Root cause reproduced only in isolated local recovery: rehearsal fingerprints
were captured with default search_path, while the production transaction pinned
public,pg_catalog. RPC/grants/triggers agree, schema/policy deparsing hashes differ.
Private stopped-cutover-isolated-diagnosis.json preserves both exact targets.
This is NOT authorization to remove, weaken, skip, or normalize away safety checks.

Next safe engineering: make rehearsal, migration precommit check, manifests and
runtime/POST evidence use the same canonical search path. Reconcile BOTH candidate
and post-migration recovery manifests, retain source-bound evidence, rerun impacted
release gates, and stage exact matching artifacts. Do not promote the previously
staged candidate/recovery with unreconciled target fingerprints. Preserve current
production until corrected prerequisites are fully verified. No invoice/customer
communications, financial modifications, new migration, or physical scan occurred.

Private production operation files: office-intake-fence.json,
office-migration-before.private.json, office-cutover-error.private.json,
post-stop-catalog.private.json, rollback-verification.json,
cutover-backup-ready.json, stopped-cutover-isolated-diagnosis.json.
New secure bridge Invoke-OfficeApprovedCutover.ps1 supports inspect/pause/migrate/
restore; do not blindly repeat operations. Migration result file does NOT exist
because its target check failed before verification/commit. Inspect journal/state
before any retry. Existing staging records below are historical preparation only.
The earlier async owner sign-in request is no longer needed for this stopped run.

---
# Office QR and winter coupon intake — verified checkpoint

Updated 2026-10-28. One primary agent. No new source work required.

## Actual production status

Website LIVE: source 811b7b3a89b84a5c12360b881e4c223df1c31c53, deployment
dpl_Gpq6pt8T2gPqw2t3CuWST9bTPykQ. Both original printed destinations work:
https://rnlcreations.com/schedule?promo=WINTER25
https://rnlcreations.com/schedule?promo=WINTER100
All 16 original PDF QR symbols decoded; artwork unchanged. Actual anonymous
WINTER100 browser request REQ-d1a68e0302c74d18be253b70bfdae3ee reached production.
Request UUID db884fb9-f089-4ee5-8642-468c88dfb837. Verified promo exactly once,
one owner notice, two provider push deliveries, zero Queue/client creation,
zero automatic discount and zero customer SMS/email. Preserve labeled test record.

TriMax LIVE remains RC4 dpl_8GBEb5E6FXNKqYeamAP2BWGHALW3 / source
690d42665c39469c16980e666ffe18963338de7d. Existing native task unchanged.
Office migration NOT installed; North Creek office QR is NOT yet live.

## Ready artifacts

Core artifact 6e6c704635113f76d4703cb1953a91854e322613; executable
6a5762177b254fea9056d07f1c89dc4963093433; trimax-office-coupon-20261028-rc1.
Bundle 53292dddc0dd7ee2cbbb5fdd2f37b816af4139f753b7586b46c5f2039c35c716.
Correct staged deployment dpl_EiwfBeZUTAjztKUH8heoAkzNqkCJ:
https://trimax-obz5t77l2-trimax-s-projects.vercel.app
Actual compiled client build stamp matches exact artifact. Earlier C2Toft stage
has stale diagnostic build identity: DO NOT PROMOTE. Private prep now fixes this.

Primary PRE READY_FOR_CONTROLLED_DEPLOYMENT: 134 PASS + two expected production
DB/worker prerequisites, zero failures; 8/8 retained acceptance. Photos 56/56;
new office/fixed-unit SQL 63 PASS, previous 27 preserved. Website 83 boundary,
security/SEO checks, branding, types/lint, 36 shared-module provenance PASS.

Hosted lab guest Unit Z07/area Kitchen/trusted saved address:
REQ-11a96e67da6148d9ba6caa5455b362b3. One owner notice, initially zero Queue.
Owner preview showed location and Maintenance QR Labels navigation. Preview
review-write guard blocks UI writes; existing authenticated LAB owner RPCs
approved/converted same request to one correctly located Queue. Do not claim
preview UI review-write passed. Manager browser direct-Queue Unit Z09:
REQ-27bad79bf8a3431db0b856f20e5a1609; actual photo upload passed. Existing manager
permissions unchanged. Create/find idempotency, one active code, replacement
invalidation/history preservation verified. Current lab code
6870889c-1c55-4330-be3b-2c4fb6eaf1c5; actual hosted QR pixels decode to lab route.
User dismissed blocking dialog; actual replacement state verified before retry.
No physical print/iPhone scan acceptance. Viewport override failed to resize;
do not claim mobile browser/physical notification verification.

## Recovery and private evidence

OPS = %LOCALAPPDATA%/Trimax/invoice-lifecycle-20261026/office-coupon-20261028.
All private receipts/scripts/credentials remain outside Git.
Snapshot 20261028T124219Z: official CLI exports and supplements; all 88 restored
table counts/digests matched. Separate 38 Storage objects / 64,697,988 bytes
verified; 11 login verifiers unchanged. Isolated Docker restore has no network,
ports or cron; stopped after rehearsal. Exact catalog required source ACL replay
because local image default grants differ. Preserve restore-exact-public-acls.sql
and source-catalog.private.json. Future fresh restore must replay this supplement
before fingerprints; verify-recovery.cjs does not automatically insert it.
Rehearsed office transaction preserved existing rows and rolled back cleanly.
Recheck/refresh backup and Storage freshness at approved cutover.

Schema-compatible recovery artifact ae8ff0e6ca16895de8aaf717189e14f2ef41dc9f,
unchanged RC4 executable 8b2838621a89bb88bc92f19d46d17d21b45e3bc2,
release trimax-office-coupon-recovery-20261028:
dpl_BSqY8zwRwAZnq52YtPu6TB5K7z9H
https://trimax-ejvs5i82s-trimax-s-projects.vercel.app
Exact project/source/Ready verified. Recovery PRE READY: 132 PASS + two expected
cutover prerequisites, 8/8 retained. Native candidate office-coupon-rc1 and
recovery office-coupon-recovery prepared, exact clean commits, both unchanged
restricted configurations/model validations passed. No worker switch executed.

## Single consolidated office production approval required

Earlier explicit approvals named RC3 migrations and RC4 app-only correction,
which excluded new migrations. Latest reply Dismissed only cleared browser modal.
Do not execute office production migration/cutover without consolidated approval.

1. Revalidate RC4 app/task/schema, exact candidate/recovery hashes, disabled
   customer SMS/email, and fresh recoverable DB/Storage evidence.
2. Pause intake/worker writers using established procedure, save exact original
   state/task XML, capture financial/payment/audit invariants.
3. Transactionally install ONLY 20261028_property_office_qr.sql, SHA256
   97eb4f42fb5148444b29f829d5d84686831789de8d8ed6fe67a36ab6261b2fc0.
   Verify rehearsed target fingerprints and preserved rows before commit;
   unexpected condition means transaction rollback and stop. Additive existing
   tables only; no financial or credential changes.
4. Promote EiwfBe candidate, synchronize existing task to office-coupon-rc1,
   restore original intake/worker enablement. Prepared worker-office-cutover.ps1
   preserves task principal/triggers and checks process identity.
5. Complete POST gate, owner UI labels, controlled synthetic North Creek Z07
   intake/photo/notification and fixed-unit/privacy regression acceptance.
   No real jobs, customer messages or automatic discounts.
6. After committed migration, recovery retains additive schema and all new data:
   promote BSqY8 schema-compatible recovery and synchronize recovery native.
   Before migration commit retain original RC4 app/runtime. Never downmigrate or
   restore an old database over financial/audit records. Recovery helper is ONLY
   for after office migration; not safe against original schema.

Matching website already live: no repeated website deployment needed. Website
rollback promotes https://rnl-public-website-docjb1fcq-trimax-s-projects.vercel.app
with existing authorized CLI in website project, preserving submitted requests.
rollback/rnl-marketing-20261017 and collected crash logs remain intact.

After cutover owner navigation: Maintenance QR Labels → North Creek Apartments →
create/find property QR → print five identical copies. Physical paper/iPhone
scan and optional physical push acceptance remain. SMS/email stay disabled.