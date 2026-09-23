# Legacy OCR background processing

The synchronous extraction route is limited to 60 seconds on Vercel. Its old
checkpoint runs after extraction returns, so a platform termination can prevent
the response checkpoint. A 504 alone does not prove exactly when its underlying
process stopped. The new capture flow does not depend on that process surviving.

## Contract

1. Existing canonical upload commits the image and hash first.
2. Authenticated `POST /api/payments/ocr-jobs` enqueues the existing attempt and
   returns 202. The database checks workspace, creator, owner/admin, immutable
   capture reference, and worker enablement. Attempt ID is the job primary key.
3. A separate Node worker claims a fenced three-minute lease, renewed every
   30 seconds. It invokes the same legacy extraction route locally, without
   a browser token or Vercel HTTP lifetime. OCR budgets and algorithms are unchanged.
4. Orientation, completed passes, and final extraction are persisted. An old
   lease cannot overwrite a reclaimed job. A crash leaves an expired lease that
   can be claimed again. A browser disconnection does not cancel the worker.
5. Short authenticated GET requests return queued/running/review/failed and the
   persisted extraction. Payments lists saved jobs on reload. Opening one uses
   its original attempt and canonical image, not a new capture or OCR job.
6. The existing client review resolver runs against current workspace records
   when the saved evidence is opened. No stale background snapshot grants payment
   eligibility. The existing explicit shared-money review action remains intact.

## Credentials and authority

`ocr_legacy_workers` stores only a hash of a separate workspace-scoped key.
The worker can call only the legacy claim/update RPCs with that key. Those RPCs
write OCR jobs, attempts, and diagnostics, never invoices, payments, attachments,
or activity. It has no service-role key. The v2 shadow credential and resolver
are unchanged. Diagnostic replays remain barred from payment application after
reload as well as during the original view.

Keep the private worker configuration outside Git:

```json
{"supabaseUrl":"...","anonKey":"...","businessId":"...","workerKey":"..."}
```

Run from the deployed commit's repository:

```powershell
node scripts/ocr-legacy-worker.cjs PRIVATE_CONFIG
```

This computer must be running for legacy processing. When unavailable, canonical
images and queued jobs remain stored and the UI shows processing pending. Disable
new claims/enqueues by setting this workspace's `ocr_legacy_workers.enabled` to
false. Existing results remain readable. This does not disable v2 or change its
credential. Re-enable and restart the worker to resume queued/expired jobs.

## Retention and observability

Jobs depend on the existing diagnostics row with cascading deletion, preserving
the existing expiry/pin policy. They reference canonical bytes rather than
duplicating images. Timings distinguish capture storage, enqueue, claim,
orientation, individual completed passes, OCR completion, and review readiness.
Client diagnostics record initial enqueue latency separately from polling wait.
Payment review resolution is client-side and recorded through the existing
terminal attempt contract; background extraction alone cannot authorize payment.

## Validation

`node scripts/ocr-legacy-job-regression.cjs` covers transport and worker failure
isolation. `--long` additionally keeps the background job alive for 65 real seconds.
The SQL regression runs in a rollback-only transaction and checks idempotent
enqueue, image access, checkpoint durability, stale lease rejection/reclaim,
credential isolation, and durable result retrieval. Retained-image and production
verification evidence stays in the private task directory, outside Git.
