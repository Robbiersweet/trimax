# Public scheduling: rc10 integration and review Preview

## Scope

This is a synthetic review Preview, not production activation or a sealed OCR release. Production remains `trimax-release-contract-20261009-rc10`, deployed commit `9f8f48b851a249caa75c0dc5bdc632f134c1c1c3`. No production migration, business write, worker operation, notification send, production flag change, or main-branch merge was performed. Physical OCR acceptance remains PENDING and is unrelated to this review.

## Preserved history and integration

- Worktree: `C:/Users/robbi/.codex/worktrees/trimax-public-scheduling/trimax`.
- Branch: `codex/public-scheduling-foundation`.
- Original clean HEAD: `14c07f87038e9816f04f0f62ec92a6f847b11138`.
- Phase 1 implementation: `61da581bddf51c78833229869a486fd82b1c39dc`, followed by `049e444231c890c0af53a21fe95a02301707a97a` and its handoff commit.
- Phase 2 implementation: `baef03028fb41bea9a782acf589158f4848b31e8`, followed by `14c07f8` documentation.
- History-preserving merge: `61f3b27031f4ffcc0db052fb8816d926f27c471f`, incorporating exact verified rc10 `9f8f48b851a249caa75c0dc5bdc632f134c1c1c3`.
- Preview isolation: `d47f466797b380364006e30e0e8fa5c92c8c47df`.
- Vercel command-length correction: `e49ab0da8369e912802070bb7ffbf01e84c6c7fe`.

Complete pre-merge scheduling patch, original status, and original HEAD were preserved under `C:/Users/robbi/AppData/Local/Trimax/scheduling-rc10-preview/`. The original worktree was clean; no implementation was lost, reset, stashed, or squashed. The only merge conflict was `package.json`: both the scheduling test command and all rc10 release scripts were retained. rc10's dependency versions and lockfile won unchanged. The original dirty main workspace and production worker worktrees were not modified.

## Protected baseline

A source-diff allowlist against exact rc10 passed. Differences are scheduling modules/routes/tests/migrations/documentation, the existing scheduling `RouteAccessBoundary` in root layout, the scheduling test command, and explicit Preview build dispatch. No differences exist in OCR routes, orientation implementation, recognizers, payment application, remittance matching, worker entry points, queue lifecycle, correction/split logic, `AuthGuard`, `proxy.ts`, `package-lock.json`, `scripts/release`, or the release manifest.

The public boundary is restricted to `/book` and one slug segment. `/schedule`, `/admin/service-requests`, nested/spoofed book paths, and other internal routes retain employee authentication and server-side authorization.

## Preview isolation and configuration

`reviewEnvironment.ts` permits the synthetic server adapter in exactly Vercel Preview on `codex/public-scheduling-foundation`, with the explicit enabled flag. Local non-production development remains supported. Production, another branch, missing flags, and a production-mode process without Vercel Preview context fail closed.

Vercel variables are scoped ONLY to Preview / `codex/public-scheduling-foundation`:

| Variable | Value | Purpose |
|---|---|---|
| PUBLIC_SCHEDULING_DEV_ADAPTER | enabled | Explicit temporary synthetic store |
| PUBLIC_SCHEDULING_VISUAL_FIXTURE | enabled | In-memory owner review fixture |
| SUPABASE_SERVICE_ROLE_KEY | preview-disabled | Override inherited production credential with inert text |
| RESEND_API_KEY | preview-disabled | No notification credential |
| VAPID_PRIVATE_KEY | preview-disabled | No push credential |
| CRON_SECRET | preview-disabled | No live cron credential |

The project previously shared live secret values between Production and general Preview. Branch overrides avoid loading those live privileges in this review. Original Production/general Preview values were not edited or revealed. Existing public Supabase URL/anon key remain for normal authenticated app access; the scheduling submission path does not use Supabase. No restricted OCR worker credential is supplied.

The Preview build requires all six exact isolation values. It logs that this is not a sealed rc10 release. `vercel.json` dispatches through a scheduling-specific wrapper; for every other environment/branch the wrapper requires and runs the original rc10 build command, including remittance gate and `npm run build`/sealed prebuild authorization. `scripts/release/*` is untouched. The scheduling Preview uses `next build` directly after its tests/lint/TypeScript; it does not claim the modified scheduling source matches the rc10 manifest.

Preview submission accepts only synthetic `@example.test` email addresses and shows an explicit review-only warning. The existing server validator, bounded body, exact-origin check, idempotency checks, consent validation and request-only semantics remain in use. The Preview ignores arbitrary configured storage directories and writes only beneath the deployment's OS temporary directory (`trimax-scheduling-preview/<deployment-id>`). It has no production tables, service-role client, Queue/client/job conversion, or notification adapter. Temporary files are not durable across instances/deployments and are not suitable for real customer intake.

`/book/demo` uses only component-memory synthetic fixtures. It cannot access any server store or authenticated API. This is the owner UI review surface, not an authentication bypass for `/admin/service-requests`. The latter's owner/admin membership checks remain intact; no production workspace binding is configured for scheduling.

## Validation

- Public scheduling domain, storage, boundary, authorization, owner workflow, settings, production adapter/abuse/capability/outbox/conversion tests: PASS.
- New Preview environment tests: PASS (exact branch/environment; Production denied; missing flags denied; arbitrary storage directory ignored; visual fixture blocked in Production).
- Phase 1 disposable SQL/RLS test: PASS.
- Phase 2 disposable SQL/RPC/tenant/idempotency/outbox/capability test: PASS.
- SQL tests used `C:/Users/robbi/AppData/Local/Trimax/phase6-dbtest/node_modules/@electric-sql/pglite/dist/index.js`, never a production connection.
- rc10 regressions: orientation direction fallback, native capture/lifecycle, durability/object upload, evidence persistence, legacy jobs, shadow/canonical, foundation/layout/fields/invoice/fusion/resolver/payment-evidence/total/identity/semantics, physical rows, money/shared money/residual, dataset, remittance matching/contracts/retry, duplicates, payment application/state lifecycle, corrections/splits, tenant isolation, business-read isolation, owner-server auth, account management, and stabilization: PASS.
- Lint: PASS. TypeScript: PASS. Local optimized production build: PASS, 48 static pages generated and dynamic public/owner routes present.
- No fresh physical scan or OCR job was run.

Initial local validation issues were corrected without editing rc10 tests: the evidence-persistence test needed its existing PGlite argument; remittance source assertions required preserving the original guard command visibly in `vercel.json`; old Linux `.next` reparse-point artifacts prevented a Windows build and were moved to private evidence before rebuilding. No worker dependency directory was touched. Logs of the initial batch remain in `rc10-regressions.log`; successful reruns supersede those invocation/configuration failures.

The first merge-only remote Preview was blocked by the unchanged sealed release guard. The first explicit Preview configuration was rejected before build because its command exceeded Vercel's 256-character limit (`FDGLfjvokuvHL3U2KMKSfThcuKjE`). The corrected wrapper command is 193 characters. Neither failed deployment changed production.

## Review deployment and click-through

Application Preview deployment: **PASS / Ready**, `FGk8CdtcCHqkftsJHJz3gA2TZLZ8`, source `e49ab0da8369e912802070bb7ffbf01e84c6c7fe`. Ready at `2026-10-10T01:50:54Z`; deployment duration 2m30s. Vercel: https://vercel.com/trimax-s-projects/trimax/FGk8CdtcCHqkftsJHJz3gA2TZLZ8 .

### Open the review

- Customer: https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/book/rnl-creations
- Owner UI fixture: https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/book/demo
- Immutable application deployment: https://trimax-5yn54ab8w-trimax-s-projects.vercel.app/book/rnl-creations
- Internal login: https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/login

Vercel Preview protection remains enabled. Anonymous command-line requests receive the Vercel SSO redirect, not an application 200. Authenticated Vercel runtime logs verify application GET `/book/rnl-creations` = 200 (including `2026-10-10T01:53:38.560Z`), GET `/book/demo` = 200, and both synthetic POSTs = 201. No protection was disabled to obtain review access.

| Review | Result and evidence |
|---|---|
| Customer page | PASS. Branding, six services, contact fields, address, work description, date/window, flexibility, urgency, notes, consent, back/edit and three-step review rendered. |
| Desktop | PASS. 1280px viewport, content width 1270px; coherent two-column layout, readable typography, 48px primary buttons. Synthetic receipt `REQ-25F8B8482EAE`, POST 201 at `01:52:05.962Z`. |
| Mobile | PASS. 390 x 844 viewport, content width 380px, no horizontal overflow; single-column layout, 46px inputs/selects and approximately 48px primary controls. All three steps exercised. Synthetic receipt `REQ-E87DFB2955B2`, POST 201 at `01:52:57.056Z`. |
| Success | PASS. Request reference plus explicit Preview/no-real-request/no-notification message; appointment remains unconfirmed. |
| `/book` | PASS. Browser reached `/book/rnl-creations`. |
| Unknown slug | PASS. `/book/not-a-published-business` displayed “404 / This page could not be found.” Next's streamed response was logged as HTTP 200; the observed requirement is the not-found UI, not a claimed HTTP 404. |
| `/schedule` | Unauthenticated protection PASS: browser redirected to `/login`; source identical to rc10. |
| `/admin/service-requests` | Unauthenticated protection PASS: browser redirected to `/login`; no data displayed. |
| Owner fixture | PASS. Two synthetic inbox entries, Jamie Taylor details, note entry, transition to More information needed, timestamped activity, disabled conversion. |
| Settings/branding | PASS. Public identity, slug, description, phone/email, logo reference, palette, lead/horizon/weekdays/windows, request types and required approval controls rendered. Synthetic display-name/palette save advanced revision 0 to 1. Reload reset component memory, as designed. |

**Authenticated internal Preview click-through: UNVERIFIED pending user sign-in.** The separate Preview hostname has no Trimax session. The user was asked to sign in and the login tab was left available. No session was extracted or copied from production. Deterministic auth/login-expiry/remount-loop regressions passed; those are not presented as a live authenticated Preview test. The public page and isolated owner UI are available for visual review without a Trimax session (Vercel project access still applies).

The authenticated owner store is intentionally unbound; `/book/demo` is the verified owner-preview surface. No claim is made that synthetic public submissions populate the separate memory-only owner fixture, or that serverless temporary files persist across instances. Those are explicit review limitations, not production durability guarantees.

## Production activation checklist — MUST HAVE BEFORE PUBLIC LAUNCH

1. **Scheduling migrations:** review/apply `20261009_public_scheduling_foundation.sql` then `20261010_public_scheduling_phase2.sql` in a staging database first; verify RPC signatures, RLS, composite tenant FKs, role grants, indexes, concurrency and rollback. Apply to production only under a separately approved release. No existing business tables are migration targets.
2. **Restricted intake credential:** provision a server-only credential for `trimax_scheduling_intake`; only approved intake/status RPCs; no generic table reads, business writes, payment authority, or service-role substitution. Prove grants and denial tests against the deployed environment. Rotation/revocation documented.
3. **Slug/business configuration:** replace development allowlist binding with explicit published production slug/settings/type resolution. Confirm R&L business ownership; reject unknown/disabled slugs and cross-tenant IDs. Do not expose internal workspace IDs to browser props. Verify branded contact details/logo and request-only wording.
4. **Rate limiting:** select a durable shared provider and enforce the configured per-business/client window before persistence; prove cross-instance behavior, error fail-closed, limits, and operational alerts.
5. **Challenge provider:** wire real CAPTCHA/challenge validation, expected site/action/origin and replay/expiry checks. Missing/failed provider must result in zero persistence calls. Validate accessible retry UX.
6. **Trusted identity:** document the deployment's trusted proxy/client identity source; never blindly trust forwarded headers. HMAC fingerprint using a managed secret; minimize/raw-IP retention. Exercise spoofed-header tests.
7. **Retention:** approve duration for contacts, addresses, notes, capability hashes, audit/outbox events and backups; deletion/cleanup owner and recovery policy; privacy notice. Remove development fixture storage from the live route.
8. **Owner/admin validation:** test actual verified owner/admin/member and other-tenant accounts; state changes, notes, settings conflicts/idempotency and activity history. Approval must not silently confirm or convert. Keep conversion disabled unless separately accepted.
9. **Notifications:** decide the minimum promised communication. Before any automatic sends, configure durable outbox dispatcher, leases/retries/dead letter, consent/opt-out, idempotency and verified delivery callbacks. If initially manual-only, customer copy must explicitly reflect that choice and avoid promising automatic sends.
10. **SMS:** before enabling SMS promises or sends, choose provider, verify/register sender as required, recipient consent and opt-out policy, secrets, callback verification and sandbox-to-production acceptance. Until then SMS stays disabled.
11. **Email:** before enabling automatic email, verify sender/domain, templates, recipient safety, bounce/suppression handling, callback verification and secret scope; test without contacting real customers. Until then automatic email stays disabled.
12. **Request-status capabilities:** implement production capability delivery through a verified channel, expiry/revocation and safe link handling. Do not treat a request reference as authorization; status response must remain redacted and tenant-bound. If customer status is deferred, do not advertise it at launch.
13. **Monitoring:** log request ID/tenant-safe identifiers, rejection classes, latency, idempotent retries, rate/challenge/provider failures and outbox health without contact/message payloads. Assign alerts, owner response SLA and incident procedure; prove staging failure recovery.
14. **Rollback:** a server-side intake kill switch must fail closed without affecting internal Trimax/OCR. Disable sends/dispatchers separately; preserve existing requests/audit for owner review; revoke only intake credential if necessary. Prefer application rollback and disabled new scheduling tables over destructive schema rollback. Verify current release contract and regression suite before any production merge.

Launch sign-off additionally requires reviewed UI, complete non-payment submission/review acceptance, explicit deployment configuration, unchanged payment/OCR safety, and an approved production activation release. This Preview is not that sign-off.

## Can follow after a deliberately limited initial launch

Calendar integration, real-time availability, automatic booking, request-to-client/Queue/job conversion, reminders, two-way messaging, additional public businesses, analytics and richer branding may follow. Automated SMS/email and self-service status can follow only if absent features are clearly disclosed at initial launch and no delivery is promised. None may bypass the prerequisites above when enabled.

## Final state

Production persistence enabled: NO. Production migrations applied: NO. SMS/email enabled: NO. Production changed: NO. Main remains verified rc10. Public page, mobile, desktop and isolated owner intake Preview: PASS. Ready for Robbie visual review: YES. Live authenticated internal verification remains the limitation stated above until sign-in is completed.

Only synthetic temporary files and synthetic component-memory state were written during form/UI verification. No production Supabase migration/RPC mutation, Queue/client/job/payment endpoint or notification endpoint was invoked. No worker was restarted or changed. No claim of new production OCR/physical acceptance is made.

Next action: WAIT FOR CHATGPT REVIEW. No production activation or additional feature task was started.
