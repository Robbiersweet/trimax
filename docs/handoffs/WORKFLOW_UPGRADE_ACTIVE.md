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

## Candidate implementation and evidence
- Integrated atomic approval/client matching/one Queue conversion, calendar blocks/buffers/revisions, scoped property request/direct Queue access and owner settings.
- Integrated disabled-by-default Twilio/test communications, consent/suppression/signed callbacks, reminders, estimate/invoice/recorded-payment milestones, inbox, expiring customer links, additional-information replies and detailed read-only customer documents. Real sender/carrier/delivery acceptance remains outstanding.
- Integrated gated request photos with memory-only capability, hash-bound idempotent intake, image decoding/metadata removal, bounded upload, private-storage retry verification and owner-authorized viewing. Proposed private bucket has NOT been provisioned. Hosted permissions/storage and independent PostgreSQL concurrency remain unverified.
- Root TypeScript and npm test passed after PromiseLike handling repair. Full earlier gate retained all eight real OCR documents on both engines and passed workflow/financial/tenant tests, but overall FAILED for stale physical-photo receipt, SQL test NODE_PATH and the now-fixed TypeScript issue. It is not release approval. Final executable requires fresh 56-case photo matrix, metadata seal and complete gate rerun.
- Exact production catalog reproduced before candidate migrations; website stays two RPCs/no tables, historical intake three RPCs/no tables, anonymous scope unchanged. Seven-migration projection passed; photo migration projection is being added before final seal.
- Marketing branch `codex/rnl-brand-icons` at `19ab1cf1dd37509fb5b4f91f325099232c6b1b05`: branding, optional consent and gated photo UI. Local build/lint/types/81 checks passed, pushed for preview. Prior exact26f6a37 preview GLV3gyGfkQuk4dDNjT1mcqh1uP1X was verified Ready; latest19ab1cf preview5vLNVxD7yJoqXPFQz6SFh7eDop85 observed Building, not yet accepted.
- Production source, data, credentials and rollback refs unchanged. Email and SMS stay disabled. No new production test submissions authorized in this session.

## Authorization boundary
Local implementation/tests, commits, pushes and verified previews authorized. New production migrations/deployment, grants/credentials, customer messages and paid SMS activation require applicable specific approval/release gates. Do not bypass build/security/release gates.

## Resume
Read this checkpoint, inspect live agent status and clean/dirty worktrees, integrate only reviewed candidate commits, finish isolated SQL and existing financial/OCR regressions, record hosted preview identity or exact gate blocker. Do not repeat authentication or architecture discovery.
