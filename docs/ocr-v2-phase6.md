# Phase 6 shadow integration

## Authority and isolation

Legacy extraction route and payment/resolver business rules are unchanged. The
owner/admin client schedules a separate queue write after the legacy result and
attempt save. The worker runs outside Vercel, using the frozen WSL recognizers.
No shadow return value is consumed by the payment component. Worker credentials
can only claim/complete jobs for one business; they are not Supabase service keys.
Every shadow summary/result is forced to `paymentCanApply: false` in SQL.

`ocr_shadow_flags.enabled` and `native_still` default false. Missing migration,
unavailable configuration, non-admin role, or a different workspace all fail
closed. The database rechecks the flag when enqueueing, claiming and completing.
Owner/admin controls are inside the existing OCR Debug Queue. Disabling needs no
migration or deploy. Refresh Payments to immediately refresh its capture flag.

## Capture

The optional native input uses `accept="image/*" capture="environment"`.
Take Photo and existing-photo selection converge on `captureCheckImage`, show a
blob preview, then use the existing legacy still preparation/extraction path.
The exact prepared bytes sent to legacy are also hashed and queued for v2.
The shared-input hash is checked in SQL and again before worker inference.
V2 has its own documented optical normalization; the normalized hash is recorded
separately. This is shared input, not a claim of identical engine preprocessing.

There is no custom camera overlay for flagged native captures. Native iPhone
camera UI and indicator behavior still require fresh physical verification.
Browser timestamps measure camera-open request, file return, preview paint
opportunity, and legacy completion. A paint opportunity is not proof of visible
rendering. Browser JS cannot observe the iPhone camera indicator; that metric is
explicitly null, never inferred from file return. Queued worker duration is
separate from legacy duration and should not be described as total iPhone time.

## Storage

- `ocr_shadow_jobs` links existing legacy/shadow `ocr_attempts` by capture ID/hash.
- Raw results use `ocr_attempt_diagnostics`; optical evidence uses the existing
  `ocr_attempt_optical` store. Identical retained legacy pixels are referenced.
  If legacy pixels expire while a shadow is pinned, a trigger transfers the copy.
- The existing 30-day diagnostic cleanup and pinning apply. Worker-local crops
  are removed after processing, including failures; no additional image archive.
- The queue is idempotent per legacy attempt. Leases prevent stale completions.
  Completed inference is immutable. Shadow failures appear in the existing queue.
- Existing stable URLs and Debug File/Failure Summary remain in use.

## Worker setup (not a production-authoritative OCR service)

Apply `supabase/sql/2026-09-21-ocr-shadow.sql` after reviewing its security grants.
Provision a cryptographically random worker credential privately, store only its
SHA-256 in `ocr_shadow_flags.worker_key_hash`, and configure the local worker
outside the repository. Never use a service-role key. Required private JSON:

```json
{
  "supabaseUrl": "project Supabase URL",
  "anonKey": "public project key",
  "businessId": "owner/admin business UUID",
  "workerKey": "private random credential",
  "privateRoot": "absolute private temporary workspace",
  "wslDistribution": "Ubuntu",
  "python": "/home/robbi/trimax-ocr/benchmark-venv/bin/python"
}
```

Run `node --experimental-strip-types scripts/ocr-v2/shadow-worker.cjs PRIVATE_CONFIG`.
`--once` performs one poll. This worker uses Node on Windows plus the established
WSL model packages. It does not install a service or alter the production runtime.
This computer must be awake; queued work pauses while it is unavailable. There is
no automatic startup after reboot. Do not enable the feature without a configured
and tested worker. Models/version hashes are recorded by the frozen recognizer
adapter. The separate worker has no database credential permitting payment writes.

## Fresh acceptance

Historical fixtures and smoke tests count as zero fresh acceptance documents.
The attempt detail provides a separate, explicit human verification form, blank
by default. It requires business verification, fresh/unseen confirmation, one
stable independent-document ID, exact invoice record IDs/numbers, units, cents,
total, check/date, customer/payor, and final payment outcome. Recaptures share an
independent-document ID. SQL permits truth only after inference is frozen and
records its immutable result hash. Workers never receive this truth table.

Export diagnostics and verified truth for scoring only. Validate with
`shadow/acceptance.ts`, supplying historical source hashes from the private
manifest. Freeze the acceptance score before using the existing private dataset
intake. There is no automatic training import. Collect at least five independent
fresh documents as they naturally arrive; do not fabricate acceptance evidence.

Promotion remains a separate decision. Zero wrong automatic rows/documents is
mandatory. Review fallback is acceptable; no flag promotes v2 to payment authority.

## Verification

`shadow-regression.cjs`: role/default/rollback, nonblocking failure isolation,
shared-hash mismatch, immutable input, unknown review, derived invoice cells.
`shadow-sql-regression.cjs PRIVATE_PGLITE_INSTALL`: execute migration in a disposable
Postgres-compatible DB and exercise ownership, leases, null/wrong credentials,
flag rollback, one frozen completion, payment non-authority, anonymous access.
`shadow-worker-smoke.cjs`: real WSL models behind a local mock queue; synthetic,
not fresh acceptance. It must never call production payment APIs.

Production activation, browser click-through, and physical UX remain separate
release checks; a successful mock transport is not evidence of those checks.
