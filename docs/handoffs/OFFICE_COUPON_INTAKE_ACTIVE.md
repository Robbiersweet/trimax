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