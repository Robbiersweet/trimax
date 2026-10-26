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

## Verified production release — 2026-10-26

Live: https://rnlcreations.com. Executable source `f9da1b1bd69c9e44fe639fd322f76d5bf76bf003`; Vercel Production deployment `7T5cUBUEdY3nU9zgNKC8rDZqCjg6`, Ready, 50-second build. Promoted from verified Preview `FdrBwp97dFtxYVVweBmQBhvMDLqU`; Vercel rebuilt with existing Production environment. No environment, credential, DNS, TriMax application, schema or worker changes.

All nine public pages and 21 icon/manifest/social/photo endpoints returned200. Seven photographs and binary branding assets match committed bytes. SVG differs only by WindowsCRLF/GitLF; normalized bytes match. Icons advertise `public, max-age=0, must-revalidate`, ETags, new versioned URLs and hashed favicon fallback. Live rendered metadata points to approved mark, Apple180, separate marketing manifest and social1200x630. Small32px mark rendered visibly in browser; this is not physical DuckDuckGo tab-overview acceptance.

Production desktop and390px viewport gallery inspected: fence first, CustomCarpentry filter works, seven thumbnails, next-photo and retaining-wall selection work, actual optimized image loads. No mobile horizontal overflow. Viewport override reset. Live scheduling has no preview banner/restriction. All shared/form/API code remains unchanged from formerproduction. Both before/after invalid-body probes return422 from the guarded runtime after production business lookup, without persistence.

Actual postdeployment browser form submission succeeded once with synthetic contact data: `REQ-7e93ca77a92d4c239f4aebc493b842d2`, Website Branding Acceptance20261026. Read-only production query verified exactly1 request, pending_confirmation, queue_item_idNULL, one owner notification. Two registered push deliveries reached delivered/attempts1 (provider acceptance, not physicalphone evidence). Email remains pending/attempts0 to non-deliverable example.invalid; noSMS delivery. No client, Queue, appointment or financial conversion performed. Preserve this labeled test/audit evidence; do not dispatch/contact/bill it.

TriMax production freshly confirmed unchanged: `885d01f18b1811de7f2be8fe33ec9d8858056d20` / `6G2N5TMoymwBRm48NKrtt8Qbr7Xc`. Candidate upgrade remains separate. Email/SMS activation was not changed.

Private evidence: `C:/Users/robbi/AppData/Local/Trimax/rnl-fence-release-20261026/`: live-http.json, production-deployment.png, live-gallery-desktop.png, live-gallery-mobile.png, live-icon-32.png, live-request-receipt.png, request-database-verification.txt. Local review server stopped.

### Exact website-only rollback

In Vercel team trimax's projects, project rnl-public-website, open previous verified deployment https://vercel.com/trimax-s-projects/rnl-public-website/7nhM28FWzouDAL8HwXyom7fX7VbB (source7e0ca069a5cbbb2c38aa05e8705113a5cc769e18). Deployment Actions -> Instant Rollback -> verify only website production domains and confirm. Option observed enabled; not executed. Then verify homepage/gallery/schedule and422 no-write runtime probe. Do not roll back TriMax/schema, change secrets, or delete persisted requests. Existing tags rollback/rnl-marketing-20261017 ->34fa3b47f16890a9de09b253848ecf8a690f4e9b and rollback/trimax-service-workflow-20261018 ->4e3d786e12092c5ffde86d8324cd6c23ce6670cf remain unchanged.

### Remaining device check / exact resume

On physical iPhone DuckDuckGo, open https://rnlcreations.com in a new tab, allow loading, then inspect tab overview. Expected: white crossed hammers in orange-bordered black mark, not blueRn. Existing saved tab thumbnails may remain cached; close/reopen only the old R&L tab before considering site-specific cache clearing. Do not clear all browser data. Confirm actual device result separately; desktop viewport testing is not iOS/WebKit or tabchrome acceptance. No code or redeployment needed solely for this evidence.

Website implementation/live intake accepted; only physical browser-specific icon presentation remains. Main TriMax readiness checkpoint c062ecb contains prepared intake/native cutover procedure and retained rc10 evidence; no main production upgrade is authorized by this website release. Future app release must preserve this website version and intake compatibility. Do not blindly promote the older combined lab branding branch.
