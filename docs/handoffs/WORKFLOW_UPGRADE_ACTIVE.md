# Workflow upgrade — active checkpoint

## Objective and authorization
Continue the extended customer scheduling, manager photos, communications and website release mission. The owner approved the existing free Supabase lab `yzyfmvoswucyauogueca`, its reviewed schema and synthetic fixtures, private photos, restricted two-RPC login, and lab-only credentials on the two specified Preview branches. The separate approval to set passwords on only the newly created synthetic owner and manager accounts has been executed and verified. No production deployment, migration, worker switch, credential change, real customer message or paid service is authorized in this session.

## Workspaces and candidate
- App: `C:/Users/robbi/.codex/worktrees/workflow-upgrade/trimax`, branch `codex/workflow-upgrade`.
- Executable: `e53add6ca29e1b25f9930923680814c413ab5766`; release `trimax-workflow-communications-20261025-rc7`; seal `9154514`; photo receipt commit `9f8c0e1`.
- Source bundle: `d5f7b967be8e01dee1e157559e4522c51f8d64dfa3490153e21be6c16b055f71`.
- Manifest digest: `5c949fed9b568c0de27a1753faf67b5442018ff196749833935623afff0f2818`.
- Marketing: `C:/Users/robbi/.codex/worktrees/rnl-brand-icons/trimax`, branch `codex/rnl-brand-icons`. Preserve its unrelated/uncommitted `sites/rnl/BRANDING_HANDOFF.md` changes.

## Verified evidence and active operations
- Photo matrix `matrix-2026-10-25T21-43-03-274Z/report.json`: FINAL PASS, 56/56. Source-bound privacy receipt exported, verified and committed. Do not rerun for unchanged source.
- Prior rc6 gate `2026-10-25T21-18-07-636Z`: FAIL only production build, because Windows Application Control blocked native SWC. Preserved. Supported Webpack/WASM build passed; package and full gate now consistently use `--webpack`, with drift/bypass regression. Application Control and prebuild authorization unchanged.
- Current full gate: session `99158`, private directory `2026-10-25T23-16-51-813Z`. Completed READY_FOR_CONTROLLED_DEPLOYMENT: 154 checks and eight retained documents; lint, TypeScript, production build and clean-end checks passed. Privacy-safe receipt exported. Production runtime/database remain the two explicit deployment prerequisites, not PASS.
- Marketing `b631b5867552bf66813ff88cbf0d34108d933ad9`: actual Ready deployment `7uRNCvJeo6pHm1XAGLcwR2D8qjrj`, https://rnl-public-website-l5erbvp0m-trimax-s-projects.vercel.app . Fixed the isolated Next Request wrapper failure and clarified the lab banner. Real wrapped-request regression/build/lint/typecheck passed.
- Actual browser same-day submission PASSED. Reference `REQ-658727cbd933495fb690a962a7250540`; internal request UUID `22832082-1e1f-48a7-a86f-9ce7c027a35f`. Reuse this A request; do not resubmit. Private `website-acceptance.json` and receipt screenshot record it. Prior failed attempt created no record.
- Hosted lab communications database: 13 checks PASS, including leases/retries, activation cutoff, STOP/HELP/START, duplicates, delivery ordering and tenant denial. `communications-db-api-journal.json` records this as database-only simulation. Settings restored to disabled/test. No provider calls or hosted worker HTTP acceptance.

## Actual lab state
All 25 reviewed schema stages applied. Seven catalog comparisons passed after narrowly reviewed lab grant normalization, preserving the original sentinel and two original restricted lab RPCs. Four synthetic identities and two businesses exist. Private photo bucket is provisioned; actual uploaded-object privacy remains pending. Restricted PostgreSQL login has only the two intake RPCs and verified TLS. Existing production credentials were never copied or rotated.

Private bundle: `C:/Users/robbi/AppData/Local/Trimax/hosted-lab-acceptance-20261026/`. `lab-secrets.env` and `synthetic-login-passwords.json` are protected to Robbie and SYSTEM; never print their values. Password helper is resumable and reuses the same saved password. No original/customer identity was changed or email sent.

App lab environment is bound only to Preview branch `codex/workflow-upgrade`; stable origin https://trimax-git-codex-workflow-upgrade-trimax-s-projects.vercel.app . Real email, SMS and push delivery are disabled. Website lab config is bound only to `codex/rnl-brand-icons`, with restricted SQL credentials and strict public Supabase CA. Public website photo intake is still disabled.

## Access and pending approval
Authenticated browser access works. Direct HTTP requests to both Preview projects return302 to Vercel SSO. No CLI credential, callable Vercel integration, existing automation secret or shareable link was found. Do not repeat login procedures or extract browser cookies.

A single pending owner question requests creation of a temporary project-wide Vercel automation token for `trimax`, used only against the verified lab alias and revoked after tests, without setting a deployment environment variable or changing existing protection/credentials. This is broader than lab access because Vercel tokens cover all protected project deployments. Do not create it until the owner explicitly approves. Continue browser/database testing independently.

## Next steps
1. Read the actual completion of gate99158. If PASS/READY, export its privacy-safe receipt, commit metadata, run exact build authorization, then push only the app Preview branch. Verify actual Ready source and stable-alias deployment binding before login/testing.
2. Update this checkpoint with gate and deployment identity. No app hosted full-lifecycle acceptance has passed yet; old rc4 preview is historical only.
3. Log in through the normal app form using the protected synthetic owner/manager passwords. Test A owner review, matching, Queue, same-day schedule, estimate, active Job Session completion guard, completion, invoice and synthetic bookkeeping payment. No direct financial inserts.
4. Private helpers prepared: `acceptance-core.cjs` (A reuse, B restricted intake, denial/conversion/schedule/reschedule/cancel), `acceptance-manager-photos.cjs`, `acceptance-conflicts.cjs`, `acceptance-communications.cjs`, `acceptance-financial.cjs`. Require fresh actual Ready receipts and exact lab guards. Vercel HTTP protection still blocks these runners until approved access is established. Preserve journals before retries.
5. Complete real hosted manager photo upload/private-object/cross-tenant/Queue tests and normal browser review. Assignment revocation and positive trusted-manager direct Queue remain explicitly unverified. Test worker HTTP separately from database simulation.
6. Reconcile implementation report and recovery plan. Present production approval only after actual hosted prerequisites pass; SMS/email provider activation remains separate.

## Production and rollback preserved
App `885d01f18b1811de7f2be8fe33ec9d8858056d20`, deployment `6G2N5TMoymwBRm48NKrtt8Qbr7Xc`, https://app.rnlcreations.com . Actual Ready/Latest Production refreshed before the gate.
Website `7e0ca069a5cbbb2c38aa05e8705113a5cc769e18`, deployment `7nhM28FWzouDAL8HwXyom7fX7VbB`, https://rnlcreations.com .
Rollback `rollback/rnl-marketing-20261017` → `34fa3b47f16890a9de09b253848ecf8a690f4e9b`; `rollback/trimax-service-workflow-20261018` → `4e3d786e12092c5ffde86d8324cd6c23ce6670cf`. Both reverified. Dirty primary checkout untouched.
October19 physical iPhone navigation PASS is historical only. Candidate physical acceptance remains pending. Preserve data/audits and prefer forward repair; no destructive down migrations or snapshot replacement. No background execution is promised after the turn ends.
