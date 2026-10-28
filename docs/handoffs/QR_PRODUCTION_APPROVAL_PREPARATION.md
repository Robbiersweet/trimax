# QR production release — RC4 verified

Updated 2026-10-28. Owner approved the RC3 rollout and then the focused RC4 correction. **RC4 is live; automated/hosted acceptance passed. Physical printing/iPhone scan/push tap remain pending owner confirmation. No further deployment approval is pending.**

## Exact live identities

- TriMax: https://app.rnlcreations.com — deployment `dpl_8GBEb5E6FXNKqYeamAP2BWGHALW3`, artifact https://trimax-nze46auqt-trimax-s-projects.vercel.app, source `690d42665c39469c16980e666ffe18963338de7d`.
- Release `trimax-maintenance-qr-20261028-rc4`; common executable `8b2838621a89bb88bc92f19d46d17d21b45e3bc2`; bundle `60374b69b87fab8be3a69adf1b00407af7a92094d125ceff39e00ba96e72e330`.
- Public site https://rnlcreations.com remains source `3870857e0238b27a3f575ce48d83b165043af071`, deployment `dpl_J2wyS7i6uetpDFZFG46V9FdQ7mjB`; no RC4 website/environment/credential/migration changes.
- Native runtime `C:/Users/robbi/AppData/Local/Trimax/ocr-native-runtime/qr-rc4`, exact source690d426. Both existing workers healthy/validated; original configuration hashes and task principal/triggers/settings preserved. Only supervisor action source path changed.

## Verified results

- Full RC4 POST: **134/134 PASS, eight retained PASS**, including runtime/database attestations, financial/auth/isolation/photo privacy, lint, TypeScript and production build. Protected receipt `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-28T10-44-05-516Z/gate-result.json`; SHA256 `6b20406d21bec53c6e72e854dd5aed47c9829690d27285095a5aa10eb0d7ad6b`. No tests, time limits or validation controls weakened.
- Prior RC4 PRE READY134/eight retained and source-bound56/56 photo cases retained; no unnecessary rerun of that matrix. Separate exact-source production-configured artifact built, guarded and staged Ready before promotion. Lab artifact was never promoted.
- Root cause: AuthGuard workspace normalization discarded the query string, including `qr`. Two redirects now use the existing query-preserving helper. Authentication, role checks, API permissions and financial/OCR logic are unchanged. Regression fails original source and passes corrected source.
- Actual live website QR -> actual manager sign-in link -> production form preserves `qr` while adding workspace; property locked and `TEST-QR-01` read-only. Existing owner session worked; fresh-password synthetic manager login was separately verified on exact hosted lab Preview. Screenshots/AX retained. No duplicate submission/Queue/permission test.
- Actual production label `07b303a2-6cf4-43e9-b514-7aafc77e956e` decodes256/512 to https://rnlcreations.com/maintenance/07b303a2-6cf4-43e9-b514-7aafc77e956e. Fresh owner management page exposes **Create or find permanent label** and **Print labels**.
- Existing controlled guest `REQ-8a34740a520241a39ab57c27202750f1`: correct property/unit, one complete private photo, no Queue. Authorized synthetic manager `REQ-1459acf7802a401db1f4bee55e653634`: one Queue, exact synthetic client. Two bindings/two owner notifications; two internal pushes provider-delivered, zero customer deliveries. Private photo denial403, unavailable QR404, six public routes200.
- Approved RC4 nonpayment diagnostic legacy `9c100036-b933-4ad9-9b5f-5f43237fddaf` reached Review; shadow `e3fdca8b-61d0-4217-b93c-d3b8683e6b05` completed. Both persisted RC4 executable/bundle/model provenance and `paymentWriteCapability=false`; all nonOCR business/financial table values preserved. Do not enqueue repeats.
- Original financial records preserved. Actual live INV0545 customer print excludes priority/E08 and retains intentional notes and formatted amount. No invoice edit/save/send, payment change or historical PDF overwrite. Customer service-request email/SMS remain disabled on both projects; invoice-delivery settings preserved. No new subscription/infrastructure or credential rotation.

## Prior cutover safeguards retained

RC3 installed exactly seven reviewed migrations atomically; all five fingerprints matched and44 original public tables were preserved. Original intake state restored. Fresh snapshot `20261028T080421Z`:85-table isolated restore comparison;35 Storage objects/63,672,008 bytes;11 role verifiers and1 Vault recovery verified. Archive SHA256 `471aea817499c199d418f872363bb240247ab0a4734c750f2799b000ddbc6fa4` rechecked before RC4. Recovery container stopped. No production customer data entered the synthetic cloud lab. Earlier failed RC3 privacy-assertion receipt and unchanged passing retries retained. Historical rollback tags remain intact;18 crash evidence files retained separately, no cause claimed or raw-log upload.

## Data-preserving recovery against the current unchanged QR schema

Verified fallback is RC3 core `dpl_Hdh9D1ULMAVycdSK1cSjsPfSWhvn` /source `3a9de0b1a1adeb8116b457346f32fa8699c9fa2d` and native `ocr-native-runtime/qr-rc3`. Retain all schema, Storage, newer QR, financial and audit records. No database restore/downmigration or pre-QR manifest/worker rollback.

1. Verify idle claims and known supervisor identity; run protected `worker-qr-rc4-cutover.ps1 -Mode pause`. The original pre-RC4 task XML is preserved without overwrite.
2. Promote the retained RC3 artifact using the authorized CLI: `vercel promote https://trimax-i0c73klm2-trimax-s-projects.vercel.app --yes --scope trimax-s-projects`.
3. Run the same protected helper with `-Mode recover` to restore exact clean qr-rc3 source/task action using existing principal/triggers/configs. Website stays unchanged.
4. Verify live source, catalog, health and unchanged configs. If needed, use a fresh uniquely journaled synthetic nonpayment recovery diagnostic to attest the running RC3 release; do not rewrite old attempt provenance or reuse a completed diagnostic as a fresh result. Complete the matching full POST before declaring recovery verified.

Private operations/proofs: `C:/Users/robbi/AppData/Local/Trimax/invoice-lifecycle-20261026/`, including qr-rc4-cutover-journal.json, qr-rc4-live-manager-return.*, qr-rc4-live-label-management.*, qr-rc4-runtime-after-diagnostic.private.json, qr-rc4-final-worker-health.json, supervisor-before-qr-rc4.xml. Secure database/Storage backup is adjacent `production-backup-20261026/`.

## Owner physical acceptance — ready now

Open https://app.rnlcreations.com/maintenance-labels?business=rnl-creations, select authorized property, enter unit/location and service address, choose **Create or find permanent label**, then **Print labels**. Scan the desired printed code with iPhone Camera, confirm property/unit, and submit one clearly labeled TEST ONLY request. Confirm its exact Service Request and notification tap destination, including after login if required. Do not approve/dispatch/bill that test. Software/browser/provider checks do not establish paper-print or physical-device success; record only the owner's actual result. Customer email/SMS activation stays separate and disabled.
