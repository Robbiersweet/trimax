# R&L website branding — 2026-10-25

## Objective and workspace
Independent marketing favicon/link-preview workstream. Checkout `C:/Users/robbi/.codex/worktrees/rnl-brand-icons/trimax`, branch `codex/rnl-brand-icons`, based on verified marketing production source `7e0ca069a5cbbb2c38aa05e8705113a5cc769e18`.

## Implementation and source
- Branding commit `56858ddfccc417f056aecea00474baf600c28228`.
- Separate framework security patch/deployed preview source `3daecdead20aa9d149dd367d61a61e2106d40e66`.
- Inspected original approved 5334x4268 badge. Cropped its crossed-hammer emblem for tab/bookmark icons; full original seal used in social image. No AI-generated replacement logo.
- SVG, ICO (16/32/48), PNG fallback, 180px Apple touch, 192/512 Android and maskable-safe icon. Marketing manifest uses browser display and its own host/scope, without service worker or TriMax PWA edits.
- Open Graph and Twitter large image:1200x630 approved badge with existing slogan. Old `/opengraph-image` URL still renders the new artwork.
- Versioned `/brand/*-v1.*` references allow future cache invalidation; Next adds a content-hashed favicon URL. Metadata URLs point to canonical marketing host. Existing bookmarks/social caches may require a refresh after authorized production rollout; real iPhone bookmark/icon refresh is not yet accepted.
- Minimal Next/eslint-config-next16.4.0→16.4.3 patch because the existing version reported security advisories and initial build stopped. Official evidence: https://github.com/advisories/GHSA-2464-fhr4-w9xw and https://github.com/advisories/GHSA-673q-mjm6-r5xr (fixed16.4.1+), https://github.com/vercel/next.js/releases/tag/v16.4.3 . No root app framework change.

## Verification
- Patched production-mode build, lint, typecheck passed.
- Existing credential boundary,78 website route/security/SEO checks, actual submission-runtime guards passed against local built server.
- `npm run test:brand` passed: homepage/gallery/schedule metadata, PNG dimensions, ICO directory, manifest identity/icons, social route compatibility.
- `npm audit --omit=dev`:0 vulnerabilities; install audit also0.
- Local rendered16/32/48 icons inspected on light/dark; social artwork inspected. Private screenshots in `C:/Users/robbi/AppData/Local/Trimax/brand-acceptance-20261025/`: `icon-sizes.png`, `social-preview.png`, `hosted-social-preview.png`, `vercel-preview-ready.png`.

## Hosted preview
Vercel deployment `4jz7uRfdRtmErPUWLE3g2yLfduPC` is Ready/Preview, verified exactsource3daecde in authenticated dashboard.
- https://rnl-public-website-1pa4hhx78-trimax-s-projects.vercel.app
- https://vercel.com/trimax-s-projects/rnl-public-website/4jz7uRfdRtmErPUWLE3g2yLfduPC
- Existing authenticated browser verified homepage, preview notice, rendered icon/touch/manifest/OG metadata, social artwork1200x630, manifest JSON and deployed180/192/512maskable/32 pixel icons.
- Unauthenticated CLI HTTP suite redirected to Vercel login; recorded as protection limitation, not a website failure. No protection weakened, no login request, no customer submission.

## Boundary and exact resume
No production deployment, database/credential change, customer message or TriMax PWA/worker change. Existing marketing production remains7nhM28FWzouDAL8HwXyom7fX7VbB; preserve `rollback/rnl-marketing-20261017`.
Parent integrates reviewed commits or uses the existing Ready marketing preview for a separately authorized production rollout. Verify exactsource/settings and live metadata after promotion; production and physical iPhone icon/social cache acceptance remain pending. Changes do not alter scheduling form or its production activation flags. Do not promote the unrelated TriMax preview caused by the shared Git repository.

## Optional SMS consent follow-up (2026-10-25)
Actual marketing `/schedule` now passes a consent-collection capability into the existing shared RequestForm. Separate unchecked optional disclosure uses `transactional-sms-2026-10-25` from the communications workstream. Text preference is only offered with consent collection. Receipt wording no longer promises SMS delivery.

Production collection remains OFF unless `PUBLIC_SCHEDULING_SMS_CONSENT_ENABLED=enabled` is explicitly set after database review. With the flag absent, the form omits both new payload fields, preserving the existing intake RPC contract. An outbound RPC boundary rejects forged consent fields before calling the submit RPC. The existing config lookup and Option C restricted PostgreSQL transport remain unchanged. Preview exposes the optional UI for review but the existing server503 submission block remains in force. No SMS/email sending flag or provider credential is changed.

Activation dependency: apply/review the app workstream's `20261025_communications.sql`, then `20261025_service_request_consent_intake.sql` before enabling collection. The intake migration owns server-side consent timestamp/source/version persistence. This branch does NOT apply/copy database migrations, add a new endpoint, or grant storage access. Consent never overrides STOP suppression. Operational sending remains a separate setup/approval, independent of collection.

Checks:79 local website route/security/SEO checks; consent boolean/current-version/complete-phone validation; gate-off legacy payload; forged gated payload denied before submitRPC; gate-on existingRPC payload; actual component harness verifies unchecked/optional UI, synchronous double-submit exclusion and stable idempotency key on retry. Browser mobile verification delegated to parent because subagent browser inventory became unavailable; local390px iframe harness at localhost3117 was available temporarily, not committed.

Photos/attachments: existing public intake has no request-scoped upload capability or public attachment storage policy. Adding a file input alone would not provide secure tenant ownership, size/type quarantine, completion binding or safe cleanup. No insecure public upload or production bucket/grant was added; this remains a scoped implementation dependency for a later reviewed migration and storage capability flow.

## Request photos candidate (2026-10-25; supersedes earlier dependency-only note)

Ported shared RequestForm/RequestPhotos/browser capability and hash validation into the actual marketing source. Existing brand assets, SMS consent gate, static/direct credential selection and preview submission503 block remain unchanged. Independent PUBLIC_SCHEDULING_PHOTOS_ENABLED gate defaults OFF and cannot enable preview uploads. The outbound RPC boundary rejects forged uploadCapabilityHash when gate is off. Enabled flow uses the same existing submit RPC; no third RPC or privileged website credential. Post-receipt optional uploads target exactly https://app.rnlcreations.com/api/request-photos using memory-only capability, never request secret in URLs.

Activation remains blocked pending app photo candidate review/migration/privatebucket/hosted acceptance. App requires separate REQUEST_PHOTOS_ENABLED gate. All gates remain unchanged/unset. Marketing request success is independent of photo upload failure. No production changes or deployment made.

Verification: public website81 boundary/routing/security/SEO checks PASS; consent and actual form regression PASS; photo gate/forged-payload denial/browser crypto tests PASS; branding PASS; lint/typecheck/local production build PASS. Initial local suite failed because port3108 server absent, then /schedule public-isolation exposed unused disabled endpoint in serialized props; fixed by omitting endpoint prop when disabled, rerun81 PASS. No browser physical acceptance claimed.

Last hosted preview verified by parent: deployment GLV3gyGfkQuk4dDNjT1mcqh1uP1X, exact source26f6a37, immutable https://rnl-public-website-aww039dte-trimax-s-projects.vercel.app. This photo candidate is NEW and has NOT been pushed/deployed to a new preview. Prior preview evidence does not cover these changes. Root reviews/pushes next.
