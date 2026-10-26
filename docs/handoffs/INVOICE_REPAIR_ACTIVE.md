# Invoice repair active checkpoint

## Objective and authority
Candidate invoice repair, worktree C:/Users/robbi/.codex/worktrees/invoice-lifecycle-repair/trimax, branch codex/invoice-lifecycle-repair. Lab/preview work authorized. No production financial mutation, INV-0404 change, customer delivery or credential rotation authorized. Production and rollback checkpoints unchanged. No background operations remain running.

## Exact source and published preview
- Executable 041dbf50f746035a1079b8043cedf9de9eef2c9a; normalized bundle 308d271c60a3257bf6b81874af98f8722625dd4bd9a498aa09bbce204696cfdb.
- Preview metadata revision d2cdc6e660190b61d44e548a81fb0d41ac29b7fc; Vercel Ready, deployment EXRQ6Q17kDAe6zTBXaJrBMQpU7XJ.
- https://trimax-lw0iqxsvu-trimax-s-projects.vercel.app/ ; branch alias codex/invoice-lifecycle-repair. This handoff-only commit is not the deployed revision.
- Branch-only Preview configuration points at lab yzyfmvoswucyauogueca. Messaging/provisioning disabled, provider placeholders invalid. Production/shared-preview configuration unchanged.
- Production remains 885d01f18b1811de7f2be8fe33ec9d8858056d20, deployment 6G2N5TMoymwBRm48NKrtt8Qbr7Xc. Existing rollback tags unchanged.

## Exact release failure causes and repairs
1. Inherited manifest pinned old rc6 source; resealed reviewed executable. Database fingerprints explicitly describe current PRE-migration production baseline, not post-migration state.
2. Worker configuration discovery used wrong defaults. Actual approved supervisor configs under %LOCALAPPDATA%/Trimax/ocr-native-runtime/config used without changing workers.
3. Photo receipt binds all executable paths, including harnesses. Changed tests legitimately invalidated it. Replayed final source; no hash editing or weakened validation.
4. First full gate found two CJS harness lint errors. 29baba7 fixed imports/createRequire and reserved variable naming; no assertion removal/lint suppression.
5. Actual PDF generation revealed active src/proxy.ts omitted trusted print pathname (inactive root proxy had it). 041dbf5 derives header from URL for initial/refreshed responses, preserves bearer/cookie refresh/RLS, overwrites spoofed values. Regression passed.

## Completed evidence: reuse, do not repeat
- Single financial migration installed ONLY in lab: supabase/sql/2026-10-26-invoice-draft-atomic-save.sql, SHA256 76f8f4813b0dce8e94334b9eb0c83a4a00ee0086d651004108d86b195b6b49e6. Atomic audited draft saves preserve payment/client/deposit/split relationships; authenticated owner/admin/accountant + RLS; anonymous denied.
- Hosted lab database PASS: dollar/% tax, stale/concurrent one-winner, manager/customer/anonymous/cross-business/issued/protected-field/below-payment denial. Mandatory audit failure rolled back invoice and original line UUIDs. Do not reinstall/retest unchanged SQL.
- Final photo matrix 56/56 PASS: %LOCALAPPDATA%/Trimax/photo-robustness-20261022/matrix-2026-10-26T12-49-43-537Z/report.json. Receipt committed 8e6427b.
- Full gate %LOCALAPPDATA%/Trimax/release-gates/2026-10-26T13-04-52-945Z/gate-result.json finished 13:24:21Z: READY_FOR_CONTROLLED_DEPLOYMENT, 128 PASS plus one production-runtime-attestation DEPLOYMENT_PREREQUISITE. All regressions/eight retained cases/both engines/lint/TS/build/clean-source/current-production-schema pass. Report SHA256 51c106a4bbf9f06c89751900d4e63c6433e40f0aa3a72ff596abb65c85263b93. Privacy-safe complete-verdict receipt in d2cdc6e; unchanged authorize-build passed. Old failed/incomplete evidence never promoted.
- Local actual application-generated native/FreshBooks/deposit PDFs: one page each, visual/text/amount PASS; unauthenticated print denies disclosure. This is local renderer with hosted LAB, not hosted attachment acceptance.

## Hosted browser acceptance on d2cdc6e
- Existing synthetic-owner normal login returns directly to requested invoice; no new authentication needed.
- Native Edit Invoice and discounts restored. Fixed $75 on $1,000: tax $91.58, total $1,016.58, paid $500, balance $516.58; saved and persisted.
- Percentage 10%: tax $89.10, total $989.10, paid $500, balance $489.10; saved/persisted with mandatory prior-state audit. Native fixture remains draft at these amounts.
- FreshBooks-marked fixture saved with $25 discount, tax $96.53, total $1,071.53, paid $500, balance $571.53. Import reference/notes/review flag preserved.
- Dates Oct26/Nov25 and Net30 retained. Read-only hosted-ui-database-verification.json confirms amounts/payment/deposit states and prior-line audits.
- Requested-deposit fixture: $500 deposit due/$599 remaining after deposit; final issuance disabled with explicit deposit-only reason. Print uses Separate payment request, See deposit agreement and separate final terms.
- Unpaid issued fixture exposes Supersede This Invoice and correction reason/replacement review. Canceled without making replacement. Paid issued fixture shows payment-preserving-review requirement, no edit/supersede shortcut.
- Hosted native/imported/deposit customer print pages render correct amounts/dates/terms; screenshots saved. No actual customer communication, final issuance or physical iPhone acceptance performed.

## Remaining hosted blocker: verified exact cause
Server PDF attachment preflight FAILED. Initial missing lab sender correctly blocked. Temporary pdf-preflight@example.invalid sender allowed validation only (no provider activation). Chromium then redirected from lab print URL to Vercel Login, so no print-ready marker. Human authenticated print page works.
Exact runtime trace 25c82119-80dc-4c67-9f69-86e40bf16131 at 2026-10-26T13:38:40Z on EXRQ6Q17kDAe6zTBXaJrBMQpU7XJ; evidence hosted-pdf-runtime-diagnostics.txt. No provider send. Do not repeat browser login or claim hosted attachments passed.
Next: explicitly authorized server-to-server renderer access through protected preview, constrained to verified deployment, without logging credentials/production use. Current renderer does not forward a Vercel automation credential. Security-sensitive expansion requires applicable action-time confirmation; source changes require new source-bound acceptance. Do not disable project protection or weaken PDF validation.

## Cleanup and evidence
Private evidence/scripts: %LOCALAPPDATA%/Trimax/invoice-lifecycle-20261026, outside Git. Temporary native invoice estimate_id restored to original NULL; temporary sender restored to original value or blank if new. cleanup-verification.json PASS 13:43:58Z: draft/$989.10/paid500 preserved, no send/status audit, no rows/audits deleted. Labeled synthetic Queue/estimate/correction fixtures retained. Do not duplicate them. verify-hosted-ui.cjs expects native/imported/deposit drafts.
One LAB service-role key appeared in an earlier environment-form tool trace. No production key exposed. Owner informed; no unauthorized rotation. Separate authorized lab-key cleanup remains. Subsequent form output redacted.

## INV-0404 and production release
No verified safe existing TriMax shortcut can edit/finalize this partially-paid sent invoice with requested discount/description/date corrections. Old editor/status-reset shortcut unsafe; paid correction intentionally blocked. Do not duplicate invoices, move/delete payments, mark paid or bypass lifecycle guards. No live FreshBooks correction/send workflow verified. Export recovered first work line; original second name/description blank.
Owner intends Net30 from actual final issue; 30-day historical interval alone does not prove terms. Discount undecided. Private INV-0404-CONTROLLED-CORRECTION-PROCEDURE.txt prepares a separately approved, audited deposit-only reclassification only after fresh history review, preserving payment/allocation/split/audit relationships. If already final-issued, reviewed financial correction required instead. No change/send without owner approval of description/discount/dates/unchanged payment/PDF.
Production still requires complete recoverable backup plus secure isolated restore rehearsal. Administrator password not located; 35 Storage objects inventoried but not backed up. CLI/Docker/synthetic rehearsal prepared in backup workstream. Secure original credential or explicitly authorized coordinated reset/user entry required; no reset authorized. No production customer data in lab. Then reviewed post-migration fingerprints, matching runtime/worker compatibility, controlled financial deployment approval and production/physical acceptance. Recovery must preserve financial/audit changes, never destructive downmigration/stale financial restore.

## Exact resume
Reuse completed gate and hosted UI evidence. Resolve only protected-preview server PDF access, complete actual attachment preflight without sending; reseal/replay only if executable inputs change. Coordinate production backup prerequisite separately. Preserve production, INV-0404, payments/audit history and rollback tags. No background work continues after this turn.
