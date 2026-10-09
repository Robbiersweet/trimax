# Trimax public scheduling Phase 2

## Scope and isolation

Continued only `codex/public-scheduling-foundation` in `C:/Users/robbi/.codex/worktrees/trimax-public-scheduling/trimax`. This builds on the isolated Phase 1 foundation, not the release candidate. No merge, push, deployment, production migration, credential provisioning, worker change, OCR/payment change, Queue change, SMS or email occurred.

## Production persistence foundation

`productionAdapter.ts` implements a credential-injected server adapter. It validates an explicit field allowlist against server-resolved public business settings, hashes the idempotency key, and calls only `trimax_submit_public_service_request`. Client business UUIDs are rejected. No environment credentials are loaded by this adapter. `productionService.ts` is the production entry contract: real rate limiting and challenge verification must pass before any persistence call. Missing or failed providers cause zero RPC calls.

The local-only Phase 2 migration creates the restricted `trimax_scheduling_intake` NOLOGIN role and narrow SECURITY DEFINER functions. Public/anonymous/authenticated callers cannot execute the intake or customer status RPC. The intake role has no general SELECT or INSERT table privilege. Future provisioning must bind a restricted server-only credential to this role, not a browser or service-role credential. It was not provisioned here.

The RPC resolves a published public slug inside the database, validates field types/limits/contact/consent/type eligibility/date rules, uses tenant-scoped idempotency, rejects changed-payload replay, and atomically persists request/activity/outbox evidence. Request references are random. No client, invoice, job or payment tables are accessed.

No production route is activated. The existing web endpoint still rejects submissions in production. This is an implemented and disposable-tested production adapter, not an enabled service.

## Abuse protection

`abuseProtection.ts` defines a shared rate-limit provider and challenge provider. The orchestrator fails closed if either is unavailable, rejects provider errors, and requires both to pass. A deployment-specific trusted client identity is HMAC-fingerprinted with a secret; raw IP is not stored by this boundary. Caller-controlled forwarded headers are not trusted automatically. Default policy is five requests per ten minutes per business/fingerprint. Provider credentials, trusted-proxy identity extraction, and challenge integration remain unconfigured. No placeholder provider is presented as production protection.

## Owner intake and review

`/admin/service-requests` now has an inbox, full request detail, contact/address/work/date/window information, internal note entry, six review states, and activity history. States: pending confirmation, reviewing, approved, more information needed, rejected, cancelled.

`/api/public-scheduling/review` requires the existing verified-user owner/admin workspace membership before reading or writing development request data. Mutations use expected revision and mutation ID. Same mutation replay returns the original state; changed payload with the same key fails; stale revisions fail. Notes append and history retains actor, time and state transition. Cross-tenant IDs do not select another workspace. Closed requests cannot be silently reopened. Body reading is bounded before JSON parsing.

The separate production review RPC is likewise tenant-authorized using auth.uid, checks owner/admin membership, locks the request, enforces revision/idempotency, and writes audit history. Approval remains an internal review state: it does not confirm an appointment or send a message. Confirmation authority is separate and unchanged.

## Scheduling settings and branding

The owner settings screen edits development-only public enablement, slug, display name, description, phone/email, approved local logo reference, accent palette, request labels, active state/order, minimum lead hours, horizon, weekdays and named time windows. Owner approval is explicitly required and immediate booking is disabled.

Settings persist atomically outside Git using server-known workspace binding, revision checks and owner/admin authorization. The public development page resolves the edited slug and settings from that store. No arbitrary workspace can be introduced through request data. Reserved `demo` and other published workspace slugs cannot be taken over. Logo references are restricted to local `/branding/` assets; no arbitrary external tracking URL is accepted. Shared public presentation uses forest/ocean/clay theme tokens, business description/contact and optional local logo. Restoration Envy is not published.

Production settings tables remain unapplied. There is no production settings write endpoint in this task.

## Conversion boundary

`conversion.ts` defines reviewed request/client attach-or-create/Queue-or-job plans and receipts with source references and idempotency. The adapter is intentionally disabled. Its contract requires locking the approved source, verifying owner/tenant relationships, atomic creation/linking/audit, identical-replay receipts, and total rollback on failure. No business-table conversion is performed. The UI shows a disabled conversion control.

## Durable notification/outbox foundation

The SQL outbox is tenant-linked to the request and stores event, audience/channel, recipient/template, deduplication key, scheduling, consent provenance, attempts, next attempt, retry/dead-letter/delivered state, provider ID and error code. Request submission creates initial outbox/activity atomically. SMS and customer-contact intent require consent provenance. No anonymous read or write authority is granted.

Domain provider boundaries cover SMS, email and in-app delivery. Retry delay is bounded and five failures dead-letter the intent. No dispatcher/provider instance is started, and no real notification is sent. Future deployment needs provider secrets/sender verification, delivery callbacks, opt-outs, leases/recovery, and operational policy.

## Secure customer status architecture

Capabilities use 32 random bytes (256 bits), base64url encoding and SHA-256 storage. Verification handles expiration and constant-time hash comparison. SQL stores only the capability hash, expiry and revocation state. Status RPC requires the restricted server role and returns only reference, customer-safe state and submission timestamp. It does not disclose contact details, address, internal notes or other requests. A bare request reference is not authorization.

Internal `approved` does not mean confirmed: it projects to under review unless a separate confirmed status has been established. No public status endpoint or capability link distribution is activated; this phase implements the architecture and tests only.

## Visual review

Reviewed local `/book/rnl-creations` at desktop 1270×714 and mobile 390×844. Mobile content width was 380 pixels with no overflow. Existing green/neutral three-step customer form remained coherent.

Reviewed `/book/demo`: explicitly labeled isolated visual fixture, two synthetic inbox entries, full Jamie Taylor detail/contact/address/time/notes, status change to more information needed, internal note, timestamped activity transition, and disabled conversion. Settings showed required controls; changing the display name and saving advanced the displayed revision to 1 with explicit production-unchanged wording.

This fixture is not an owner authentication bypass: it has no server API or store access and changes synthetic component memory only. Its server route requires non-production mode AND `PUBLIC_SCHEDULING_VISUAL_FIXTURE=enabled`; production returns not found. Actual owner API authorization is tested with verifier mocks and SQL roles. A live authenticated owner inbox session remains unverified because no production credential/session was used.

## Validation

- Public scheduling domain/storage/routing/authorization regressions: PASS.
- Owner workflow/settings tests: PASS — authorization, tenant isolation, note/activity history, idempotent mutation, changed payload, stale revision, approval-not-confirmation, settings scope and validation, fixture isolation.
- Production adapter/abuse/capability/outbox/conversion tests: PASS.
- Phase 1 local schema/RLS regression: PASS.
- Phase 2 disposable PGlite SQL test: PASS — role grants, denied anonymous execute/SELECT, no intake table access, arbitrary business ID/cross-tenant type rejection, disabled business, idempotency/conflicts, atomic activity/outbox, consent constraints, member/other-tenant owner denial, revision/history, capability tenant/expiry/revocation/redaction.
- Lint: PASS. TypeScript (`tsc --noEmit`): PASS. Production build (`next build`): PASS, 48 pages generated, including the new isolated routes.

SQL tests used existing external @electric-sql/pglite 0.5.8 in an ephemeral database with stub businesses/memberships/auth.uid. Neither test connects to Supabase. Linux Node v24.21.0 runs lint/TypeScript/build due to the existing Linux-only sharp dependency; public Supabase build values are nonworking loopback placeholders only.

## Files changed

- Domain, authorization, public settings resolution and public branding presentation.
- New owner workflow/settings/bounded-body modules and authenticated development review/settings APIs.
- Owner inbox/detail/settings component and styles, isolated synthetic visual fixture.
- Production persistence/orchestrator, abuse, capability, conversion and outbox modules.
- Phase 2 local SQL migration and owner/domain/SQL regression scripts.
- Package test command and this handoff.

Exact file list is available with `git diff --name-only 3489823..HEAD` after commits. No release-candidate files, OCR modules, payment modules, workers, existing internal schedule, or production configuration changed.

## Limitations and remaining activation prerequisites

Production is deliberately disabled. Restricted credential provisioning, actual shared abuse providers/trusted identity adapter, production business resolution/config adapter wiring, applied/reviewed migrations, status route delivery/revocation UX, notification dispatcher, production retention/monitoring and real owner/session validation remain activation prerequisites. Development file locks can require manual recovery after a crash; they are not the production persistence design. Settings administration is development-only. Approval does not book availability. No claim of complete calendar/notification/conversion functionality is made.

## Commits and final checks

Implementation commit: `baef03028fb41bea9a782acf589158f4848b31e8` (local only). Final lint, TypeScript, production build, scheduling regressions and disposable SQL gates passed. No push, merge or deployment.

Foundation status: production persistence COMPLETE; owner workflow COMPLETE; development settings COMPLETE; notification/outbox foundation COMPLETE; customer status architecture COMPLETE. These are foundation completion claims only, not claims that any live production adapter, notification provider, calendar or conversion is enabled.
