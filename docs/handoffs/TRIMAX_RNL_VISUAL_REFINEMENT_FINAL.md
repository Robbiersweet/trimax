# R&L scheduling — approved-reference visual refinement

## Scope
October 11, 2026. Scheduling Preview branch only: codex/public-scheduling-foundation. Reference: approved phone mockup codex-clipboard-bd4e1efc-5499-48a4-9cf6-f7f03e4b6b81.png; before screenshot codex-clipboard-1ed6c91b-537f-4ccb-84ff-fd3db4ed3e3c.png. Preserved prior local frame removal and brighter orange. No scheduling/submission, backend, security, payment, OCR, worker, configuration or production changes.

## Font selection
Rendered Caveat, Allura, Dancing Script, Sacramento and Yellowtail locally with the exact tagline. Selected **Caveat 400**: informal slant, simple capitals, open letterforms and natural handwriting fit the reference better than Allura's formal loops, Dancing Script's decorative capitals, Sacramento's narrow loops or Yellowtail's heavy brush strokes. Close visual substitute; the mockup's exact font is unidentified.

Locally hosted with next/font/local, --font-craftsman-script; preloaded hashed Next asset, no runtime CDN. Applied only to hero tagline and existing footer micro-tagline. Removed primary system-script stack. White hero script and orange underline match the reference treatment. Desktop 42px; mobile fluid 25–38px; weight 400. Body/form fonts unchanged.

Source: https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf
License: https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/OFL.txt
SIL Open Font License 1.1 bundled unchanged. Copyright 2014 The Caveat Project Authors.
403,648 bytes; SHA-256: 0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988.

## Logo, hero and palette
Original logo bytes unchanged. Proportional overflow window removes baked outer white frame; screen blend integrates black background into workshop. No redraw/card/mat. Badge upper-left beside script, directly above title, on desktop/mobile.

Headline preserves words with presentation-only uppercase/line breaks and orange ONLINE. Wider rounded CTA. Existing workshop, lower content, form/state/validation, request-not-booking disclosures and footer organization preserved.

Orange: #ff850a CTA/icons/progression/flourish; hover #ff9b2e; footer script #ff941a. Dark labels #b44900 / #a84300 retain contrast on ivory.

## Side-by-side comparison
Subjective similarity scores, not pixel-difference measurements.

| Area | Before | After |
|---|---|---|
| Script | OS-dependent orange printed handwriting | White local Caveat/slant/flourish; 4/5 |
| Logo position | Detached framed right-side image | Upper-left with script, above headline; 5/5 relationship |
| Logo scale | Detached square emphasis | Prominent badge balanced with script; 4/5 |
| Hero spacing | Separate copy/logo columns | Unified upper pair, headline/CTA below; 4/5 |
| Orange | Muted #f49a38 | Vivid #ff850a; 4/5 |
| Composition | Different hierarchy | Badge/script/title/CTA/trust hierarchy; 4/5 |

Intentional differences: existing workshop photo, small brand header, supporting copy, lower content/form/footer retained. No fake menu or phone-frame artwork. Not pixel-identical. Viewport checks do not prove installed-iPhone Safari acceptance.

## Validation
- Local screenshots inspected: 390×844, 430×932, 1280×900. PASS: no clipping, text/logo collisions or horizontal overflow; CTA reachable; complete badge.
- All six scheduling regression groups PASS: domain/storage, boundaries, authorization/security, owner isolation, Phase 2, Preview isolation.
- Lint PASS; TypeScript PASS; optimized Next build PASS (48 pages).
- RequestForm, API/domain/storage/auth, package/lockfile and Vercel configuration unchanged.
- Deployed visual and synthetic three-step checks pending deployment at this commit; final receipt to be appended.

## Exact files changed
- src/app/book/[slug]/page.tsx — font loading, upper composition, logo wrapper, headline presentation.
- src/app/book/schedule.css — font, logo cropping, hero grid, orange and responsive styles.
- src/app/book/fonts/Caveat.ttf — original font.
- src/app/book/fonts/OFL-Caveat.txt — license.
- docs/handoffs/TRIMAX_RNL_VISUAL_REFINEMENT_FINAL.md — report.

## Preview
https://trimax-git-codex-public-scheduling-foundation-trimax-s-projects.vercel.app/book/rnl-creations

Production/main remains 9f8f48b851a249caa75c0dc5bdc632f134c1c1c3.
Scheduling logic changed: NO.
Production changed: NO.
Production deployed: NO.
Next action: WAIT FOR CHATGPT REVIEW.


## Final deployed verification
Application commit: e76fd1ce2d528eeea9479043b036fa354476d49d.
Vercel Preview: FUu32Vix56MDDN7R8UrzWewycvdv. Ready October 11, 2026 at 5:32:04 PM PDT; build 1m42s.
Immutable URL: https://trimax-ndo828zd2-trimax-s-projects.vercel.app/book/rnl-creations

- Desktop 1280×900: PASS. Local script loaded, complete 700px responsive logo asset, document width 1270 (no overflow); no frame, collision or clipping.
- Mobile 390×844: PASS. Document width 380; local script loaded; CTA bottom 531px including Preview notice. Badge and script side-by-side, title below.
- Mobile 430×932: PASS. Same composition inspected, no clipping/overlap/horizontal scroll.
- Screenshots of actual deployed page inspected at all three viewports and compared with supplied mockup. Exact Safari/installed-iPhone rendering awaits Robbie; not claimed as physical acceptance.
- Three-step flow and synthetic submission: PASS. Taylor Refinement Preview, taylor.refinement@example.test, fictional 2025550123, Carpentry, October 20 morning. Receipt REQ-7E514CA68925. UI explicitly confirms no real request or notification sent; appointment not confirmed. Start another request resets form.
- Remote Preview build completed its scheduling tests/lint/TypeScript/build wrapper. No additional backend or configuration changes.

Font added: YES, local Caveat. Logo treatment changed: YES. Orange updated: YES.
Mobile: PASS. Desktop: PASS. Ready for Robbie visual review: YES.
Scheduling logic changed: NO. Production changed: NO. Production deployed: NO.
Next action: WAIT FOR CHATGPT REVIEW.
