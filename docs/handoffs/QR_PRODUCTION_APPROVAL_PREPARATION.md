# QR production approval — verified RC3 checkpoint

Updated 2026-10-28. **QR is preview-only. No production QR migrations, credential provisioning, worker switch or deployment is authorized yet.**

## Exact candidate and completed operations

- Core checkout: `C:/Users/robbi/.codex/worktrees/qr-production-integration/trimax`, branch `codex/qr-production-integration`.
- Common executable: `0ed4de54192fa0f1d4c51419ddb7994b9122bc50`.
- Release: `trimax-maintenance-qr-20261027-rc3`; source bundle `2901eed59966baf4d34490804f648298e1c4434a48cbae41e84a3f3ea8b8728d`.
- Core deployed Preview source: `838489803a6b79f883381cdfcba1f48aae354f4b`; deployment `dpl_8ts2Cmuy1f7iCAnW6KPFiYdSQ7Ya`, Ready.
- Website checkout: `C:/Users/robbi/.codex/worktrees/rnl-qr-intake/trimax`, branch `codex/rnl-qr-intake`; source `3870857e0238b27a3f575ce48d83b165043af071`; Ready Preview `dpl_4zUR1BXWonDX4m9rpDtZTkEj4pGa`.
- Core lab: <https://trimax-qr-lab-trimax-s-projects.vercel.app/maintenance-labels?business=trimax-acceptance-20261026-a>.
- Working synthetic QR: <https://rnl-qr-lab-trimax-s-projects.vercel.app/maintenance/e3e43df5-5ce7-4c79-b0cc-b439d306e606>.
- Both Preview aliases, source/project identities and unchanged production aliases were freshly verified after the desktop restart. No QR build/test process or Docker container remained running. Do not restart completed pipelines.

## Verified repairs

1. Manual prebuilt Vercel previews did not inherit branch-specific server settings merely from Git metadata. Explicit protected, lab-only runtime configuration fixed the deployed QR/photo endpoints. Verify actual runtime behavior; Vercel deployment metadata does not enumerate these overrides reliably. Never promote this lab-configured artifact to production.
2. The workspace guard normalizes UUID URL parameters to workspace slugs. The label API now resolves a slug using the caller-authenticated business lookup, then calls the unchanged owner/admin-gated UUID RPC. UUID, slug GET/POST and unavailable-workspace denial regressions pass.
3. RC2 correctly failed TypeScript/build because a Next route page accepted custom `loginHref` component props. RC3 moves the unchanged UI to `MaintenanceLabels.tsx` and uses a parameterless route wrapper. Generated route types were retained, not deleted or excluded. The new regression and full build pass. RC2 failed evidence remains retained.

## Acceptance evidence — complete without duplicate submissions

- RC3 full PRE: `READY_FOR_CONTROLLED_DEPLOYMENT`, 134 checks: 132 PASS, two expected production database/runtime deployment prerequisites, zero FAIL; all eight retained cases PASS.
- Full private receipt: `%LOCALAPPDATA%/Trimax/release-gates/2026-10-28T02-52-36-575Z/gate-result.json`; SHA-256 `ada5a0bdad08b234be5f46ef8c01b145d1de12eded20e5b3d0911b86aad1c6a9`.
- RC3 source-bound photo matrix: 56/56 PASS, `%LOCALAPPDATA%/Trimax/photo-robustness-20261022/matrix-2026-10-28T02-37-11-147Z/report.json`.
- Exact clean Linux/Node24/Vercel64 Preview build PASS, including unchanged OCR orientation limits and server-environment boundary. No validation weakened.
- Website routing/security/submission-runtime checks retained; updated 34 canonical modules, lint, TypeScript, hosted build and actual label UI pass. Twelve reachable client modules contain no server-only credential references.
- Actual hosted guest form submission/private synthetic photo and manager direct-Queue submission passed previously and were retained. Guest request `REQ-b5bc647ae91b408a8857d62d9bb5ced6`; manager request `REQ-a3caaae73f954fd6a417d811d8c2ef06`, Queue `efba2a10-26a0-4ff0-ae58-771d9d297b1a`. SQL evidence shows one binding/notification per request, one manager Queue and no guest Queue. Original lab permissions remain restored; only approved dedicated synthetic assignment727 is used.
- Final exact-source core browser acceptance after restart: owner login, workspace-slug label listing, correct property/unit and enabled print control PASS. Existing guest/manager requests remain visible. Guest address/unit, authorized private photo link and owner notification confirmed; notification opens the corresponding request. No new request, Queue or permission mutation was needed.
- Hosted create-or-find preserves permanent label `e3e43df5-5ce7-4c79-b0cc-b439d306e606`. Actual hosted artwork decodes at256/512 pixels. Workspace isolation/idempotency and owner/manager authorization regressions passed.
- Private screenshots, redacted AX proofs and prior hosted readbacks: `%LOCALAPPDATA%/Trimax/hosted-lab-acceptance-20261026/`, including `qr-final-core-labels.png`, `qr-final-core-request.txt`, `qr-final-owner-notifications.txt`, `qr-rc3-hosted-label.svg`.
- Honest physical boundary: Print labels was invoked but the in-app browser did not expose the system print dialog; no paper-print success claimed. Viewport override had no measurable effect and is not mobile evidence. Printed-label/iPhone scan and current-release physical notification acceptance remain owner checks after controlled production activation.

## Production compatibility and reviewed package

Production remains TriMax `16313c23e2203a700f359aa03963756000d18750` / `dpl_EqiC6JrbiAueE8DHwf8PEGezGC3D`, website `f9da1b1bd69c9e44fe639fd322f76d5bf76bf003` / `dpl_7T5cUBUEdY3nU9zgNKC8rDZqCjg6`. Live invoice privacy remains deployed. Invoice/payment/estimate/Queue/Job Session/OCR/service-worker source is unchanged in the candidate. No production financial records or credentials were modified.

Seven exact migrations, in order:

1. `20261027_qr_photo_compatibility.sql`
2. `20261025_property_request_intake.sql`
3. `20261025_property_request_access.sql`
4. `20261026_request_photo_candidate.sql`
5. `20261026_property_request_photos.sql`
6. `20261026_property_request_preferences.sql`
7. `20261027_maintenance_qr_intake.sql`

Private package/transaction: `%LOCALAPPDATA%/Trimax/invoice-lifecycle-20261026/qr-production-package.json` and `qr-production-migration.sql`. Package SHA-256 `3e6e0702943f5bee4c1a030eb13135632e3fae9c732c001d1ed273738ba602fe`. No financial migration, automatic real-property mapping, SMS trigger or broader15-migration bundle.

The transaction was rehearsed against the isolated local recovery database with networking/ports and cron execution disabled, never the synthetic lab. Existing values across44 public tables were preserved; all five baseline/projected catalog hashes matched; ordinary Option C submission/retry passed under the unchanged restricted role's original two RPCs. The rehearsal rolled back and the recovery container was stopped. Latest read-only production catalog matched the reviewed baseline. Recheck live catalog and refresh complete database/Storage backup immediately before any approved writes.

## Single coordinated approval scope — not yet authorized

After fresh backup/recovery and live-state preflight pass:

1. Briefly fence intake and pause idle workers, retaining exact flags, tasks, configurations and cron credentials.
2. Apply exactly the seven pinned migrations as one transaction; verify projected catalog and preservation checks before commit; roll back on mismatch.
3. Provision the **existing production service-role key into the website's Production server environment only** for scoped QR/photo handlers. This key has project-wide RLS-bypass power; it must never reach browser code, logs, screenshots or Preview environments. No new key/rotation. The old restricted Option C role remains unchanged.
4. Build both verified sources with production configuration through existing release guards, coordinate paired production deployments and compatible native worker synchronization, then restore intake/worker state. Do not promote the lab artifact or copy lab configuration into production.
5. Complete POST gate/runtime/worker checks, ordinary public forms/links and invoice privacy readback. Run one labeled synthetic guest QR/photo/owner-notification case and one dedicated synthetic manager direct-Queue case; no dispatch, billing, real-property permission changes, financial writes or customer communications. Retain audit evidence.
6. Keep service-request customer email and SMS disabled; preserve existing invoice-delivery settings and all existing credentials/rollback checkpoints. No paid services.

Recovery before commit: transaction rollback, existing deployment unchanged. Recovery after commit: preserve additive schema and newer data, disable QR/photos and retain compatible privacy/financial application/workers. Do not restore an older database over current financial data or blindly roll an old manifest/worker back against the new schema. A broader rollback requires pausing claims and resealing the known privacy executable for the retained schema.

## Exact resume

Read this checkpoint and the sealed manifest. No more development/test reruns are needed for unchanged source. Await the owner's one consolidated approval for the scope above; then perform fresh backup/catalog preflight and the controlled cutover. If approval is absent, do not mutate production. Physical owner checks remain explicitly pending.

Separate desktop crash evidence was collected privately under `%LOCALAPPDATA%/Trimax/codex-crash-evidence-20261028/`; it is not release source or proof of a diagnosed crash cause. Do not upload raw logs without review/authorization.
