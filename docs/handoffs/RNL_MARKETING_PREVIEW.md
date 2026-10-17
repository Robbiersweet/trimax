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
