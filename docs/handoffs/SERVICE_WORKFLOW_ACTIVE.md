# Service request workflow — active checkpoint

## Objective and boundary
Complete October 18 request integration, isolated verification and preview. No production writes, migration installation, customer messages or production deployment authorized for this task. Preserve OCR/payments/invoices/Queue completion/Job Sessions and the live marketing portfolio.

## Workspace and release
- Candidate: `C:/Users/robbi/.codex/worktrees/service-request-workflow/trimax`, branch `codex/service-request-workflow`.
- Verified internal production: `4e3d786e12092c5ffde86d8324cd6c23ce6670cf`, Vercel `DbJBRGrnwsbdAC24egTmPahUN6LV`, `https://app.rnlcreations.com`.
- Remote rollback tag verified: `rollback/trimax-service-workflow-20261018`, same commit.
- Public marketing remains separately deployed at `c949e86ca95c8289c654344239312c55a930bc27`; preserve `rollback/rnl-marketing-20261017`.

## Verified diagnosis
Read-only production SQL on October 18: notification table exists; INSERT trigger enabled. October 18 request has exactly one stored notification for a current owner, already read. October 17 later request likewise has one read notification; earlier request has none. Previous migration deliberately omitted historical backfill. Two active push subscriptions belong to owners. Three in-app outbox events remain pending. Deployed source has no service-request push dispatcher, though Queue uses web-push/VAPID/subscriptions. Thus background push was never connected; database notification persistence works for the two later requests. Exact cause of the owner's visual observation is not established by this evidence. No physical-device acceptance yet.

## Next
Implement atomic owner conversion/scheduling using existing clients and Queue/calendar; extend existing notification/outbox and web-push; prepare existing Resend email path; neutral urgency; isolated SQL/UI/regressions; current official SMS comparison; sealed preview and physical procedure. Executable candidate 335f36d9c9df00d88547b0bedefa19bff7dc6d42. Isolated SQL 60 checks PASS; workflow/timezone/template unit checks PASS; seven public scheduling scripts PASS; protected npm test PASS; TypeScript PASS. Synthetic owner UI approval/conversion/scheduling exercised at 390px with no horizontal overflow. Full release gate next. Three candidate migrations remain uninstalled. Public urgency branch codex/rnl-service-urgency at aa76c47 based on approved marketing; website build and 78 boundary checks PASS.

## Recovery
Before a later authorized release, retain the exact Vercel production deployment above. Web recovery: promote that retained deployment in the Trimax project (not the marketing project). No database migration has been installed by this task, so no database rollback is currently necessary.
