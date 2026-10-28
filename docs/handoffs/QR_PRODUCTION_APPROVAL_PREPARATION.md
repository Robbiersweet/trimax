# QR production rollout and remaining manager-return correction

Updated 2026-10-28. **RC3 is live and its full POST gate passed. RC4 is verified and prepared; production approval is pending for its additional executable change.**

## Live deployment and acceptance

- TriMax: https://app.rnlcreations.com, source `3a9de0b1a1adeb8116b457346f32fa8699c9fa2d`, deployment `dpl_Hdh9D1ULMAVycdSK1cSjsPfSWhvn`, release `trimax-maintenance-qr-20261027-rc3`.
- Public site: https://rnlcreations.com, source `3870857e0238b27a3f575ce48d83b165043af071`, deployment `dpl_J2wyS7i6uetpDFZFG46V9FdQ7mjB`. Website remains unchanged for the core-only correction.
- Seven reviewed migrations committed atomically; five catalog fingerprints matched;44 original public tables preserved. Intake restored; existing supervisor points to exact clean `ocr-native-runtime/qr-rc3`, unchanged configurations, both engines healthy. One nonpayment diagnostic completed with RC3 provenance.
- Fresh consistent backup `20261028T080421Z`:85 table restore comparisons,35 Storage objects/63,672,008 bytes,11 role verifiers and1 Vault recovery verified in isolated local recovery. Archive SHA256 `471aea817499c199d418f872363bb240247ab0a4734c750f2799b000ddbc6fa4`. Recovery container stopped; no production customer data copied to the synthetic cloud lab.
- Full RC3 POST:134/134 PASS, eight retained PASS; protected receipt `release-gates/2026-10-28T09-17-58-188Z/gate-result.json`. Earlier failed privacy digit-substring assertion and unchanged retries are retained; no validation weakened.
- Actual owner-created label `07b303a2-6cf4-43e9-b514-7aafc77e956e` decodes at256/512 pixels to https://rnlcreations.com/maintenance/07b303a2-6cf4-43e9-b514-7aafc77e956e.
- Live guest `REQ-8a34740a520241a39ab57c27202750f1`: correct location, one completed private synthetic photo, no Queue. Manager `REQ-1459acf7802a401db1f4bee55e653634`: one Queue and only the dedicated synthetic client. Two exact label bindings/owner notifications; both internal pushes provider-delivered. Physical iPhone receipt is not claimed.
- Live owner inbox, notification destinations and private photo controls verified; unsigned photo access403 and unavailable QR404. Six ordinary public routes200. No customer email/SMS delivered. Production feature flags independently read: QR/photos enabled; customer email/SMS disabled on both projects.
- Invoice/payment-bearing records preserved; live INV0545 customer print excludes internal priority/E08 and retains intentional notes. No invoice edit/save/send. Existing financial and privacy functionality retained. Rollback tags and separate18-file crash evidence retained.

## Verified remaining defect and correction

AuthGuard used a helper that discarded the query string when adding/replacing a workspace. The actual public manager sign-in link therefore lost `qr`; explicit `business` plus `qr` worked. RC4 reuses the existing query-preserving helper in the two workspace redirects. Authentication, role checks and API isolation are unchanged. Its regression fails on RC3 and passes after the repair.

- Checkout `C:/Users/robbi/.codex/worktrees/qr-manager-return/trimax`, branch `codex/qr-manager-return`.
- Common executable `8b2838621a89bb88bc92f19d46d17d21b45e3bc2`; artifact source `690d42665c39469c16980e666ffe18963338de7d`.
- Release `trimax-maintenance-qr-20261028-rc4`; bundle `60374b69b87fab8be3a69adf1b00407af7a92094d125ceff39e00ba96e72e330`.
- Source-bound56/56 photo cases PASS. Full PRE READY:133 PASS plus one expected production-runtime deployment prerequisite, zero FAIL; all eight retained PASS. Receipt `release-gates/2026-10-28T09-52-32-717Z/gate-result.json`; source-bound whitelisted receipt committed.
- Hosted lab Preview https://trimax-9k6w0k9ob-trimax-s-projects.vercel.app, exact source/project/Ready verified. Existing synthetic manager signed in through `login?next=/property-requests?qr=...`; URL retained QR plus normalized lab workspace, correct property locked and unit `QR-01` read-only. Existing request/Queue reused; no new submission or permission change.
- Separate production-configured artifact built and verified locally at WSL `/root/trimax-qr-rc4-production-build-20261028/app/.vercel/output`; source/bundle/build authorization and server-environment boundary PASS. **No RC4 production deployment occurred. Never promote the lab artifact.**
- Matching native `C:/Users/robbi/AppData/Local/Trimax/ocr-native-runtime/qr-rc4` prepared; both engines pass actual source/model/dependency/config validation. Existing production task/workers remain RC3.

## One focused production decision

The owner approval named RC3 checkpoint3a9de0b. RC4 changes executable authentication redirect source; request approval only for the prepared production-configured RC4 core deployment, matching existing worker synchronization, one controlled nonpayment diagnostic and final POST/hosted checks. No SQL, grants, credentials, website release, financial edits or customer messages are needed.

After approval: freshly verify current RC3 identities/catalog/config/idle claims; stage the already verified production artifact on the existing `trimax` project, validate Ready/source; briefly pause idle supervisor, promote core and synchronize the prepared RC4 runtime preserving principal/triggers/configuration; verify health and diagnostic provenance, reuse existing QR records for read-only acceptance and run full POST. Keep service-request customer SMS/email disabled.

Recovery: retain all schema, Storage, new QR and financial/audit data; restore current verified RC3 core deployment `dpl_Hdh9D1ULMAVycdSK1cSjsPfSWhvn` and existing `qr-rc3` task action, then verify health/provenance. Same schema remains compatible. Do not blindly restore pre-QR manifests/workers or an older database over current records.

Physical owner checklist: live `/maintenance-labels?business=rnl-creations` → property/unit/address → **Create or find permanent label** → **Print labels**; scan the desired code with iPhone Camera, confirm location, submit one clearly labeled TEST ONLY request and verify its exact owner notification. Paper printing, physical scan and current-release notification tap remain unconfirmed until the owner reports them.

Protected operational evidence, screenshots and journals: `C:/Users/robbi/AppData/Local/Trimax/invoice-lifecycle-20261026/`. Backup evidence: adjacent `production-backup-20261026/`. No process is implied to continue after the session ends.
