# R&L Creations public website — preview handoff

## Scope and outcome

Built a standalone public R&L website in `sites/rnl`, on branch `codex/rnl-public-website`, worktree `C:\Users\robbi\.codex\worktrees\rnl-public-website\trimax`. Base: deployed rc11 `996bff1d7710ddbf4e8535c521b429e3a6209ae1`. Website implementation commit: `a6de738288f1b23134c58642e34aac847d9d4c39`.

This is a preview deliverable, not a production launch. No DNS, Supabase data/schema/permissions, production environment, OCR worker, payment logic or internal route was changed. No production request was sent. The earlier rc11 scheduling activation handoff was not resumed by this website task.

## Architecture

```text
Public website deployment (separate Vercel project, sites/rnl)
  / /services /gallery /about /property-managers /contact
  /privacy /request-terms /robots.txt /sitemap.xml
  /schedule -> existing RequestForm + existing TurnstileChallenge
    POST same-origin /api/public-scheduling/rnl-creations
      Preview/development: 503, no provider, config lookup or persistence
      Production, only when configured/enabled:
        existing productionSubmission
        exact Origin + bounded JSON + idempotency + trusted Vercel identity
        existing productionBusiness / request validation
        existing challenge + Upstash rate limit
        restricted config/submission RPCs
        existing request persistence / owner review inbox

Internal Trimax deployment (unchanged, separate project)
  app.rnlcreations.com -> existing login, workspace, operations, owner review
  existing Queue/invoice/payment boundaries and OCR workers remain unchanged
```

No invisible iframe or visible redirect to the internal host. Customer navigation remains on `/schedule`. Existing form receipt link `/book/rnl-creations` redirects to `/schedule` on the same public host. Other internal routes are not present in the website build. Public status lookup, intake/review/settings/conversion APIs and owner routes are not packaged.

### One shared scheduling implementation

`sites/rnl/scripts/prepare-shared.mjs` copies an explicit allowlist of **13 unchanged source/font/style files** into ignored `.shared` at build time. This is packaging from the canonical source, not a fork of the form or recognition/business logic. It records SHA-256 provenance for each source; website regressions compare every packaged source to its canonical input. No database identifiers, client records or private assets are copied into website content. Only the two approved public brand images are copied.

Packaged modules: RequestForm, TurnstileChallenge, schedule.css, Allura font/license; domain, productionRuntime, productionHandler, productionService, productionAdapter, providers, abuseProtection, httpBody. The server wrapper imports `server-only`, explicitly reduces configuration to the public form DTO, and does not serialize businessId/internal request-type labels. Preview never reads production scheduling settings even if someone accidentally supplies credentials.

The nested project has its own package-lock, Next config, PostCSS, ESLint, TypeScript and Vercel config. Root Trimax build/release guards, manifest and configuration are unchanged. Do not use the website build as a substitute for a Trimax release gate or merge/deploy it as the internal rc11 application.

## Pages

| Page | Result | Contents |
|---|---|---|
| Home | PASS | Badge/script/workshop hero, services, property managers, gallery placeholders, process, CTA |
| Services | PASS | Six service categories, examples and request links; no prices/certification claims |
| Gallery | PASS | Responsive reusable data structure; clearly marked photo placeholders |
| About | PASS | Known business facts, established 2020, no fabricated history/reviews |
| Property Managers | PASS | Turns, paint, repair/recurring work; property/unit guidance; no internal jargon |
| Schedule | PASS, preview scope | Approved composition and original three-step form; disabled submission |
| Contact | PASS | Request CTA, location guidance; no unverified phone/email |
| Privacy / request terms | PASS, content review pending | Plain-language description of current request-only handling |
| 404 / error states | PASS | Branded recovery, no internal navigation |

## Design, accessibility and performance

Approved `#ff850a`, black/charcoal/ivory, original badge and workshop asset. Allura locally loaded with `next/font/local`, only for script text. Badge mat is cropped with the existing approved rendering geometry. No new AI project photographs. Gallery entries accept real image src/alt/width/height later.

Server-rendered marketing pages; client code only for navigation and the existing interactive request form/challenge. Next Image responsive sizing/optimization, intrinsic badge geometry, local font loading, explicit image aspect ratios. Decorative image has empty alt; meaningful badge has descriptive alt. Semantic landmarks/headings, skip link, keyboard focus outlines, labeled form controls, menu expanded state, Escape-to-close/focus-return, 44px+ menu and main CTA targets, reduced-motion handling. Not a formal third-party accessibility or physical Safari certification.

## Tests and evidence

| Check | Result |
|---|---|
| Website `npm test` against local production build | **75 checks PASS**: routes, SEO, internal denial, shared-file hashes, fail-closed preview, other-slug denial, secret boundary, clean receipt redirect |
| Website lint | PASS |
| Website TypeScript | PASS |
| Website production build | PASS, Next 16.4.0 webpack; 14 page/metadata build entries plus dynamic schedule/API |
| Existing `npm run test:public-scheduling` | PASS: domain/storage, route boundary, authorization, owner/settings, phase2, production providers, Turnstile stale/expiry/retry/unmount |
| Existing auth-flow regression | PASS, deterministic login/expiry/remount cases; not installed-PWA acceptance |
| Existing tenant/business-read isolation + owner-server-auth | PASS |
| Property-manager SQL permissions | PASS: synthetic membership, Queue insert, property/unit/business read, cross-tenant denial, anon/intake denial |
| Existing remittance matching/fixtures, duplicates, payment timeliness, corrections/splits | PASS |
| Job-session crew/integrity | PASS |
| Queue compact toolbar | PASS |
| `npm run test:stabilization` including OCR shadow suite | PASS, completed after separately running remaining tests |
| Original root `npm test` aggregate | **FAIL at pre-existing CRLF-sensitive Queue source-text assertion**, not silently marked green |

The Queue assertion in `scripts/queue-workspace-polish-regression.ts:75` searches for a literal LF multiline substring in a Windows CRLF source file. A read-only in-memory LF normalization control made that exact test PASS. No test or Queue source was modified. The root aggregate stopped there; remaining safety suites were invoked separately and passed. `git diff 996bff1 -- src scripts release supabase package.json package-lock.json vercel.json` was empty. Website builds do not modify or reseal the rc11 runtime.

### Browser verification

Desktop: Home, Services, Property Managers, Schedule, Gallery, Contact and About captured at 1280px. Mobile: Home and Schedule at 390×844 and 430×932; menu open/close, form steps and disabled submission captured. Checked line wrapping, logo treatment, no horizontal overflow, images loaded, spacing and footer. Corrected active nav button contrast and a mobile heading space in website-only code. Existing scheduling form/domain unchanged.

Synthetic local form walked through contact/project/review, returned explicit disabled-submission error, retained visible details, and created no request. Date input automation required native segmented entry; no successful production submission is claimed. Actual installed iPhone/Android/Safari tests have not been performed. Screenshots and DNS evidence: `docs/handoffs/rnl-website-evidence/`.

## Preview deployment

Separate project: `trimax-s-projects/rnl-public-website`, ID `prj_I7w7ynRRZBnr5YwpVYyT3lcNPBuf`. Git repo uses existing Vercel GitHub integration; no new credential or repository permission granted. Root `sites/rnl`, include outside-root files for build-time shared-source packaging, Node 24.x, only build pre-production. No production secrets or custom domains added.

Initial queued deployment `EVUn4QzzEDTLUAPT82EQ9MKQyWrK` was labeled Production in deployment details and was canceled before build. No production deployment served. Explicit **Create Preview Deployment** used for `HHQaZopiXTmn3Wkux1GpodqZxfSi` from `a6de738`.

Preview URL: https://rnl-public-website-p0oc104rr-trimax-s-projects.vercel.app

Final deployment verification is recorded in the completion addendum below.

## SEO

Unique titles/descriptions, canonical URLs rooted at `https://rnlcreations.com`, Open Graph image/metadata, R&L monogram icon, sitemap and robots. Preview explicitly noindex/nofollow via metadata, robots and response header. Production robots permit public pages and disallow APIs. Organization structured data includes only name, URL, established year and supplied tagline. No fabricated address, aggregate rating or service area. No public analytics/tracking provider enabled in this task.

## Production environment requirements — future cutover only

Configure **only the separate website project's Production environment**, never copy all Trimax environment variables:

| Variable | Purpose / rule |
|---|---|
| NEXT_PUBLIC_TURNSTILE_SITE_KEY | Public site key; authorize final customer hostname |
| TURNSTILE_SECRET_KEY | Server-only Secret; real key required in production |
| UPSTASH_REDIS_REST_URL | Existing reviewed provider endpoint |
| UPSTASH_REDIS_REST_TOKEN | Server-only Secret |
| SCHEDULING_FINGERPRINT_SECRET | Server-only Secret, existing behavior, at least 32 chars |
| SCHEDULING_INTAKE_JWT | Server-only Secret; restricted `trimax_scheduling_intake` role, project and expiry validated |
| PUBLIC_SCHEDULING_ORIGIN | Exactly `https://rnlcreations.com`, no trailing slash |
| PUBLIC_SCHEDULING_PRODUCTION_ENABLED | Exactly `enabled`, only during approved activation |
| NEXT_PUBLIC_SUPABASE_URL | Existing reviewed Supabase project endpoint; used by server boundary |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Existing gateway key, paired with restricted JWT server-side |

Vercel supplies `VERCEL=1`, `VERCEL_ENV=production`. No service-role key, OCR worker key or signing secret is needed. Existing R&L scheduling settings must be enabled in a separately reviewed activation. Missing/expired/mismatched configuration fails closed. Preview remains disabled regardless of the activation flag or supplied secrets.

The source handoff records the existing restricted JWT expires **2026-10-19T08:29:21Z**; its value was not read/copied/reminted here. Credential freshness and installation must be verified at cutover. Do not assume the previously reported manual Vercel handoff succeeded: the latest rc11 report records the variable absent and owner session requiring sign-in at its last verification. No attempt was made to fix that separate rollout in this task.

## DNS snapshot and domain plan

Read-only DNS observation 2026-10-12, exact JSON saved in evidence:

- NS: `ns1.systemdns.com`, `ns2.systemdns.com`, `ns3.systemdns.com`. SOA primary `ns1.systemdns.com`. This identifies the authoritative DNS service; registrar/reseller account access is **unverified**.
- `www.rnlcreations.com CNAME zhs.zohosites.com`; resolved target `136.143.189.12` at observation.
- Apex `rnlcreations.com` A/AAAA queries returned SOA only, **no address answer**. Do not claim the apex currently serves the Zoho site merely from the www record.
- `app.rnlcreations.com CNAME cname.vercel-dns.com`, unchanged.
- MX/TXT observed in snapshot. Preserve email/security records and nameservers.

Future canonical host: apex `rnlcreations.com`. Attach apex and www to **rnl-public-website only**, and configure www → apex permanent redirect with path/query preserved. Do not move or reassign the app subdomain.

Expected record changes: apex A to the exact project-specific IP shown by Vercel after approved domain attachment; www CNAME to the exact project-specific target shown for this project, replacing `zhs.zohosites.com`. **Those exact new targets are not yet available because no domain was attached. Do not substitute a guessed generic Vercel record.** Vercel's [domain configuration documentation](https://vercel.com/docs/domains/working-with-domains/add-a-domain) specifies project-provided DNS targets. Keep existing nameservers; do not migrate the entire DNS zone. Vercel must verify both domains and issue valid TLS before announcing launch.

## Exact future cutover sequence

1. Robbie/ChatGPT reviews this preview and content TODO; approves public cutover explicitly.
2. Verify the current DNS zone in its authoritative account; export full zone and confirm apex's current absent/present records. Preserve www's Zoho target for rollback.
3. Review the website branch; keep the internal Trimax release guard and deployed app untouched. Enable a separately reviewed production build for the website project only (currently preview-only).
4. Install the listed Production variables through approved secret handling. Configure Turnstile for apex (and www if desired before redirect). Verify credential expiry/scope without exposing it. Do not remigrate DB or restart workers.
5. Verify R&L settings/request types/owner approval; activate only under the reviewed scheduling launch procedure. Keep public status lookup off.
6. Create the website Production deployment under explicit authorization, verify environment/security and closed fallback first. Attach apex/www to website project; obtain and record exact DNS recommendations. Check certificate eligibility/CAA without altering unrelated records.
7. Change only apex/www records with authorization. Configure www redirect; verify TLS, canonical host, every public page, clean `/schedule` and all internal-path denials. Confirm `app.rnlcreations.com` remains on its original deployment.
8. Run the approved controlled synthetic scheduling acceptance separately: challenge, rate limit, restricted persistence, owner inbox/review; no conversion/payment. This task did not perform that production test.
9. Verify current protected business state/runtime remains unchanged, confirm public contact/privacy information, then announce launch.

## Rollback

Disable new website intake using its Production flag and rebuild if activation has caused a problem. For website cutover rollback, restore exact saved www Zoho CNAME and original apex record state; remove only newly introduced apex/www records when the snapshot proves they did not exist. Leave app/MX/TXT/NS untouched. Roll website deployment back within its own project if appropriate. Do not roll back rc11, DB security or OCR workers. Existing persisted requests require owner review, not deletion. DNS propagation means rollback is not instantaneous.

## Notifications extension point

Existing shared scheduling domain already returns request status/receipt and has `notifications.ts`/`outbox.ts` extension boundaries in Trimax. Future providers belong behind those existing reviewed domain events (submitted, reviewed, scheduled, reminder), with idempotency and consent. They must not be added to the website form or block submission. No email/SMS provider, delivery promise or public status endpoint added here.

## Files and reproducibility

All implementation files are new under `sites/rnl/`: app routes/styles/metadata, components, content/server wrappers, scripts, package lock/config. Reports/evidence under `docs/handoffs/`. No changes under existing `src`, `scripts`, `release`, `supabase`, root package or Vercel config.

From worktree: `cd sites/rnl`; `npm ci`; `npm run build`; `npm start`; in another terminal `npm test`, `npm run lint`, `npm run typecheck`. `npm run dev` serves port 3108. Shared packaging runs automatically before dev/build. Do not edit ignored `.shared` output.

## Remaining mandatory actions

Review/approve preview and business privacy/contact details; authorize future production deployment/DNS cutover; provide access to the DNS account and complete any required production secret entry/Turnstile domain authorization. A separately authorized end-to-end production scheduling acceptance is still required. Optional gallery photos/testimonials are not fabricated launch gates. Installed-iPhone OCR acceptance remains PENDING and is outside this website task.

Next action: WAIT FOR CHATGPT REVIEW.

## Preview packaging and dependency validation

The initial preview `HHQaZopiXTmn3Wkux1GpodqZxfSi` compiled but failed output packaging with `ENOENT /vercel/path0/.next/routes-manifest-deterministic.json`. The website-only `outputFileTracingRoot: process.cwd()` override made tracing relative to the nested app instead of the repository. Removing it in `89a50a029f5ed8644708b20f4aa71c2e9dc31428` allowed Vercel to infer the repository root. Preview `FyRW1MNM62WFQ2JRDJfSGTh6rsFH` then reached Ready. No release guard was bypassed or changed. The remaining local multiple-lockfile warning explicitly identifies the correct repository root.

The initially inherited Next 16.2.6 package had production dependency advisories. Website-only commit `8d013d68838670de76daff181e5a45607579ce6b` pins Next and eslint-config-next 16.4.0. Root Trimax dependencies remain unchanged. The official release is https://github.com/vercel/next.js/releases/tag/v16.4.0. Final local production build, lint, TypeScript and all 75 website checks PASS again. `npm audit --omit=dev`: **0 vulnerabilities**. Full development audit still reports five high entries along the eslint-config-next → fast-glob → micromatch → braces chain; npm proposes an unrelated major downgrade. This is recorded, not silently overridden. No assertion of zero development-tool advisories is made.

Tablet 768×1024 and large desktop 1920×1080 were also captured and visually reviewed after the dependency update. No horizontal overflow was observed. These are browser viewport tests, not physical-device certification.

## Final deployed verification — 2026-10-12

**Preview PASS:** `GMAWWYWtWzpK4Sgp75zMKWtJmV6j`, source `8d013d68838670de76daff181e5a45607579ce6b`, Vercel explicitly shows **Preview / Ready**, build duration 1m 4s, completed October 12, 2026 02:35:44 PDT. URL: https://rnl-public-website-p0oc104rr-trimax-s-projects.vercel.app. Vercel authentication remains enabled; Robbie may need his Vercel session to review. No protection was weakened for testing.

All nine public content pages returned 200 with canonical/OG metadata and no internal-host references during remote checks. The remote aggregate then stopped at `/admin` because Vercel redirected the unauthenticated HTTP client to its login, not because an admin route was exposed. Its remaining HTTP assertions are **not claimed as passed remotely**. The complete 75-check suite passed against the local production build. Signed-in browser checks showed the website's branded 404 for `/admin`, `/queue`, `/invoices`, `/payments`, `/jobs`, `/clients` and `/login`.

The deployed shared form was exercised through contact, project details and review with clearly synthetic data (including a date retained in review). Submit displayed: **“Website review only. Submissions are disabled; no request has been sent.”** No production RPC/persistence was invoked. This verifies the deployed disabled-preview boundary, not live Turnstile/Upstash/owner-inbox acceptance.

Final deployed desktop Home/Schedule and mobile Schedule at 390×844 and 430×932 were captured. Mobile widths were checked from rendered DOM (390 / 390 and 430 / 415 viewport/content respectively); no horizontal overflow. Local Allura rendered as the Next local `script` family. Screenshots use `preview-` filenames. Browser-native controls were used when the injected Playwright click did not advance the form. No application change was made for the automation limitation.

**Production cutover: NOT AUTHORIZED / NOT READY YET.** The built preview is ready for review. Business contact/privacy approval, production configuration/credential freshness, domain attachment/DNS authorization and separately approved live scheduling acceptance remain required. No production changes, DNS changes, payment mutations, worker restarts, migration or secret minting occurred.
