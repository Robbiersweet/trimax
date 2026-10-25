# Workflow upgrade — active checkpoint

## Objective and workspace
Implement the October 25 comprehensive workflow/SMS/branding request in isolated candidates, preserving production and financial functionality.
Root: `C:/Users/robbi/.codex/worktrees/workflow-upgrade/trimax`, branch `codex/workflow-upgrade`.

## Baseline verified October 25
- TriMax current production: `885d01f18b1811de7f2be8fe33ec9d8858056d20`, Vercel `6G2N5TMoymwBRm48NKrtt8Qbr7Xc`, `https://trimax-985pnrbl9-trimax-s-projects.vercel.app`; domain `https://app.rnlcreations.com`. Preserve newer remittance/auth repairs.
- Marketing current production: `7e0ca069a5cbbb2c38aa05e8705113a5cc769e18`, Vercel `7nhM28FWzouDAL8HwXyom7fX7VbB`, `https://rnl-public-website-1hahzyvic-trimax-s-projects.vercel.app`.
- Authenticated Vercel browser access works; no authentication action needed.
- App `/book/rnl-creations` returns 404. Its legacy JWT production adapter requires PUBLIC_SCHEDULING_PRODUCTION_ENABLED and SCHEDULING_INTAKE_JWT; neither appears in project variables. Do not enable it blindly. Marketing uses `/schedule` and the approved restricted PostgreSQL backend.
- October 19 physical iPhone notification navigation explicitly PASSED per owner report/screenshot. Preserve evidence; do not restate it as unverified. This is historical acceptance, not acceptance of this candidate.

## Work in progress
- Independent agents: workflow_ui (owner workflow/calendar), sms_implementation (disabled communications backend/test adapter), website_branding (approved logo assets and minimal security patch required by failed build).
- Root: trusted property manager request/direct-Queue flow with explicit assignment/client binding and SQL authorization; integration, regression and release evidence.
- Production source, data, credentials and rollback refs unchanged. Email and SMS stay disabled. No new production test submissions authorized in this session.

## Authorization boundary
Local implementation/tests, commits, pushes and verified previews authorized. New production migrations/deployment, grants/credentials, customer messages and paid SMS activation require applicable specific approval/release gates. Do not bypass build/security/release gates.

## Resume
Read this checkpoint, inspect live agent status and clean/dirty worktrees, integrate only reviewed candidate commits, finish isolated SQL and existing financial/OCR regressions, record hosted preview identity or exact gate blocker. Do not repeat authentication or architecture discovery.
