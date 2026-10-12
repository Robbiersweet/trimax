# R&L Final Script Font

## Scope
Font-only change on codex/public-scheduling-foundation. The approved hero layout, badge, orange, workshop, headline, CTA, trust strip, lower page, form, scheduling/backend/security and production are unchanged.

## Selected font
Allura Regular, weight 400, locally hosted through the existing next/font/local declaration. Connected cursive strokes, smooth baseline, natural slant and lighter handwritten character replace Caveat's printed/marker appearance. Tested Allura first as requested; it met the requested connected-cursive requirement, so no further font search was needed. This is not a claim of identifying the exact font in the raster mockup.

Applied only to the hero tagline and existing footer script accent. Existing three explicit tagline lines, position, rotation and orange flourish styling retained. Script metrics only: desktop 42px; mobile clamp(23px,6.2vw,35px), zero letter spacing, existing 1.02 line height. No other element uses this font. Removed unused Caveat binary/license.

Font source: https://raw.githubusercontent.com/google/fonts/main/ofl/allura/Allura-Regular.ttf
License source: https://raw.githubusercontent.com/google/fonts/main/ofl/allura/OFL.txt
SIL Open Font License 1.1; Copyright 2010 The Allura Project Authors.
File: 246,632 bytes. SHA-256: 9c142b2e515832c0dfc4ff8b8ea18f40314943bf937b72e2b23c4661bac14cc6.
The app serves the same bundled file to all browsers through Next's hashed font asset. No third-party runtime font fetch or primary system-script stack. A generated fallback is used only during failed/pending font loading. Windows browser/viewport checks do not claim physical iPhone/Safari testing.

## Files
- src/app/book/[slug]/page.tsx: one font source/weight declaration changed.
- src/app/book/schedule.css: three script-only CSS lines.
- src/app/book/fonts/Allura-Regular.ttf: added.
- src/app/book/fonts/OFL-Allura.txt: added.
- src/app/book/fonts/Caveat.ttf: removed.
- src/app/book/fonts/OFL-Caveat.txt: removed.
- docs/handoffs/TRIMAX_RNL_FINAL_SCRIPT_FONT.md: report.

## Checks
Local visual checks PASS at 390×844, 430×932 and 1280×900. Connected script, three-line flow, no clipping or logo overlap. Hero composition retained.
Public scheduling regressions PASS (all six groups).
Lint PASS. TypeScript PASS. Optimized Next build PASS (48 pages). Diff whitespace PASS.

## Preview
https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/book/rnl-creations
Deployed visual verification receipt follows after Preview publishing.
Scheduling logic changed: NO.
Production changed: NO.
Production deployed: NO.
Next action: WAIT FOR CHATGPT REVIEW.
