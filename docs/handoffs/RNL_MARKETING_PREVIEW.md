# R&L portfolio redesign preview — 2026-10-17

## Scope and recovery
Production remains deployment 6cLBYLrEF8m87MpTDYnJsYvwq2Dc at 34fa3b47f16890a9de09b253848ecf8a690f4e9b. Local and remote rollback/rnl-marketing-20261017 preserve that commit. Prior photo-gallery preview is recoverable at pushed tag preview/rnl-photo-gallery-20261017 (276834b2d70cc293fdd2fd8a269a82e592a4a649) and immutable deployment 4eFk6mjADvjJSVtFPagruxwP8ePN. Work is isolated on codex/rnl-marketing-portfolio. No production promotion, domain, database, authentication, internal Trimax or scheduling changes.

## Redesign and curation
Dark charcoal/orange compact eight-card gallery follows the supplied visual concept. Seven category filters; four/two/one-column responsive grid; dedicated threshold and fireplace before/after cards; orange scheduling CTA. Native modal shows uncropped photos with captions, thumbnails, previous/next, arrow/Home/End keys, Escape, explicit Tab wrapping, focus restoration and full-image links. Existing homepage collection links remain supported.

Reviewed all 85 original JPGs. Selected 19 authentic originals: sound booth 2, coffee bar 1, partition 3, entrance/security 2, threshold 2, fireplace 2, apartments 4, trailer plumbing 3. Manifest sites/rnl/lib/project-photos.json records source filenames, dimensions, descriptions and cover crops. 27 optimized WebP assets (19 full views plus 8 cover crops), 5,108,588 bytes. Originals untouched. Concept is not used as project photography.

Removed the apartment painting photo with trash cans/buckets/supplies, redundant views and weaker construction images. Cabinet upgrades are represented within the apartment card rather than a duplicate filler project. No illuminated keypad/RFID photograph was located; strongest authentic interior entrance with installed exit hardware is used instead. Exposed exterior wiring-hole photographs are excluded. Finished work is primary; booth framing is retained as meaningful process context. Threshold and fireplace pairs are matching subjects; apartment photos are not claimed as same-unit before/after.

## Validation
Build, lint and TypeScript pass. All 78 website boundary/routing/security/SEO checks, credential boundaries and submission-runtime tests pass against the new production build on port 3119. All 15 shared scheduling files retain canonical provenance. Protected source/API/scheduling/release/database paths have zero diff from production rollback.

All 27 assets HTTP 200 and decode. All seven filters return expected counts (8/4/6/2/3/1/4). All eight viewers and all thumbnail choices exercised. Arrow/Escape navigation, Tab wrapping and opener focus restoration verified. Desktop 1440px, tablet 768px and mobile 390px checked with no horizontal overflow. Mobile menu, apartment collection hash and scheduling CTA checked. Preview submissions remain disabled; no customer request submitted.

## Deployment
New branch Preview only. Ready URL and deployment verification recorded after Vercel finishes. Existing Vercel sign-in protection is retained.

Ready Preview: 7jhnKZG1qgKvG9S2Y7tATrhjRipe, source c949e86ca95c8289c654344239312c55a930bc27.
URL: https://rnl-public-website-kl10sbh9u-trimax-s-projects.vercel.app/gallery
Vercel confirms Ready / Preview. Authenticated deployed-browser checks: eight cards, specialty filter, before/after navigation and all 19 full photos loaded successfully; no broken images or horizontal overflow. Screenshot: rnl-dark-portfolio-preview.png. Production overview still shows original deployment 6cLBYLrEF8m87MpTDYnJsYvwq2Dc and commit 34fa3b4. Existing preview sign-in protection remains unchanged. No functional blockers; ideal illuminated RFID/keypad photo remains unavailable.

## Approved production deployment — 2026-10-17
User explicitly approved publishing the exact preview with no further design/code changes. Promoted approved preview 7jhnKZG1qgKvG9S2Y7tATrhjRipe through Vercel, which rebuilt the exact source c949e86ca95c8289c654344239312c55a930bc27 using existing Production environment configuration.

Production deployment: 8vAGJgTusxopqctycxSxVk7AueXZ (Ready, Production), immutable URL https://rnl-public-website-hb9u5dnx1-trimax-s-projects.vercel.app; live https://rnlcreations.com. No executable modifications, project configuration changes, database writes, internal Trimax deployments or customer requests were made.

Validation: fresh production-mode build passes; 81 local production-mode routing/security/SEO checks plus credential/submission-runtime suites pass (local environment intentionally has no production credentials). Live homepage/gallery/services/about/property-managers/contact/schedule/privacy/request-terms all HTTP 200. All 27 image assets HTTP 200. Production robots allow public pages and disallow API. Browser checked homepage, navigation into gallery, all seven filters (8/4/6/2/3/1/4), before/after photo navigation, Escape and focus restoration. Live form loaded production business options and reached Review your request using a synthetic unsent draft, then reload discarded it. No preview banner or form restriction. Empty POST with text/plain and correct origin returned 415 JSON required, verifying enabled production runtime before any persistence/business request lookup. Successful submission/delivery intentionally not exercised. Shell Node fetch timed out; curl and browser checks succeeded.

Rollback checkpoint rollback/rnl-marketing-20261017 remains local and remote at 34fa3b47f16890a9de09b253848ecf8a690f4e9b. Exact rollback: open https://vercel.com/trimax-s-projects/rnl-public-website/6cLBYLrEF8m87MpTDYnJsYvwq2Dc, choose Deployment Actions > Instant Rollback, confirm the previous production deployment and rnlcreations.com/project-qzogk.vercel.app aliases, then confirm rollback. Verify live homepage and schedule afterward. The Instant Rollback menu is available on that exact old deployment. No rebuild or code reset is needed. Screenshot: rnl-portfolio-live.png.
