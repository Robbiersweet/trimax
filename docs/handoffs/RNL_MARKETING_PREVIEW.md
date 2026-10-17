# R&L marketing preview

Production verified 2026-10-17 in Vercel: project rnl-public-website, deployment 6cLBYLrEF8m87MpTDYnJsYvwq2Dc, Production domain rnlcreations.com, source 34fa3b47f16890a9de09b253848ecf8a690f4e9b. Internal Trimax is a separate deployment and is not targeted.

Recoverable Git checkpoint: rollback/rnl-marketing-20261017 resolves to that full commit; git cat-file verified the commit object. Development branch codex/rnl-marketing-portfolio starts exactly there in an isolated worktree. Discarding this preview requires no production changes. If later approved and deployed, restore the recorded Vercel deployment using its rollback/promote workflow with separate authorization. Source recovery: git switch -c codex/rnl-marketing-recovery rollback/rnl-marketing-20261017 in a separate checkout. Preserve production environment settings.

Repository asset inspection found approved branding/workshop imagery only, no authentic project photos. No fabricated project imagery, customer screenshots or before/after comparisons added. Owner-supplied projects are grouped separately. Add approved photos under sites/rnl/public/projects and populate image/alt in lib/projects.ts. Use matching 1200x900 display crops and keep originals privately. Sound booth stages, partition, coffee bar, church entry/threshold, apartment interiors/cabinets/fireplace and trailer plumbing have distinct IDs. Before/after requires confirmed matching source photos.

Manager copy is grounded in src/app/new-request/page.tsx unit/property/request workflow. The graphic is explicitly a workflow illustration, not a platform screenshot. No automatic appointments, SMS or realtime progress promised. No portal permissions/routes changed.

Preview submissions remain blocked before production provider access by the unchanged handler. Production scheduling remains unchanged.

## Validation

Website production build, lint and TypeScript PASS. Existing credential-boundary and submission-runtime regressions PASS; all 78 website routing/security/SEO checks PASS. Shared scheduling source provenance matches all 15 canonical files. Protected src, supabase, release and website API/runtime configuration have zero diff from the rollback commit.

Browser review at 390, 430 and 1280px: home, gallery, property-manager, schedule and contact pages each have one h1, no horizontal overflow, no broken loaded images and no broken local anchors. Mobile navigation opens and selecting Our work closes it and navigates correctly. Desktop gallery and homepage and mobile manager layout visually inspected. Existing brand image optimization preserved; new collection cards add no image payload or client JavaScript. No customer submissions performed.

Rollback tag was pushed and verified with git ls-remote: 34fa3b47f16890a9de09b253848ecf8a690f4e9b refs/tags/rollback/rnl-marketing-20261017. Preview source ac6ca165dfaeae950de4d71d26d784d5692bd9f6. No production promotion or configuration change.

## Preview delivery

Ready Preview deployment: HzAuQ5r8nF5A5TzHgCjMG2B7PZJ9, source ac6ca165dfaeae950de4d71d26d784d5692bd9f6. URL: https://rnl-public-website-mm4uxqy5l-trimax-s-projects.vercel.app/gallery . Vercel explicitly shows Preview and custom-domain assignment skipped. Authenticated browser verifies portfolio and disabled scheduling form. Remote route/SEO checks passed for all nine public pages; unauthenticated automated internal-route test stopped at Vercel Authentication (302), not an application defect. Authenticated browser verified /admin displays the website 404. Local full isolation suite passed. Existing Vercel preview protection remains unchanged; owner may need Vercel sign-in to review.

Screenshot: rnl-portfolio-preview.png. Production deployment remains 6cLBYLrEF8m87MpTDYnJsYvwq2Dc at 34fa3b4; no production deploy, database, credentials, DNS, internal Trimax or worker changes. Future task: review preview, add authentic approved project photos when available; production promotion requires separate approval.
