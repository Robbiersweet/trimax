# Request-scoped photos — isolated candidate

Base `38e15c5`; branch `codex/request-photo-review`. Production changes NONE. No hosted SQL/bucket/credential/environment/deployment operations. No financial/OCR storage changes.

## Current implementation

- Browser creates 32 random bytes before submission, retains secret only in component memory, sends SHA-256 as optional `uploadCapabilityHash`. Same submit retry keeps hash/idempotency key. Losing memory loses upload access, never recreates request.
- Domain + productionAdapter allow/validate the optional hash. Existing submit RPC hashes the whole payload, so changed upload hash is an idempotency conflict. Proposal stores hash/request/business/30-minute expiry atomically. Existing public-status capability is unchanged. Website retains exactly two RPC permissions.
- Proposed `request_photos` table has enabled/forced RLS; public/anon/authenticated/website direct access denied. Existing app service_role has SELECT only plus new reservation/completion EXECUTE; functions use fixed search path and request row lock. Four reserved/complete slots,5MiB each,12MiB cumulative; immutable completion and stable upload-ID retries. No new credentials.
- `/api/request-photos` is disabled unless `REQUEST_PHOTOS_ENABLED=enabled`. Upload uses bearer capability plus X-Request-ID/X-Upload-ID, not URL tokens. Exact Origin allowlist: https://rnlcreations.com and https://app.rnlcreations.com. Bounded5MiB stream/15s read deadline, no-store, sanitized failures. Native app endpoint cannot activate itself.
- Real sharp decoder accepts JPEG/PNG/WebP only, rejects animation/invalid/oversize/24MP input; rotates and re-encodes JPEG without EXIF/ICC/XMP. Never stores input bytes.
- Existing app service storage adapter targets only new private request-photos-private bucket, never upserts. Upload errors reconcile by downloading the exact bound object and checking exact bytes; mismatch fails closed. Finalization writes dimensions/hash after successful storage.
- Owner GET uses productionOwner authentication and request/business membership, validates stored object path, signs only completed objects for60s. Owner component refreshes links. No public listing/status lookup.
- Shared RequestForm accepts photosEnabled(defaultfalse), photoEndpoint; post-receipt RequestPhotos provides progress, same-file ID retry, error/status messaging and optional selection. Successful request remains successful if photos fail. App book page uses server gate. Owner workspace shows authenticated photo panel.

## Files and proposed changes

`src/app/lib/requestPhotos/{clientCapability,server,upload,storage,http,owner}.ts`
`src/app/api/request-photos/route.ts`
`src/app/book/RequestPhotos.tsx`, `RequestForm.tsx`, `[slug]/page.tsx`
`src/app/admin/service-requests/components/{OwnerRequestPhotos,OwnerWorkspace}.tsx`
`src/app/lib/publicScheduling/{domain,productionAdapter}.ts`
`supabase/migrations/20261026_request_photo_candidate.sql`
`docs/handoffs/request-photo-{storage-fragment,bucket-proposed}.sql`
`scripts/request-photo-{regression.mjs,sql-regression.cjs,intake-sql-regression.cjs,ui-regression.cjs}`

The bucket proposal creates a NEW private bucket limited to scrubbed JPEG5MiB; no existing bucket/policy changes. Nothing executed hosted. Storage fragment duplicates migration portion only for local tests, not a second deployment migration.

## Actual local evidence

All four photo scripts PASS: real decoder rotation/metadata stripping/malformed/size denial; synthetic upload hash-only RPC/storage authorization; bounded body length/size; upload lost-response exact-byte reconciliation; owner/cross-business denial; actual React progress/same-tick/stable retry; PGlite quota/expiry/role denial; full candidate migration chain and hash-bound submission idempotency. Existing seven-suite public scheduling regression PASS. Targeted ESLint PASS.

Full TypeScript at this base reports baseline property-requests/page.tsx:27 PromiseLike.catch only. Root correction3e47dc9 must be retained in integration. No independent PG concurrency, deployed browser/mobile, production build or hosted acceptance claimed. node_modules is a local junction to existing workflow-upgrade dependencies; no dependency installation or package changes.

## Exact separate marketing integration (not done)

Marketing source is separate branch/base26f6a37. App `/book` wiring alone does NOT enable customer website photos. Port shared RequestForm, RequestPhotos, clientCapability, domain and productionAdapter through the site's existing source-sync/build process. Confirm OptionC keeps only trimax_public_scheduling_config and trimax_submit_public_service_request with the same four arguments; p_payload gains only uploadCapabilityHash. The adapter's existing no-other-RPC guard must remain unchanged. At marketing `/schedule`, pass photosEnabled only from a reviewed server-side gate and photoEndpoint='https://app.rnlcreations.com/api/request-photos'. Add no service-role/storage credentials to marketing. Browser uses upload capability only. CORS preflight permits Authorization,Content-Type,X-Request-ID,X-Upload-ID. The app POST exact allowed origin already includes apex; www redirects to apex.

## Release sequence and remaining gates

1. Review/cherry-pick candidate into root retaining3e47dc9; run combined gate.
2. Replay hosted catalog/default ACL/security assertions and independent-client concurrency offline/isolated first. Current PGlite is single-client.
3. Obtain specific production approval for schema/bucket changes. Verify bucket privacy, limits, all effective privileges and hosted RLS; no website grant expansion.
4. Deploy app with gate unset; port marketing candidate and verify disabled behavior.
5. Actual isolated/deployed tests: Origin/CORS, platform body size limits, owner/business denial, signed link expiry, interrupted upload reconciliation and iPhone formats.
6. Only then approve activation. Current flag remains unset; no public photo requests performed.

Current constraints: JPEG/PNG/WebP only (HEIC unsupported),5MiB input limit; verify platform request ceiling before approval. No retention cleanup implemented: reserved slots remain counted and FK prevents deleting parent requests with photos. These intentionally fail closed but require operational retention approval. No cleanup touches financial/OCR data. No paid resources, credentials or customer messages created.

### Preview isolation follow-up

Route runtime validates Supabase project before creating a client: production accepts only the existing protected production project; any nonproduction environment rejects it. Nonproduction requires REQUEST_PHOTOS_ISOLATED_PROJECT matching the URL plus exact HTTPS REQUEST_PHOTOS_ISOLATED_ORIGIN; no wildcard origins. Disabled feature denies writes and returns no owner photos. Synthetic runtime regressions PASS for disabled, preview-to-production rejection and isolated exact origin.

Denial-of-service limit: request body is buffered (maximum5MiB,15s) before capability SQL verification, while expensive image decoding happens only after authorization/reservation. Thus invalid capabilities can still consume bounded request memory and bandwidth. Hosting/WAF concurrency and request-size limits must be validated before deployment; current code does not claim a complete upload abuse/rate-limiting solution. No platform bypass or public endpoint activation occurred.

## Isolated hosting-ceiling follow-up (not yet integrated)

Parent verified Vercel Functions4.5MB payload ceiling: https://vercel.com/docs/functions/limitations. Shared limits.ts now sets input ceiling4MiB (4,194,304bytes) for browser selection and server decode/body checks. Scrubbed output/readback remains5MiB because server-to-storage uploads are not inbound function requests; SQL reservation bounds and bucket quota remain5MiB (application enforces narrower input). Exact4MiB HTTP acceptance and +1byte declared/streamed/UI rejection tests PASS. No root/marketing files edited in this follow-up, no deployment or activation. When porting marketing later, copy limits.ts and add lib/requestPhotos/limits.ts to prepare-shared.mjs's allowlist along with the changed RequestPhotos.tsx. Full reseal required before release.
