# R&L Hero Target Match

## Authority and scope
Image 2 (codex-clipboard-52532d48-1ef8-4182-97d8-5a92fdb60c2e.png) is the approved target. Image 1 (codex-clipboard-83546c3f-64e6-4ecc-8185-7c224f4f93f3.png) is the actual before state. This supersedes the previous handoff's subjective similarity scores. Work is restricted to scheduling Preview branch codex/public-scheduling-foundation.

## Changes
- R&L's redundant top brand bar no longer consumes a separate horizontal row. The real badge now provides hero branding.
- Desktop badge window enlarged from 270px to 330px; headline reduced from 56px to 48px. Badge/title size ratio increases materially, with the badge bottom immediately above the title.
- Desktop content group is 642px wide over the full-width workshop image. Badge/script columns are 330px + 12px gap + 300px; no distribution across the full canvas.
- Existing local Caveat retained. Explicit three lines: Your home and its / appearance is our / reputation. Script sits beside badge with left-aligned grid ownership and centered handwriting within that narrow region. Orange flourish follows it.
- Tight three-line white/white/orange headline maintained, with reduced intervening whitespace.
- CTA enlarged to 540×70px on desktop, with black calendar icon, centered label and right chevron. Mobile remains a generous full-content-width 54px action.
- Trust strip moved into the same content alignment directly below CTA/disclosure; larger outlined symbols, stacked uppercase labels and vertical separators. Home icon replaces location pin for Proudly Local.
- Added only a GET STARTED / 3 SIMPLE STEPS transition above the existing lower layout. Information column, form, footer and all fields remain intact.
- Preserved original badge bytes and no-frame treatment, Caveat asset/license, #ff850a orange, workshop asset and Preview isolation.

## Direct visual comparison
| Criterion | Assessment |
|---|---|
| Logo scale | PASS: prominent badge relative to headline; desktop 330px versus previous 270px. Mobile ~150–167px proportionate to compact heading. |
| Logo position | PASS: lower edge meets the headline group; separate header row removed. |
| Tagline position | PASS: directly right of badge, confined to paired block. |
| Tagline line breaks | PASS: target's three lines fixed consistently at 390, 430 and 1280 widths. |
| Heading relationship | PASS: tighter three-line title under badge, no wide independent headline. |
| CTA size | PASS: 540×70 desktop; mobile full content width, 54px minimum; calendar and chevron. |
| Trust strip | PASS: aligned with composition, immediately follows action/disclosure, larger two-line items. |
| Vertical rhythm | PASS: no tall brand-header separator; compact pair/title/copy/CTA/trust group; direct ivory transition. |

Screenshots inspected locally at 390×844, 430×932 and 1280×900. No clipping, collisions or horizontal scrolling. These are composition judgments, not a claim of pixel identity or user approval. Original workshop differs from mockup by instruction; retained supporting copy, request-not-booking disclosure, lower information column/form/footer and Preview notice also differ intentionally. No fake menu was added. Physical iPhone testing is not claimed.

## Functional checks
Public scheduling regressions: PASS (six groups: domain/storage, boundaries, authorization/security, owner/settings, Phase 2, Preview isolation).
Lint: PASS.
TypeScript: PASS.
Optimized Next build: PASS (48 pages).
Diff whitespace: PASS.
No changes to RequestForm, API, persistence, validation, auth, tenant boundaries, Preview configuration, OCR, payments or workers.

## Exact files
- src/app/book/[slug]/page.tsx
- src/app/book/schedule.css
- docs/handoffs/TRIMAX_RNL_HERO_TARGET_MATCH.md

## Preview
https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/book/rnl-creations

Deployment and final deployed visual receipt will be appended after publishing this commit.
Scheduling logic changed: NO.
Production changed: NO.
Production deployed: NO.
Next action: WAIT FOR CHATGPT REVIEW.
