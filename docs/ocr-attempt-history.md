# Durable OCR attempt history

This feature retains evidence; it does not repair OCR or change payment eligibility.

## Storage and access

- `public.ocr_attempts`: indexed, workspace-scoped summaries. Owner/admin read access.
- `public.ocr_attempt_diagnostics`: separate temporary JSON payloads, loaded only on explicit detail expansion or export.
- `trimax_save_ocr_attempt`: authenticated owner/admin RPC. Identity and retry lineage cannot change; completed phase-2 records cannot be overwritten. Server extraction checkpoints use phase 1 and cannot overwrite final client resolution.
- IndexedDB `trimax-ocr-outbox-v1`: separate metadata and diagnostic stores, atomically committed before network sync. Unsynced records retry on mount/online. Device-only saves are labeled clearly; they do not claim server durability. If both local storage and remote persistence fail, the page warns the operator to retain the open report.
- Each normal scan/retry uses a new UUID. A newly captured/uploaded document starts a new family. Retrying the current image links the preceding and original attempts.
- An interrupted request retains its start record and any server extraction checkpoint. The hourly cleanup marks unfinished attempts older than one hour as interrupted; it does not invent a completed business resolution.

## Retention

Permanent compact summaries include build SHA, scan/source/lineage, result, parsed headers, row/resolution counts, reconciliation, eligibility, bounded row/source notes, reasons and duration. Summary JSON is limited to 16 KiB.

Successful completed attempts retain no verbose payload. Other attempts retain diagnostics for 30 days from creation. Owner/admin pinning preserves an available payload until unpinned. Unpinning does not reset its expiry. Expired diagnostic payloads become unreadable through RLS immediately; `trimax-ocr-diagnostics-retention` physically removes them hourly at minute 25. Summaries remain. Unsynced device payloads expire after 30 days when read or synchronized; device summaries remain pending until sync.

No debug images are stored. The existing payment attachment/upload function is unchanged and retains its canonical submitted remittance image. Debug `.txt` files are generated in browser memory on demand, never permanently duplicated in storage. iOS sharing is a separate button after file creation to preserve its required user gesture.

## Operator workflow

Payments → Recent Scans (also available with no payable invoices). The list fetches at most 30 summaries, newest first. Retries display their original ID. Select a summary; expand What Trimax Saw / Candidate Decisions / Raw Diagnostics only when needed. Copy Failure Summary requires no verbose fetch. Create Debug File loads the retained report and exposes Download / Share. Pin for Debugging prevents cleanup of the retained case.

Existing Copy/Share Full Diagnostics controls read the retained report on demand. After a durable handoff, the active review retains its immutable decision fields but releases verbose observation copies.

## Expected storage footprint (estimates, not production measurements)

- Typical five-row summary: roughly 1–4 KiB JSON, plus row/index overhead; enforced JSON ceiling 16 KiB. 1,000 typical summaries: roughly 1–4 MiB before overhead.
- Failed/review payload: roughly 0.1–2 MiB uncompressed depending on OCR passes/tokens/database candidates; enforced JSON ceiling 16 MiB. PostgreSQL may compress large JSON. 100 retained failures: roughly 10–200 MiB uncompressed, bounded by 30-day retention unless pinned.
- Canonical submitted image: typically about 0.1–2 MB depending on source/crop; existing bucket limit 8,000,000 bytes. This feature adds zero image copies.
- Storage failures/oversize payloads are surfaced as device-only or unsuccessful saves; the operator must not interpret these as server confirmation.

## Verification

`npm test` includes actual React history lazy-loading/export tests, client outbox reload/offline/sync tests, server checkpoint preservation, and real OCR retry stale-response isolation. It also runs unchanged golden fixtures A–E and OCR/duplicate/reconciliation regressions. Payment image function bytes are locked to the previous released workflow. The SQL regression executes inside a rollback transaction to check terminal immutability, retry linkage, success payload deletion, pin/expiry behavior, summary survival and authentication.

Physical iPhone PWA acceptance remains necessary: scan once, wait for Attempt saved, close/reopen the PWA, open Recent Scans, create a debug file and attach/share it. No physical OCR success is implied by this observability feature.
