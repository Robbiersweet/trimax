# Website-only fence and branding candidate — 2026-10-26

Base: marketing production `7e0ca069a5cbbb2c38aa05e8705113a5cc769e18`.
Branch: `codex/rnl-fence-brand-release`.

Reuses approved branding `56858ddfccc417f056aecea00474baf600c28228` and website-only Next.js security patch `3daecdead20aa9d149dd367d61a61e2106d40e66`. No later workflow, scheduling, SMS, storage or database changes were imported. All candidate changes are under `sites/rnl`. Existing scheduling/form/API and shared sources are byte-identical to production.

## Fence photography

Public project: **Cedar Privacy Fence Replacement — Everett, WA** at `/gallery#cedar-privacy-fence`.
Order: IMG_1947 hero, IMG_1946 overview, IMG_1966 retaining wall, IMG_1967 courtyard, IMG_1968 terrain/roots, IMG_1965 and IMG_1964 construction context. All seven original photographs are represented without fabricated cleanup. Captions explicitly acknowledge tools, equipment and construction materials. No customer or property name is published.

The existing responsive Next Image gallery, keyboard-accessible dialog, thumbnails and full-image links are reused. Only the selected full-size image loads eagerly in the viewer. Source WebPs retain full frames; cover uses the existing responsive object-fit crop. Supplied WebPs have no EXIF/XMP metadata.

Original ZIP remains untouched at `C:/Users/robbi/Downloads/rnl_cedar_fence_gallery_assets.zip`.
SHA256: `f6392a450ac8d5e287fd8782e34533a0f2bf0201d568d2688f3e04663ee933ac`.
ZIP entry destinations were checked for traversal before extraction. Original JPEGs and contact sheet remain at `C:/Users/robbi/AppData/Local/Trimax/rnl-fence-assets-20261026/`; originals are not deployed publicly.

## Branding

Approved crossed-hammer mark with orange border, ICO 16/32/48 frames, SVG, Apple 180, manifest 192/512/maskable512, 1200x630 social image. The declared ICO uses `/brand/rnl-favicon-v1.ico` to change the old icon cache identity. `/favicon.ico` remains an identical discovery fallback; file-based SVG is also the approved mark. Browser-specific existing tab caches may outlive HTTP updates; actual physical iPhone DuckDuckGo acceptance remains owner-device evidence, not desktop emulation.

## Local evidence

- Production build PASS (Next16.4.3).
- ESLint and TypeScript PASS.
- Credential boundary PASS.
- 78 shared-source, routing, isolation, security and SEO checks PASS.
- Actual API-route mock runtime regression PASS; no production/provider requests made.
- Brand regression PASS: homepage/gallery/schedule metadata, PNG dimensions, ICO frames and versioned fallback byte parity, separate marketing browser manifest/maskable icon, both social image URLs.
- `git diff --check` PASS.

Parent release operator owns browser visual review, live pre/post scheduling checks, deployment identity/rollback, production asset/cache verification and final handoff. Local testing does not establish actual customer delivery or physical-device presentation.
