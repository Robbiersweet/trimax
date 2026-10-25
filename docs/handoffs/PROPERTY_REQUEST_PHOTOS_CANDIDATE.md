# Manager request photos — local candidate

## Scope and implementation
Authenticated property managers can optionally add multiple photos after a successful request receipt. The request success remains independent of photo upload success. Shared uploader enforces 4 MiB per image, four files and 12 MiB combined, displays progress, preserves file order after out-of-order responses, retries each failed upload using its original upload ID, and obtains a fresh authenticated token for every attempt. The capability secret remains browser-memory-only; only its SHA-256 hash enters the idempotent request payload.

The new authenticated route reuses the existing bounded body, image decoding/metadata stripping, private storage adapter and interrupted-write recovery. Disabled-by-default and preview/project/origin gates remain active. It validates Auth before reading the body. Authenticated RPC wrappers enforce the original submitter and current exact property/business assignment. The existing service-only photo RPCs also deny manager-source access without that same identity check; possession of a public upload capability cannot bypass revoked manager membership. Assignment is rechecked on completion. Existing owner-authorized photo listing remains unchanged. Queue association uses the existing request ID and business ID; no copied attachments or new Queue mutation.

## Migration and authority
Apply only after explicit hosted approval, following `20261025_property_request_intake.sql` and `20261026_request_photo_candidate.sql`:
`supabase/migrations/20261026_property_request_photos.sql`.

It replaces the existing property submission and shared reserve/complete functions, and adds two authenticated-only wrapper RPCs: `trimax_reserve_property_request_photo` and `trimax_complete_property_request_photo`. No new bucket, credential or table. No new intake/anon/service-role EXECUTE grant on those wrappers. Parent release catalog/gate must review the two added authenticated functions. Existing private bucket setup remains a separate reviewed prerequisite. Nothing was applied to hosted databases.

## Evidence
PASS: new PGlite SQL regression (14 checks), actual route authorization regression, actual property page regression, actual uploader regression; existing property SQL (32 checks), existing property UI, public-photo UI, photo-intake SQL and photo SQL regressions. PASS: targeted ESLint and full TypeScript no-emit.

Tests cover cross-property/business denial, revoked/reassigned submitters, public-route bypass denial, idempotency mismatch, original upload retry IDs, same-tick upload guard, progress, mixed success/failure, out-of-order response ordering, exact Queue/request/business attachment association and request-success preservation. PGlite is not independent-client concurrency proof. No hosted storage/Auth/photo acceptance was performed.

## Synthetic visual review
Run `node scripts/property-request-photo-render-fixture.cjs` from this checkout; visit `http://127.0.0.1:3199/manager-photos`. Loopback only, actual component render snapshots from synthetic regressions, inert controls, no network provider/client data. Includes mixed upload outcomes. Review at 390×844, 430×932 and desktop. Baseline fixture CSS is not the full app Tailwind build; production visual acceptance remains unverified. Inline uploader width wrapping, progress width and 44px targets are exercised by source/React tests.

## Integration and boundaries
Cherry-pick candidate, review changed SQL and catalog expectations, then run the full release gate before any deployment. No production changes, credentials, deployment, grants, bucket activation or scheduling activation. No OCR/payment changes. Public website source was not modified.
