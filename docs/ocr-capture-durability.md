# Capture durability before OCR handoff

`trimax_store_ocr_capture` commits the hash-verified canonical image, its attempt reference, and bounded recovery metadata. It never calls shadow enqueue. `trimax_resume_ocr_handoff` is a separate authenticated owner/admin request using the saved snapshot and canonical reference. It takes the attempt row lock; the existing unique legacy-attempt job key prevents duplicate jobs after a lost response. The worker's scope and payment authority are unchanged.

Legacy extraction starts after the canonical acknowledgement and never waits for shadow enqueue. Shadow failures leave `shadowHandoffState=handoff_pending`. Recent Scans and the Debug Queue expose the saved/pending state and a retry action. Reload recovery opens the saved capture without uploading bytes or creating another attempt. This diagnostic recovery cannot apply a payment.

Before acknowledgement, the existing original File and prepared image stay in the current Payment Workspace session. Retry Upload captures the same prepared bytes and attempt ID. It does not rerun recognition/preparation or persist private images to browser storage. Closing/reloading before acknowledgement can still lose the local photo; the UI explicitly asks the user to keep the page open. After acknowledgement, server recovery survives reload. On-device Photos cannot be inspected from another computer.

Acknowledged captures and pending handoff metadata survive terminal diagnostic replacement and legacy success, within the existing 30-day expiry/pinning policy. Cleanup does not falsely terminalize recoverable captures after an hour. Disabling shadow still prevents new processing; pending captures can resume when re-enabled. No timeout setting or recognition/business rule changes.

## Verification

- `scripts/ocr-v2/canonical-sql-regression.cjs <private PGlite package directory> <private JPEG>` exercises the actual migration, SQLSTATE 57014 cancellation, independent image commit, lost-response deduplication, late diagnostics, offline worker, restart/reopen, authorization, immutable pairing and disabled payment authority.
- `npm run test:stabilization` executes the real client retry closure with 57014/restart/503/520/521 failures, same-image/same-attempt checks, and a hung shadow enqueue that cannot block legacy.
- Production replay must use labeled synthetic/non-payment diagnostics; do not interrupt the production database or call payment application endpoints.

The earlier lost physical capture is not recoverable from server evidence. Any retained original on the iPhone can be reused through Choose Existing Photo; another scan is only needed if that original is unavailable.
