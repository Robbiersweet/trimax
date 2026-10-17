# R&L photo portfolio preview — 2026-10-17

## Protection

Production stays at deployment 6cLBYLrEF8m87MpTDYnJsYvwq2Dc, commit 34fa3b47f16890a9de09b253848ecf8a690f4e9b. Local and remote rollback/rnl-marketing-20261017 both resolve to that commit. All changes are isolated on codex/rnl-marketing-portfolio. No production promotion, domain, database, credentials, internal Trimax or worker changes are authorized or performed.

## Photography

Selected 30 authentic photos across eight projects: Hope Church sound booth (4), five-panel partition (4), coffee bar (4), doors/hardware/threshold (5), apartment interiors/turns (4), cabinet upgrades (2), fireplace (3), and shaved-ice trailer plumbing (4). Source filename, dimensions, captions and optimized byte size are recorded in sites/rnl/lib/project-photos.json.

Images are orientation-corrected WebP, maximum 1600px, quality 82, totaling 7.66 MB before responsive Next image delivery. Originals remain unchanged. Native expandable galleries support keyboard access and full-photo links. Supporting photos preserve their full framing. Only the matching beige/black fireplace has Before/After labels. Apartment photographs are category examples, not an asserted same-unit comparison. Duplicates, weaker views and the website concept image are excluded. Generic custom-carpentry card omitted because it duplicates the specific church projects; no separate unidentified repair project is claimed. All displayed projects have photos.

The public homepage has photographic collection cards. The gallery has a photo hero and collection navigation. Property-manager workflow and all scheduling/API/security logic are unchanged.

## Validation

Production build, lint, TypeScript, credential-boundary and submission-runtime tests pass; all 78 website routing/security/SEO checks pass. All 15 shared scheduling files retain canonical provenance. Protected src, supabase, release, website API and scheduling runtime paths have zero diff from rollback.

All 30 image URLs return HTTP 200 and decode to their manifest dimensions. Desktop 1280px, tablet 768px and mobile 390px checked without horizontal overflow. All eight galleries expand. Mobile menu closes on navigation; keyboard Enter opens a photo disclosure. Home, property-manager, scheduling and contact pages retain one h1 and no broken loaded images or horizontal overflow. Preview submissions remain disabled; no customer request submitted.

## Deployment

Preview deployment details are recorded after the branch build is Ready. Production requires separate explicit approval.

Ready Preview: 4eFk6mjADvjJSVtFPagruxwP8ePN, source 41c0ba871dd29d0bc83406d6d228ac526fd90438.
URL: https://rnl-public-website-cefd4m81j-trimax-s-projects.vercel.app/gallery
Authenticated deployed-browser verification: all 30 supporting images loaded, eight disclosures opened, no broken images or horizontal overflow. Scheduling retains the preview-disabled notice and unchanged submission guard. Existing Vercel protection remains enabled; owner sign-in may be required. Screenshot: rnl-portfolio-photos-preview.png.
