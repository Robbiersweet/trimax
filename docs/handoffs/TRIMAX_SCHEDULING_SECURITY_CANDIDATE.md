# Scheduling security candidate validation

Status: candidate only; production ACL/schema/token/deployment unchanged.

## Caller audit

Audited current production `pg_get_functiondef`, ACLs, triggers and RLS policies plus sealed rc10 source. All 15 functions are owned by postgres. Their existing explicit ACL grants PUBLIC, anon, authenticated and service_role EXECUTE.

| Function | Required invocation | Retained client EXECUTE |
|---|---|---|
| get_trimax_storage_health(text) | settings page authenticated owner/admin; body verifies membership | authenticated |
| trimax_can_access_property(uuid,text) | authenticated property RLS | authenticated |
| trimax_can_create_property_queue(uuid,text) | authenticated Queue INSERT policy | authenticated |
| trimax_can_manage_property_queue(uuid,text) | authenticated Queue UPDATE policy | authenticated |
| trimax_can_read_business(uuid) | authenticated businesses SELECT policy | authenticated |
| trimax_current_user_email() | membership/property helper nesting and authenticated RLS | authenticated |
| trimax_has_business_access(uuid) | authenticated membership RLS | authenticated |
| trimax_has_business_role(uuid,text[]) | authenticated role checks; nested admin/property helpers | authenticated |
| trimax_is_business_admin(uuid) | authenticated OCR diagnostics and RLS; nested postgres-definer OCR RPCs | authenticated |
| set_job_session_totals() | job_sessions BEFORE INSERT/UPDATE trigger | none |
| set_property_units_updated_at() | property_units BEFORE UPDATE trigger | none |
| set_updated_at() | invoices BEFORE UPDATE trigger | none |
| trimax_preserve_capture_pair() | ocr_attempts BEFORE UPDATE trigger | none |
| trimax_preserve_capture_handoff() | ocr_attempt_diagnostics BEFORE UPDATE trigger | none |
| trimax_preserve_canonical_optical() | ocr_attempt_optical BEFORE UPDATE trigger | none |

No direct service_role caller exists in the audited application/worker source. The application RPC callsites are `src/app/settings/page.tsx` (storage health) and `src/app/lib/ocrDebugServer.ts` (admin helper), both authenticated user clients. OCR workers use anon gateway credentials plus narrowly scoped opaque worker keys. Nested calls to the admin helper execute under existing postgres SECURITY DEFINER RPCs; revoking the gateway's direct helper EXECUTE does not revoke the owner's call. No anon/intake caller needs these 15 functions. No function body changes.

The six trigger bodies were exercised in a disposable transaction by authenticated without EXECUTE. Timestamps and duration calculation succeeded; canonical pairing, handoff and optical image were preserved. Trigger fixtures are isolated test tables bound to the exact production function bodies; the optical check reads a synthetic row in the reconstructed production-schema ocr_attempts table.

## Database reproduction

Private production catalog metadata: `%LOCALAPPDATA%/Trimax/scheduling-security-release/production-catalog.json`. No customer rows/image bytes/credentials. Production PostgreSQL 17.6. Disposable `@electric-sql/pglite@0.3.14` matches the PostgreSQL 17 catalog; the existing general SQL test runtime is PostgreSQL 18 and is not changed. All five rc10 baseline hashes reproduce byte-for-byte before migrations. ACL ordering is preserved because catalog-v1 hashes textual ACLs.

Production postgres/public default privileges are also reproduced before creating new objects. These defaults are not covered by the existing-object fingerprint. They grant postgres/anon/authenticated/service_role table, sequence and function defaults; explicit scheduling revokes remain effective. No production default privileges are changed.

Order: 20261012 ACL hardening, 20261009 foundation, 20261010 Phase 2, 20261011 runtime. No business seeding/activation. Expected fingerprints are pinned in `release/evidence/scheduling-database-expected.json`. Trigger fingerprint remains unchanged.

## Disposable results

- Exact rc10 baseline catalog: PASS.
- Three intended effective intake RPCs only: PASS. Complete signature allowlist, not name-only.
- Direct public table/view access for intake: denied.
- Six trigger invocations without client EXECUTE: PASS.
- Synthetic authorized property manager: Queue work request insertion and property/unit/business reads PASS; unrelated property/business denied; anon/intake Queue/helpers denied.
- Scheduling SQL/RLS, request idempotency, outbox/capability/review: PASS in isolated synthetic database.
- Job session integrity/crew: PASS.
- Release transition: exact pinned prior DB accepted only PREDEPLOYMENT with matching independently observed serving prior web; mixed fingerprints rejected; POSTDEPLOYMENT requires candidate exactly.

## Rollout boundaries

No OCR recognition, models, payment application, capture, auth or manager business logic changes. Candidate carries rc10 web functionality plus scheduling schema/security release machinery only; scheduling web activation remains a separate task. Production flag remains disabled/unset. Worker startup remains strict; only gate classification understands the approved prior database transition.

Production migration must execute as postgres, matching rehearsal ownership/defaults. Before mutation: fresh checksums, fingerprints, healthy worker evidence, clean sealed candidate and full predeployment gate. Use one transaction for all reviewed DDL and abort before commit on fingerprint mismatch; no partial migration rollout. Do not leave old workers running against a changed DB contract. No migration is approved for execution merely by this local report.

## RPC input-byte diagnosis and corrected rehearsal

Rollback-only production export proved 41 identities/security/ACL/config fields unchanged. Exactly four new bodies differ by newline encoding: trimax_public_request_status (7 CR bytes), trimax_public_scheduling_config (16), trimax_review_public_service_request (18), trimax_submit_public_service_request (35). Local bodies contain LF; the Windows SQL-editor transport stores CRLF. Every other byte matches. These newlines are SQL whitespace outside quoted literal values; no semantic SQL change. PostgreSQL pretty-printer wrapper newlines remain LF in both environments.

The earlier LF-to-LF experiment did not test the actual LF-to-CRLF transformation. Full CSV export is authoritative; accessibility snapshots collapse spaces and cannot supply byte evidence.

Rehearsal now explicitly applies reviewed migration input with CRLF, matching the observed production transport. No pg_get_functiondef normalization, fingerprint weakening, function-body logic edit, or production RPC change. All 41 fingerprint input hashes are independently pinned from rollback-only production export in release/evidence/rc11-production-rpc-inputs.json. A CRLF rehearsal matches every complete catalog row and every full function metadata object against that private export. Two clean runs reproduce all five hashes. New RPC fingerprint: 5424c9497b7b2d9ecd305091edd9cf8cccc97f4d9bf3a055879d2d92ccd1fc24. All other fingerprints unchanged.

Any future deployment mechanism must send the same migration input bytes and retain the exact postcondition guard. Do not normalize historical definitions or adopt this hash without the proven input contract. Production remains rc10; no rollout authorized in this diagnosis task.
