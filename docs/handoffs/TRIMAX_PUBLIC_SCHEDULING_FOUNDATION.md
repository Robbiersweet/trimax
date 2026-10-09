# Trimax public scheduling foundation

## Scope and isolation

Workstream B is isolated on `codex/public-scheduling-foundation` at `C:/Users/robbi/.codex/worktrees/trimax-public-scheduling/trimax`, based on deployed application commit `b5d0d51ab35a915292e54355d5c582a22876be11`. No release-candidate files were copied. No production deployment, push, merge, database migration, feature flag change, worker operation, SMS, or email occurred.

## Architecture and routes

- `/book` redirects to `/book/rnl-creations`.
- `/book/[slug]` is the public customer surface; unknown/unpublished slugs return not found. The existing internal `/schedule` route is preserved unchanged.
- `RouteAccessBoundary` recognizes only the exact `/book` and single slug route family. All other paths retain the existing employee AuthGuard. It does not trust request headers. Public server configuration is allowlisted, and serialized client props omit workspace IDs and internal labels.
- `/api/public-scheduling/[slug]` accepts POST only. It resolves the business server-side; client business IDs cannot select storage tenants. No public request-list endpoint exists.
- `/admin/service-requests` is the separate internal development intake. Its API at `/api/public-scheduling/intake` requires a verified Supabase user and owner/admin membership for a server-configured workspace binding. It never accesses clients, invoices, jobs, or payments.

## Customer experience

The customer page uses a warm neutral background, green brand accents, editorial introduction, three-step progress, mobile touch targets, and a distinct public layout without internal navigation. Steps are: work/contact; visit preferences; review/consent. It includes service type, name, phone, email, contact preference, address, description, preferred date/window, flexibility, urgency, notes, and contact consent. Input is retained after errors, back/edit is available, pending submission disables controls, and retries reuse the submission key. The success state gives a request reference and explicitly says the appointment is not confirmed.

Browser validation completed unauthenticated at `http://127.0.0.1:3017/book/rnl-creations`. A synthetic local request reached success with reference `REQ-FECFFC1F644A`. Desktop rendering and 390×844 mobile rendering were checked: content width 380 pixels did not exceed viewport; primary controls were 48 pixels high. The native browser validation was exercised through the actual form. An origin mismatch between the development server's internal URL and loopback browser URL was corrected by an exact, server-configured `PUBLIC_SCHEDULING_DEV_ORIGIN`; no broad origin bypass was added.

## Domain and scheduling rules

`src/app/lib/publicScheduling/domain.ts` defines request types, public business settings, availability rules and request state. Request types support active/display order/public and internal labels/description/duration placeholder/scheduling eligibility. Availability represents weekdays, business hours, blocked dates, lead time, horizon, named windows, duration via service type, owner approval, and request-only versus future immediately-bookable modes.

The first configuration defaults to request-only and owner approval required. The validator explicitly refuses unsupported immediate booking authority. It conservatively validates requested dates at day granularity: minimum `ceil(minimumLeadHours / 24) + 1` days (two days for the initial 24-hour configuration), with a 90-day horizon and weekdays only. The UI discloses that limit. This is not a calendar/availability engine.

## Database foundation

`supabase/migrations/20261009_public_scheduling_foundation.sql` prepares four new tables:

1. `public_scheduling_settings`: explicit public slug, branding, enablement and availability configuration.
2. `public_service_request_types`: tenant-specific service definitions.
3. `public_service_requests`: contact, work, scheduling preferences, request reference, idempotency/payload hashes, pending status, separate internal notes, consent timestamp, confirmation/notification state and future integration references.
4. `public_request_activity`: tenant-scoped appendable event foundation.

Composite tenant foreign keys prevent cross-business request type/activity association. All four tables use RLS. Anonymous roles have no read or insert privileges; authenticated roles receive only owner/admin tenant-scoped SELECT. No production insert RPC is exposed. No existing business table is altered. Relationship conversion is reserved for a future reviewed, tenant-safe adapter.

The migration was actually executed in a disposable local PGlite database with isolated stub businesses/memberships/auth.uid, not production. Tests proved anonymous denial, owner visibility limited to own tenant, other-tenant admin exclusion, ordinary-member denial, and authenticated mutation denial. This is local SQL evidence, not proof of an applied production migration.

## Security and submission storage

Production intake fails closed regardless of the development flag. Development requires `PUBLIC_SCHEDULING_DEV_ADAPTER=enabled` and non-production NODE_ENV. No service-role key is used. Request bodies are bounded at 16 KiB; fields have length/shape limits and normalization. The API checks origin against its canonical URL or explicit configured development origin. Unknown slugs, inactive types, invalid contact data, invalid scheduling bounds, missing consent and honeypot submissions are rejected server-side.

The isolated development adapter writes only to an OS-temporary directory outside Git (or explicit absolute `PUBLIC_SCHEDULING_DEV_DIRECTORY`). Records are tenant/key-hashed, permission-restricted where supported, written atomically, and protected by exclusive locks. The same key and same payload return the original record; a changed payload with that key is rejected. Status begins `pending_confirmation`; confirmation remains `unconfirmed`; notifications remain `not_configured`.

Local request data contains personal information. Use synthetic data only in this foundation. A crash can leave a lock requiring inspection; OS temporary storage is not a production durability/retention contract. No private records or images are committed.

## Internal intake and integration boundary

The separate owner/admin page loads development requests on explicit action. API authorization uses verified user identity plus exact server-bound workspace membership before reading local records. `PUBLIC_SCHEDULING_DEV_WORKSPACE_BINDINGS` maps public slug to a development Supabase workspace UUID. No production credential was loaded or live membership test performed in this task; verifier tests cover role/tenant behavior. A local Supabase owner session and binding are required to exercise the authorized inbox UI end to end.

The integration interface reserves review and explicit post-approval conversion; no Queue lifecycle or client creation is implemented. These operations must be reviewed and tenant-safe before activation.

## Notification and SMS boundary

`notifications.ts` defines channel-independent notification messages with idempotency, tenant/request identity, event, recipient, template, schedule and consent provenance; a provider interface; SMS specialization; reminder scheduling/cancellation; and intake abuse protection.

Events cover customer received/confirmed/rescheduled/cancelled/reminder and internal new request/approval pending/upcoming/unhandled. No provider is wired and no messages are sent. Future Twilio or another provider requires verified sender, secrets management, consent/opt-out policy, recipient authorization, durable outbox, retry/dead-letter handling, delivery callbacks and deduplication. Rate-limit/challenge integration must be real and shared across instances before production submission can open; the current implementation does not claim the honeypot is adequate production abuse protection.

## Validation

- `npm run test:public-scheduling`: PASS (domain/storage, narrow routing/data boundaries, server authorization).
- Disposable PGlite `scripts/public-scheduling-schema-regression.mjs`: PASS with external test-only @electric-sql/pglite 0.5.8.
- Local unauthenticated browser submission: PASS; synthetic request only.
- Mobile/desktop visual review: PASS.
- Lint: PASS. TypeScript (`tsc --noEmit`): PASS. Production build (`next build`): PASS on final implementation; no development-store tracing warning remained.
- Existing internal auth behavior is unchanged; source route tests prove `/schedule`, `/admin`, `/invoices`, `/clients`, `/queue` and nested/spoofed book paths remain outside the public bypass.

Windows `npm ci` encountered the baseline's direct Linux-only sharp dependency. Installation and lint/TypeScript/build used the existing isolated Linux Node v24.21.0 runtime. No dependency manifest versions or lockfile were changed to bypass that condition. npm reported 15 existing dependency advisories (1 low, 1 moderate, 12 high, 1 critical); dependency remediation was not part of this workstream.

## Known limitations and recommended review phase

This is a reviewable foundation, not an enabled public service. Production persistence/abuse controls, real availability, internal conversion actions, notification delivery, reminder execution, branding administration and data-retention policy remain to be designed and verified before activation. Only R&L is currently explicitly published in the local configuration; the domain is multi-business capable and tests exercise separate tenants. Restoration Envy is not exposed by a guessed slug.

The next review phase can select the constrained production persistence/anti-abuse adapters and validate the owner intake against an isolated development Supabase instance. No such work or deployment was started here.

## Files and commits

Files: `package.json`; `src/app/layout.tsx`; `src/app/components/RouteAccessBoundary.tsx`; `src/app/book/{page.tsx,[slug]/page.tsx,RequestForm.tsx,schedule.css}`; `src/app/admin/service-requests/page.tsx`; `src/app/api/public-scheduling/{[slug]/route.ts,intake/route.ts}`; `src/app/lib/publicScheduling/{domain.ts,routes.ts,developmentStore.ts,authorization.ts,notifications.ts}`; `scripts/public-scheduling-{regression.ts,boundary-regression.ts,authorization-regression.ts,schema-regression.mjs}`; `supabase/migrations/20261009_public_scheduling_foundation.sql`; this report.

Local implementation commits and validation are recorded below. No push, merge or deployment.

## Local review setup

Use a Linux Node environment compatible with the existing repository dependencies. Run `npm ci`, then set these local development values only:

- `PUBLIC_SCHEDULING_DEV_ADAPTER=enabled`
- `PUBLIC_SCHEDULING_DEV_ORIGIN=http://127.0.0.1:3017` (must match the browser origin exactly)
- Optional `PUBLIC_SCHEDULING_DEV_DIRECTORY` as an absolute private directory outside Git.
- Existing Next public Supabase URL/anonymous key are needed by internal application modules. This task used nonworking loopback placeholders for public UI/build validation; no production credentials were copied.
- For isolated internal intake testing only, configure `PUBLIC_SCHEDULING_DEV_WORKSPACE_BINDINGS` against a development Supabase workspace and sign in as its owner/admin.

Run `npm run dev -- --hostname 127.0.0.1 --port 3017`. Production mode always rejects development submission. Do not use real customer information in this development store.

SQL regression: set `TRIMAX_PGLITE_MODULE` to a local test installation of `@electric-sql/pglite` and run `node scripts/public-scheduling-schema-regression.mjs`. It creates and closes an ephemeral database; it never reads a connection URL.

Existing internal checks: owner-server-auth passed directly. Tenant-isolation-hardening and business-read-isolation initially failed their literal-LF source checks on the Windows CRLF checkout. Their unchanged canonical Git-byte baseline snapshot passed both; the relevant business/auth files are unchanged by this branch. Assertions were not edited or relaxed.

## Final local commit record

- `61da581bddf51c78833229869a486fd82b1c39dc` — public scheduling UI/domain/API/local schema, security boundaries and tests.
- `049e444231c890c0af53a21fe95a02301707a97a` — keep external development storage paths outside build source tracing; no runtime authority change.

All implementation commits are local to `codex/public-scheduling-foundation`. No commit was pushed or merged. Production behavior remains unchanged.
