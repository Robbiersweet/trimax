# Maintenance QR workspace — production release

Live application: https://app.rnlcreations.com
Immutable deployment: https://trimax-hsveeqvrq-trimax-s-projects.vercel.app
Deployment: dpl_59QprQczH6iqQLpMe8z5fd8yj6Rr
Artifact source: ea2b1ec53cbdc7a6112dd9b18b72d25495e7fa73
Executable: 858267f063743ca574d46a0f08019d8e3f75f673
Release: trimax-office-shell-20261029-rc1
Bundle: ebf022f85044c93c5ff0695a7106e68eabf2c442227cd470a32311c8748f3bd3
Website unchanged at 811b7b3a89b84a5c12360b881e4c223df1c31c53.

Interruption diagnosis: no candidate deployment existed when work resumed. Authenticated CLI inspection confirmed old Amcg deployment / source 5f8ddc0 still serving. The raw detail:Bad Request was not found in retained CLI/API deployment evidence, so its exact origin cannot be proved. An earlier two-hour runtime logs API call returned a documented short-retention 400 and succeeded with 30m; this was not a deployment failure. The reproducible PRE failure was stale upgradeContext metadata referencing the preceding release, not an OCR or QR implementation error. Commit 76c6ec2 corrected only the candidate/current release bindings. Actual three failed checks plus clean-boundary checks were reexecuted; 132 passed source-identical checks and eight retained cases were preserved with parent-report digest. Strict gate authorization passed unchanged. No validations disabled or weakened. Build/staging/promotion all completed with supported authenticated CLI, no browser automation or login.

UI: existing AppShell used, sidebar/active section inherited, same-window business-scoped Back to Dashboard, route-scoped selected-card print isolation. Core/backend/API/schema/security sources identical to previous production. Permanent IDs and existing printed codes preserved. Automated React composition/navigation/print-reset and scoped CSS checks pass; deployed HTTP serves new scoped print CSS. No claim of actual desktop/mobile visual or physical printer acceptance in this continuation.

Safety: coherent backup 20261029T073046Z restored in isolated network-none/no-port/no-cron environment: all 88 table hashes/counts match; exact schema/RPC/grant/policy/trigger fingerprints match. Separate 40 Storage objects / 65,211,127 bytes retained privately. No migrations, credentials, production financial data, website deployments, customer requests, Queue/client records or customer messages changed by this UI release. Financial/audit digest comparisons pass. Retained acceptance Office QR 876c0409-1d58-4633-80df-45c7db119a1a → request e1e4090c-221b-47c9-b8d0-d3defd340803 → Queue da8194a0-6701-460b-829b-e7c5e7bad9b3 unchanged; one completed photo, one owner notice, two historical push deliveries, zero duplicates/customer delivery. Existing WINTER25/WINTER100 coupons and unit QR still resolve. No disposable customer/Queue/audit records deleted. Existing crash logs and historical rollback tags untouched.

Native workers: exact clean office-shell-rc1 artifact installed; existing restricted configs/model pins unchanged; existing supervisor task principal/triggers preserved. Both queues inspected idle before switch. One source-bound labeled synthetic nonpayment diagnostic pair completed (legacy review, shadow completed); both recorded exact new release/executable/bundle/schema identity and paymentWriteCapability=false. No real remittance or payment posting used. Retain evidence; do not requeue.

Recovery (no database restore needed): use protected office-shell-20261029/promote.cjs recover to promote previous Ready Amcg deployment (https://trimax-cccf0dpye-trimax-s-projects.vercel.app, source5f8ddc055ab617fa36942ac264e6ea31cdd9e634); inspect worker queues idle; worker-shell-cutover.ps1 -Mode pause then -Mode recover restores exact office-coupon-rc1 source5f8; verify supervisor health, runtime identities, live source and HTTP. Do not roll back to pre-Office QR RC4/new-schema recovery source. Both current/prior deployments and native runtimes retained. No production data restore or credential changes for app-only recovery.

Owner navigation: TriMax main sidebar/Menu → Maintenance QR Labels. Back to Dashboard returns same business in same window. Select existing North Creek property and Print cards; existing Office QR remains https://rnlcreations.com/maintenance/876c0409-1d58-4633-80df-45c7db119a1a. Physical iPhone test PENDING: print selected card, scan with Camera, verify trusted property, choose unit/area; do not submit a real work request solely to test navigation. Customer email/SMS remain disabled. No owner action blocks this UI deployment.

Private operational evidence: %LOCALAPPDATA%/Trimax/invoice-lifecycle-20261026/office-shell-20261029. Keep outside Git; do not expose private catalogs, runtime attestation payloads, raw logs or credentials. Public photo receipt holds verified unchanged-source 56-photo matrix.

Final verification: 137 POST checks PASS; 8/8 retained acceptance cases PASS; production build, lint, TypeScript and clean-source boundary PASS. Physical acceptance remains PENDING. New PRE includes all 137 required checks authorized unchanged; 56 source-bound photo cases PASS retained.
POST report SHA256: 6e453fbad50f9007e2268acfac3c6fe7717c29d905dc1fc8c00983b429ade3b3
Protected POST report: C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-29T08-26-22-248Z/gate-result.json
Final verified production source: ea2b1ec53cbdc7a6112dd9b18b72d25495e7fa73. Handoff commits after that SHA are documentation/evidence only.
