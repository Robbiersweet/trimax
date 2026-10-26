# Invoice repair active checkpoint

## Objective and workspace
Repair draft editing/discount usability and separate deposit delivery from final issuance. Base: actual deployed 885d01f18b1811de7f2be8fe33ec9d8858056d20. Worktree C:/Users/robbi/.codex/worktrees/invoice-lifecycle-repair/trimax; branch codex/invoice-lifecycle-repair. Production unchanged. This is independent of rc10 and its blocked 15-migration cutover; do not cherry-pick this financial migration into it.

## Verified evidence
- 1a1ffbd (2026-07-29) moved correction/edit controls into More Actions. Draft workflow card excluded split groups; sent edit link opened an editor that refused saving. Paid invoices were intentionally ineligible for existing supersede workflow.
- Read-only production audit for owner-selected INV-0404: deposit requested, manual status_updated(sent), batch payment applied. No correction/supersession or email delivery event in the invoice-ID/referenced-ID query. This is evidence of absence in queried history, not proof that no external delivery ever occurred.
- FreshBooks CSV found in Downloads: source invoice was draft, named first work line, blank second name AND description. Terms are absent from saved invoice. Export dates are 30 days apart, not evidence of agreed terms. Owner now proposes Net30 from actual final issuance; discount undecided. Never mutate this invoice or send without final approval.
- Private original row/audit/source evidence: %LOCALAPPDATA%/Trimax/invoice-lifecycle-20261026. Includes source hash/filtered CSV rows, scoped audit UI, lab schema-before and remaining test results. Do not commit private records.
- Separate verified code defect: deposit panel transmitted ordinary send purpose; server marked entire invoice sent and recorded ordinary invoice email proof. INV-0404 itself used manual status change, so do not falsely attribute its history to the email defect.

## Candidate changes
- Visible existing draft edit/discount and sent correction controls, without removing paid-correction protection. Missing email proof no longer says definitely not sent.
- Explicit deposit email purpose, distinct delivery audit, no final sent mutation; ordinary send cannot accidentally submit an active deposit. Manual Mark Sent now explicitly confirms final issuance, blocked for active deposit.
- Draft deposits collectible without marking final invoice sent. Paid draft remainder remains unissued/non-overdue. Existing issued obligations remain untouched. No global reinterpretation of legacy sent records.
- Deposit PDF/email no longer borrows final due date/terms. No invented deposit receipt event inferred from any partial payment.
- Editor no longer writes amount_paid. Atomic draft-save RPC validates cents/tax/discount, locks existing invoice, checks version/status/business access, preserves payment and split links, saves old invoice/items in mandatory audit, and rolls back all changes on audit failure. Existing split-child editing preserved; split-source changes require group review. New import_reviewed marker allows an actually reviewed imported draft to pass existing send eligibility.
- Independent candidate SQL: supabase/sql/2026-10-26-invoice-draft-atomic-save.sql. Adds import_reviewed and SECURITY INVOKER RPC restricted to authenticated, existing owner/admin/accountant role + existing RLS. Not installed in any hosted database. Current editor requires this migration; do not deploy code alone. No fallback to old non-atomic save.

## Verification
PASS: TypeScript, changed TS/TSX ESLint, diff whitespace, discounts/services, cent persistence, correction, split sends, detail declutter, payment timing, reminders. New in-memory PGlite authenticated/RLS tests: paid-deposit preservation, total-below-payments rejection, wrong business, stale version, issued refusal, no anonymous execute, mandatory-audit rollback restoring every old line. Actual send route with mocked provider: deposit proof without sent mutation; final send still issues; no external requests.
Full npm test initially stopped at obsolete editor mock (rpc absent). Updated mock to new actual persistence boundary. Stabilization group then PASS. Every remaining group from test chain separately PASS (OCR shadow, remittance history, photo evidence/financial/privacy, mature fallback, pixel/localization/ownership). Do not call original failed invocation a single clean pass. No production build/release-gate or hosted/browser acceptance yet.
Read-only lab catalog verified yzyfmvoswucyauogueca: expected columns and role helper; RPC/import_reviewed absent. Dates are text, matched in local SQL fixture. Hosted RLS/triggers/constraints and full permissions still require actual lab acceptance.

## Outstanding / exact resume
1. Review independent migration and candidate changes before hosted install. Previous specific migration approvals were scheduling/rc9/rc10; do not treat them as production financial permission. Resolve any genuinely required action-time approval for new hosted RPC grant once scope is concrete.
2. Install/test only existing synthetic lab if authorized; do not touch production financial rows, credentials, source customer data, or real messaging. Validate actual lab RLS, existing triggers, failure/rollback, paid-draft edit, import review, PDF, send purpose, issuance dates and lifecycle across list/dashboard/reminders/reporting. Add current tests to release evidence; all new data synthetic.
3. Complete preview release identity/build gates; hosted visual/owner review. Candidate is NOT production-ready and no invoice is cleared for sending.
4. Prepare explicit audited classification correction for owner-selected legacy deposit-only invoice (not superseding or moving payment). Must preserve original status-change/payment/audit facts. Require owner approval before applying. Do not globally suppress genuine overdue invoices.
5. User enters chosen discount and reviews corrected work description (blank source line cannot be recovered from available export), explicit final issue date + agreed Net30 due date, unchanged recorded deposit, PDF. Send only with final owner approval.
6. Production backup prerequisite and separate release approval/gates still apply. SMS/customer email activation and unrelated website/scheduling work unchanged.

Resume here, preserve completed tests and working implementation. No background work after turn ends.
