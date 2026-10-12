# Scheduling integration inventory

Started from corrected rc11 d4f4e6c. Source checkout preserved. Public status is intentionally disabled. No database migrations or Vercel build guard copied over.

| File | Category | Integrated | Reason |
|---|---|---|---|
| docs/handoffs/TRIMAX_PUBLIC_FUNCTION_HARDENING_AND_INTAKE.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_PUBLIC_SCHEDULING_FOUNDATION.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_PUBLIC_SCHEDULING_PHASE2.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_PUBLIC_SCHEDULING_PRODUCTION_LAUNCH.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_PUBLIC_SCHEDULING_RC10_PREVIEW.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_RNL_FINAL_SCRIPT_FONT.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_RNL_HERO_TARGET_MATCH.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_RNL_VISUAL_REDESIGN.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_RNL_VISUAL_REFINEMENT_FINAL.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_SCHEDULING_CREDENTIAL_READY.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_SCHEDULING_INTAKE_PROVISIONED.md | F | false | Historical handoff; inventory only, not runtime |
| docs/handoffs/TRIMAX_SCHEDULING_SECRET_PROVISIONING.md | F | false | Historical handoff; inventory only, not runtime |
| package.json | E | false | Merge only scheduling test command |
| public/branding/rnl/rnl-original-badge.png | D | true | Selected scoped integration |
| public/branding/rnl/workshop-preview.png | D | true | Selected scoped integration |
| scripts/provision-scheduling-token.mjs | C | false | Already reviewed in rc11; preserve exact candidate copy |
| scripts/public-scheduling-authorization-regression.ts | E | true | Selected scoped integration |
| scripts/public-scheduling-boundary-regression.ts | E | true | Selected scoped integration |
| scripts/public-scheduling-challenge-ui-regression.cjs | E | true | Selected scoped integration |
| scripts/public-scheduling-owner-regression.ts | E | true | Selected scoped integration |
| scripts/public-scheduling-phase2-regression.ts | E | true | Selected scoped integration |
| scripts/public-scheduling-phase2-sql-regression.mjs | E | false | Keep already reviewed rc11 test |
| scripts/public-scheduling-preview-build.cjs | F | false | Preview-only route/build wrapper; retain production Vercel guard |
| scripts/public-scheduling-preview-regression.ts | F | false | Preview-only route/build wrapper; retain production Vercel guard |
| scripts/public-scheduling-production-regression.ts | E | true | Selected scoped integration |
| scripts/public-scheduling-regression.ts | E | true | Selected scoped integration |
| scripts/public-scheduling-schema-regression.mjs | E | false | Keep already reviewed rc11 test |
| scripts/public-scheduling-scope-audit.sql | C | false | Already reviewed in rc11; preserve exact candidate copy |
| scripts/public-scheduling-seed-rnl.sql | C | true | Selected scoped integration |
| src/app/admin/service-requests/components/OwnerWorkspace.tsx | B | true | Selected scoped integration |
| src/app/admin/service-requests/components/owner.css | B | true | Selected scoped integration |
| src/app/admin/service-requests/page.tsx | B | true | Selected scoped integration |
| src/app/api/public-scheduling/[slug]/route.ts | C | true | Selected scoped integration |
| src/app/api/public-scheduling/intake/route.ts | C | true | Selected scoped integration |
| src/app/api/public-scheduling/review/route.ts | C | true | Selected scoped integration |
| src/app/api/public-scheduling/settings/route.ts | C | true | Selected scoped integration |
| src/app/book/RequestForm.tsx | A | true | Selected scoped integration |
| src/app/book/TurnstileChallenge.tsx | A | true | Selected scoped integration |
| src/app/book/[slug]/page.tsx | A | true | Selected scoped integration |
| src/app/book/demo/page.tsx | F | false | Preview-only route/build wrapper; retain production Vercel guard |
| src/app/book/demo/workspace.tsx | F | false | Preview-only route/build wrapper; retain production Vercel guard |
| src/app/book/fonts/Allura-Regular.ttf | D | true | Selected scoped integration |
| src/app/book/fonts/OFL-Allura.txt | D | true | Selected scoped integration |
| src/app/book/page.tsx | A | true | Selected scoped integration |
| src/app/book/schedule.css | D | true | Selected scoped integration |
| src/app/components/RouteAccessBoundary.tsx | A | true | Selected scoped integration |
| src/app/layout.tsx | A | true | Selected scoped integration |
| src/app/lib/publicScheduling/abuseProtection.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/authorization.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/capability.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/conversion.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/developmentStore.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/domain.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/httpBody.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/notifications.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/outbox.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/ownerWorkflow.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/productionAdapter.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/productionHandler.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/productionOwner.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/productionRuntime.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/productionService.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/providers.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/reviewEnvironment.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/routes.ts | C | true | Selected scoped integration |
| src/app/lib/publicScheduling/settings.ts | C | true | Selected scoped integration |
| supabase/migrations/20261009_public_scheduling_foundation.sql | C | false | Already reviewed in rc11; preserve exact candidate copy |
| supabase/migrations/20261010_public_scheduling_phase2.sql | C | false | Already reviewed in rc11; preserve exact candidate copy |
| supabase/migrations/20261011_public_scheduling_runtime.sql | C | false | Already reviewed in rc11; preserve exact candidate copy |
| vercel.json | F | false | Preview-only route/build wrapper; retain production Vercel guard |
